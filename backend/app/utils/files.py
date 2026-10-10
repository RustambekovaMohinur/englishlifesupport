"""
Secure file upload handling for homework submissions.

Security measures:
- Only a fixed allow-list of extensions/content-types is accepted.
- The original filename is NEVER used to build a path (prevents path
  traversal / overwrite attacks) - we generate a random UUID filename and
  keep the original name only as metadata for display/download.
- Files are stored per-student in a subdirectory keyed by the student's
  UUID, and access is authorized in the route layer (a student can only
  ever reach their own files; the teacher can reach all).
- Size is enforced both here and should also be enforced at the reverse
  proxy / ASGI server level in production (e.g. client_max_body_size).
"""
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile, status

from app.core.config import settings

ALLOWED_CONTENT_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/heic": ".heic",
    "application/pdf": ".pdf",
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
}


def get_upload_root() -> Path:
    root = Path(settings.UPLOAD_DIR).resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


async def save_submission_file(file: UploadFile, student_id: uuid.UUID) -> tuple[str, str, str, int]:
    """
    Validates and streams the upload to disk in chunks (so large files never
    fully buffer in memory). Returns (relative_path, original_name, content_type, size_bytes).
    """
    content_type = file.content_type or ""
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Unsupported file type. Allowed: JPG, PNG, WEBP, HEIC, PDF, DOC, DOCX",
        )

    extension = ALLOWED_CONTENT_TYPES[content_type]
    student_dir = get_upload_root() / "submissions" / str(student_id)
    student_dir.mkdir(parents=True, exist_ok=True)

    safe_filename = f"{uuid.uuid4().hex}{extension}"
    destination = student_dir / safe_filename

    max_bytes = settings.max_upload_size_bytes
    total_size = 0
    chunk_size = 1024 * 1024  # 1MB

    with destination.open("wb") as out_file:
        while chunk := await file.read(chunk_size):
            total_size += len(chunk)
            if total_size > max_bytes:
                out_file.close()
                destination.unlink(missing_ok=True)
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail=f"File exceeds the {settings.MAX_UPLOAD_SIZE_MB}MB limit",
                )
            out_file.write(chunk)

    relative_path = str(destination.relative_to(get_upload_root()))
    original_name = Path(file.filename or "upload").name  # strip any path components defensively
    return relative_path, original_name, content_type, total_size


def resolve_submission_file(relative_path: str) -> Path:
    """
    Resolves a stored relative path back to an absolute path, verifying the
    result is still inside the upload root (defense in depth against any
    path traversal that might have slipped into stored data).
    """
    root = get_upload_root()
    candidate = (root / relative_path).resolve()
    if root not in candidate.parents and candidate != root:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid file reference")
    if not candidate.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    return candidate
