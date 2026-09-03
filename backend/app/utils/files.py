"""
Secure file upload handling for homework submissions and vocabulary parsing.

Security measures:
- Only a fixed allow-list of extensions/content-types is accepted.
- Executable/script file types are explicitly blocked.
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

# Files allowed for homework attachments (teacher & student uploads)
ALLOWED_CONTENT_TYPES = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/heic": ".heic",
    "application/pdf": ".pdf",
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/vnd.ms-excel": ".xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "application/vnd.ms-powerpoint": ".ppt",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/m4a": ".m4a",
    "audio/x-m4a": ".m4a",
    "audio/mp4": ".m4a",
    "audio/aac": ".m4a",
    "audio/webm": ".webm",
    "audio/ogg": ".ogg",
    "text/csv": ".csv",
    "text/plain": ".txt",
}

# Files allowed for vocabulary document parsing (teacher uploads only)
VOCAB_PARSE_CONTENT_TYPES = {
    "application/pdf": ".pdf",
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "text/plain": ".txt",
    "text/csv": ".csv",
    "application/csv": ".csv",
    "application/vnd.ms-excel": ".csv",
}

# Extensions that are NEVER accepted regardless of claimed content-type.
BLOCKED_EXTENSIONS = {
    ".exe", ".bat", ".cmd", ".msi", ".scr", ".ps1", ".sh", ".vbs",
    ".pif", ".com", ".reg", ".jar", ".py", ".rb", ".php", ".js",
}


def _assert_safe_extension(filename: str) -> None:
    """Raise 415 if the original filename ends with a blocked extension."""
    if not filename:
        return
    suffix = Path(filename).suffix.lower()
    if suffix in BLOCKED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"File type '{suffix}' is not allowed for security reasons",
        )


def get_upload_root() -> Path:
    root = Path(settings.UPLOAD_DIR).resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


async def save_submission_file(file: UploadFile, student_id: uuid.UUID) -> tuple[str, str, str, int]:
    """
    Validates and streams the upload to disk in chunks.
    Returns (relative_path, original_name, content_type, size_bytes).
    """
    _assert_safe_extension(file.filename or "")

    content_type = file.content_type or ""
    extension = ALLOWED_CONTENT_TYPES.get(content_type)
    if not extension:
        ext = Path(file.filename or "").suffix.lower()
        if ext in set(ALLOWED_CONTENT_TYPES.values()):
            extension = ext
        else:
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail="Unsupported file type. Allowed: PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, JPG, PNG, MP3, WAV",
            )

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
    original_name = Path(file.filename or "upload").name
    return relative_path, original_name, content_type, total_size


async def read_vocab_file_bytes(file: UploadFile) -> tuple[bytes, str, str]:
    """
    Validates and reads a vocabulary document (PDF/DOCX/TXT/CSV) for text extraction.
    Returns (raw_bytes, original_filename, content_type).
    """
    _assert_safe_extension(file.filename or "")

    max_bytes = 20 * 1024 * 1024  # 20MB limit for vocab files
    chunks = []
    total = 0
    chunk_size = 1024 * 1024
    while chunk := await file.read(chunk_size):
        total += len(chunk)
        if total > max_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="Vocabulary file exceeds the 20MB limit",
            )
        chunks.append(chunk)

    raw = b"".join(chunks)
    original_name = Path(file.filename or "vocab").name
    return raw, original_name, file.content_type or ""


async def save_assignment_file(file: UploadFile, group_id: uuid.UUID) -> tuple[str, str, str, int]:
    """
    Validates and streams teacher assignment attachment to disk in chunks.
    Stores in uploads/assignments/<group_id>/<uuid>.<ext>.
    Returns (relative_path, original_name, content_type, size_bytes).
    """
    _assert_safe_extension(file.filename or "")

    content_type = file.content_type or ""
    extension = ALLOWED_CONTENT_TYPES.get(content_type)
    if not extension:
        ext = Path(file.filename or "").suffix.lower()
        if ext in set(ALLOWED_CONTENT_TYPES.values()):
            extension = ext
        else:
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail="Unsupported file type. Allowed: PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, JPG, PNG, MP3, WAV",
            )

    group_dir = get_upload_root() / "assignments" / str(group_id)
    group_dir.mkdir(parents=True, exist_ok=True)

    safe_filename = f"{uuid.uuid4().hex}{extension}"
    destination = group_dir / safe_filename

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
    original_name = Path(file.filename or "assignment_file").name
    return relative_path, original_name, content_type, total_size


def parse_vocab_csv(csv_content: str) -> list[tuple[str, str]]:
    """
    Parses CSV content formatted as:
    word,translation
    achieve,erishmoq

    Handles UTF-8 BOM, whitespace, CRLF, quoted values, and duplicates.
    """
    import csv

    if csv_content.startswith('\ufeff'):
        csv_content = csv_content[1:]

    csv_content = csv_content.replace('\r\n', '\n').replace('\r', '\n')
    lines = [line.strip() for line in csv_content.splitlines() if line.strip()]
    if not lines:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Vocabulary CSV file is empty")

    reader = csv.reader(lines, skipinitialspace=True)
    pairs = []
    seen = set()

    for idx, row in enumerate(reader):
        if not row or len(row) < 2:
            continue
        word = row[0].strip().strip('"\'')
        translation = row[1].strip().strip('"\'')

        # Skip header row
        if idx == 0 and word.lower() in ("word", "term", "english", "english_word") and translation.lower() in ("translation", "meaning", "uzbek", "definition"):
            continue

        if not word or not translation:
            continue

        key = word.lower()
        if key not in seen:
            seen.add(key)
            pairs.append((word, translation))

    if not pairs:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No valid word-translation pairs found in CSV")

    return pairs


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


ALLOWED_AVATAR_TYPES = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}


async def save_avatar_file(file: UploadFile, user_id: uuid.UUID) -> tuple[str, str, int]:
    """
    Validates and saves a profile picture to uploads/profiles/<user_id>/avatar.<ext>.
    Only allows JPEG, PNG, WEBP up to 5MB.
    Returns (relative_path, content_type, size_bytes).
    """
    _assert_safe_extension(file.filename or "")

    content_type = file.content_type or ""
    extension = ALLOWED_AVATAR_TYPES.get(content_type)
    if not extension:
        ext = Path(file.filename or "").suffix.lower()
        if ext in set(ALLOWED_AVATAR_TYPES.values()):
            extension = ext
        else:
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail="Invalid image format. Allowed formats: JPG, PNG, WEBP",
            )

    profile_dir = get_upload_root() / "profiles" / str(user_id)
    profile_dir.mkdir(parents=True, exist_ok=True)

    # Clean up any existing avatar in this directory
    for existing in profile_dir.glob("avatar.*"):
        existing.unlink(missing_ok=True)

    destination = profile_dir / f"avatar{extension}"

    max_bytes = 5 * 1024 * 1024  # 5MB max for avatars
    total_size = 0
    chunk_size = 256 * 1024  # 256KB

    with destination.open("wb") as out_file:
        while chunk := await file.read(chunk_size):
            total_size += len(chunk)
            if total_size > max_bytes:
                out_file.close()
                destination.unlink(missing_ok=True)
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail="Avatar image exceeds the 5MB limit",
                )
            out_file.write(chunk)

    relative_path = str(destination.relative_to(get_upload_root()))
    return relative_path, content_type, total_size


def resolve_profile_avatar(relative_path: str) -> Path:
    """Resolves profile avatar safely from uploads."""
    return resolve_submission_file(relative_path)


