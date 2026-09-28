import hashlib
import io
import logging
import uuid
from typing import Any

from PIL import Image
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.submission import Submission, SubmissionImage

logger = logging.getLogger(__name__)


def compute_dhash(img: Image.Image) -> str:
    """
    Computes a 64-bit difference hash (dHash) for an image.
    Resizes to 9x8, converts to grayscale, and compares horizontal adjacent pixel intensities.
    Returns a 16-character hex string.
    """
    try:
        # Normalize image orientation and convert to grayscale
        gray = img.convert("L")
        # Resize to 9 columns by 8 rows
        resized = gray.resize((9, 8), Image.Resampling.LANCZOS)
        pixels = list(resized.getdata())

        difference = [
            pixels[row * 9 + col] > pixels[row * 9 + col + 1]
            for row in range(8)
            for col in range(8)
        ]

        val = 0
        for i, bit in enumerate(difference):
            if bit:
                val |= (1 << i)
        return f"{val:016x}"
    except Exception as e:
        logger.warning("dHash computation failed: %s", e)
        return "0" * 16


def compute_dhash_rotations(img: Image.Image) -> list[str]:
    """
    Computes dHash for [0, 90, 180, 270] degrees rotation to handle rotated mobile uploads.
    """
    hashes = []
    for angle in [0, 90, 180, 270]:
        try:
            rotated = img if angle == 0 else img.rotate(angle, expand=True)
            hashes.append(compute_dhash(rotated))
        except Exception:
            hashes.append("0" * 16)
    return hashes


def hamming_distance(h1: str, h2: str) -> int:
    """
    Calculates Hamming distance between two 16-character hex strings (64 bits).
    """
    try:
        return bin(int(h1, 16) ^ int(h2, 16)).count("1")
    except Exception:
        return 64


def calculate_hash_similarity(
    h1: str,
    h2: str,
    h1_rotations: list[str] | None = None,
) -> float:
    """
    Calculates visual similarity percentage (0.0 to 1.0) between two 64-bit hashes.
    Checks rotations if provided.
    """
    if not h1 or not h2:
        return 0.0

    candidates = h1_rotations if h1_rotations else [h1]
    best_dist = 64
    for cand in candidates:
        dist = hamming_distance(cand, h2)
        if dist < best_dist:
            best_dist = dist

    return max(0.0, 1.0 - (best_dist / 64.0))


def compute_file_fingerprints_from_bytes(
    data: bytes,
    filename: str = "",
    content_type: str | None = None,
) -> tuple[str | None, str, list[str] | None]:
    """
    Computes (image_hash, file_sha256, rotation_hashes) for uploaded homework bytes.
    Extracts dHash from images or first-page images of PDFs.
    """
    if not data:
        return None, hashlib.sha256(b"").hexdigest(), None

    file_sha256 = hashlib.sha256(data).hexdigest()
    image_hash = None
    rotation_hashes = None

    is_image = (
        (content_type and content_type.startswith("image/"))
        or any(filename.lower().endswith(ext) for ext in [".jpg", ".jpeg", ".png", ".webp", ".heic", ".bmp", ".gif"])
    )

    if is_image:
        try:
            with Image.open(io.BytesIO(data)) as img:
                image_hash = compute_dhash(img)
                rotation_hashes = compute_dhash_rotations(img)
                return image_hash, file_sha256, rotation_hashes
        except Exception as e:
            logger.debug("Could not parse image for dHash: %s", e)

    # Check if PDF with embedded image
    is_pdf = (content_type and "pdf" in content_type) or filename.lower().endswith(".pdf")
    if is_pdf:
        try:
            import pypdf
            reader = pypdf.PdfReader(io.BytesIO(data))
            if reader.pages:
                page = reader.pages[0]
                if hasattr(page, "images") and page.images:
                    first_img = page.images[0]
                    with Image.open(io.BytesIO(first_img.data)) as img:
                        image_hash = compute_dhash(img)
                        rotation_hashes = compute_dhash_rotations(img)
                        return image_hash, file_sha256, rotation_hashes
        except Exception as e:
            logger.debug("PDF image extraction for dHash: %s", e)

    return image_hash, file_sha256, rotation_hashes


async def check_duplicate_submission(
    db: AsyncSession,
    submission: Submission,
    uploaded_fingerprints: list[tuple[str | None, str, list[str] | None]],
) -> tuple[bool, float | None, uuid.UUID | None, str | None]:
    """
    Cross-checks the newly uploaded files/images against all other peer submissions
    for the same assignment (or cohort cycle).

    Returns:
        (is_suspicious, similarity_score, duplicate_of_submission_id, flag_reason)
    """
    if not uploaded_fingerprints:
        return False, None, None, None

    # Query all existing submissions for this assignment by other students
    stmt = (
        select(Submission)
        .options(
            selectinload(Submission.student),
            selectinload(Submission.images),
        )
        .where(
            Submission.assignment_id == submission.assignment_id,
            Submission.student_id != submission.student_id,
            Submission.is_archived.is_(False),
        )
    )
    res = await db.execute(stmt)
    peer_submissions = res.scalars().all()

    if not peer_submissions:
        return False, None, None, None

    best_similarity = 0.0
    best_peer_submission: Submission | None = None
    match_type = ""

    for peer in peer_submissions:
        # Collect peer's fingerprints: primary file and all attached images
        peer_fps: list[tuple[str | None, str | None]] = []
        if peer.image_hash or peer.file_sha256:
            peer_fps.append((peer.image_hash, peer.file_sha256))
        for p_img in peer.images:
            if p_img.image_hash or p_img.file_sha256:
                peer_fps.append((p_img.image_hash, p_img.file_sha256))

        for up_hash, up_sha, up_rots in uploaded_fingerprints:
            for p_hash, p_sha in peer_fps:
                # 1. Exact SHA-256 binary match (100% duplicate)
                if up_sha and p_sha and up_sha == p_sha:
                    best_similarity = 1.0
                    best_peer_submission = peer
                    match_type = "exact"
                    break

                # 2. Perceptual dHash visual similarity
                if up_hash and p_hash:
                    sim = calculate_hash_similarity(up_hash, p_hash, h1_rotations=up_rots)
                    if sim > best_similarity:
                        best_similarity = sim
                        best_peer_submission = peer
                        match_type = "visual"

            if best_similarity >= 1.0:
                break
        if best_similarity >= 1.0:
            break

    # Threshold for suspicious similarity: >= 85% (0.85)
    if best_similarity >= 0.85 and best_peer_submission is not None:
        peer_name = (
            best_peer_submission.student.full_name
            if best_peer_submission.student and best_peer_submission.student.full_name
            else "another student"
        )
        sim_pct = int(round(best_similarity * 100))
        if match_type == "exact" or best_similarity >= 0.999:
            reason = f"Exact duplicate file (100%) match with {peer_name}'s submission"
        else:
            reason = f"Highly similar ({sim_pct}%) visual match with {peer_name}'s submission"

        logger.info(
            "Anti-cheat flag: Submission %s matches peer submission %s (%s%%) by %s",
            submission.id,
            best_peer_submission.id,
            sim_pct,
            peer_name,
        )
        return True, round(best_similarity, 4), best_peer_submission.id, reason

    return False, None, None, None
