import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.deps import get_current_user
from app.models.user import User
from app.services.storage import StorageError, get_storage_service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["storage"])


@router.get("/api/storage/presigned-upload-url")
@router.get("/api/storage/presigned-upload-url/", include_in_schema=False)
@router.get("/storage/presigned-upload-url", include_in_schema=False)
@router.get("/storage/presigned-upload-url/", include_in_schema=False)
async def get_presigned_upload_url(
    file_name: str = Query(..., description="Original filename with extension"),
    file_type: str = Query("application/octet-stream", description="MIME content type"),
    current_user: User = Depends(get_current_user),
):
    """
    Generates a pre-signed PUT URL allowing the client to upload heavy files
    directly to Backblaze B2, completely bypassing backend memory and Neon database.
    """
    storage = get_storage_service()
    if not storage.is_configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Backblaze B2 storage is not configured on the server.",
        )

    clean_filename = Path(file_name).name
    # Strip any potential path traversal or dangerous characters
    safe_name = "".join(c for c in clean_filename if c.isalnum() or c in "._- ")
    if not safe_name:
        safe_name = "upload.bin"

    now_utc = datetime.now(timezone.utc)
    date_path = now_utc.strftime("%Y/%m")
    unique_prefix = uuid.uuid4().hex[:12]
    object_key = f"uploads/{date_path}/{unique_prefix}_{safe_name}"

    try:
        upload_url = await storage.get_presigned_upload_url(
            object_name=object_key,
            content_type=file_type,
            expires_in=3600,
        )
        public_url = storage.get_public_url(object_key)
        return {
            "upload_url": upload_url,
            "public_url": public_url,
            "object_key": object_key,
        }
    except StorageError as e:
        logger.error("Failed to generate B2 presigned upload URL: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate upload URL.",
        ) from e
