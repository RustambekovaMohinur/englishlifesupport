"""
Storage Service for English Life LMS.

Provides a clean abstraction for object storage with Backblaze B2 (S3-compatible)
and graceful local/database fallbacks.

Key guarantees:
1. Bucket remains private.
2. Credentials and secrets are never exposed, logged, or sent to frontend.
3. Operations are executed in a thread pool via asyncio.to_thread to avoid blocking FastAPI.
4. B2 upload must succeed before database metadata is created.
5. In production with STORAGE_BACKEND=b2, failures raise StorageError and never silently write binaries to database.
"""
import asyncio
import logging
from pathlib import Path
from typing import Optional, Tuple

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

from app.core.config import settings

logger = logging.getLogger("app.services.storage")


class StorageError(Exception):
    """Base exception for storage operations."""
    pass


class StorageService:
    def __init__(self):
        self._backend = (settings.STORAGE_BACKEND or "b2").lower().strip()
        self._bucket_name = (settings.B2_BUCKET_NAME or "").strip()
        self._endpoint_url = settings.B2_ENDPOINT
        self._key_id = settings.B2_KEY_ID
        self._application_key = settings.B2_APPLICATION_KEY
        self._s3_client = None

    @property
    def backend(self) -> str:
        import os
        return (os.getenv("STORAGE_BACKEND") or self._backend or "b2").lower().strip()

    @property
    def bucket_name(self) -> str:
        import os
        configured = (
            os.getenv("B2_BUCKET_NAME") or
            os.getenv("B2_BUCKET") or
            os.getenv("BACKBLAZE_BUCKET") or
            os.getenv("BACKBLAZE_BUCKET_NAME") or
            os.getenv("AWS_BUCKET_NAME") or
            self._bucket_name or
            "english-life-files"
        ).strip()
        if not configured or "r2" in configured.lower():
            return "english-life-files"
        return configured

    @property
    def endpoint_url(self) -> str:
        import os
        endpoint = (
            os.getenv("B2_ENDPOINT") or
            os.getenv("B2_ENDPOINT_URL") or
            os.getenv("BACKBLAZE_ENDPOINT") or
            os.getenv("BACKBLAZE_ENDPOINT_URL") or
            os.getenv("S3_ENDPOINT_URL") or
            self._endpoint_url or
            "https://s3.us-east-005.backblazeb2.com"
        ).strip().rstrip("/")
        if endpoint and not endpoint.startswith("http"):
            endpoint = f"https://{endpoint}"
        return endpoint

    @property
    def key_id(self) -> str:
        import os
        return (
            os.getenv("B2_KEY_ID") or
            os.getenv("B2_APPLICATION_KEY_ID") or
            os.getenv("B2_APP_KEY_ID") or
            os.getenv("BACKBLAZE_KEY_ID") or
            os.getenv("BACKBLAZE_APPLICATION_KEY_ID") or
            os.getenv("AWS_ACCESS_KEY_ID") or
            self._key_id or
            settings.B2_KEY_ID or
            ""
        ).strip()

    @property
    def application_key(self) -> str:
        import os
        return (
            os.getenv("B2_APPLICATION_KEY") or
            os.getenv("B2_APPLICATION_KEY_SECRET") or
            os.getenv("B2_APP_KEY") or
            os.getenv("B2_SECRET_ACCESS_KEY") or
            os.getenv("BACKBLAZE_APPLICATION_KEY") or
            os.getenv("BACKBLAZE_SECRET_KEY") or
            os.getenv("AWS_SECRET_ACCESS_KEY") or
            self._application_key or
            settings.B2_APPLICATION_KEY or
            ""
        ).strip()

    def _get_s3_client(self):
        key = self.key_id
        app_key = self.application_key
        if not key or not app_key:
            raise StorageError(
                "Backblaze B2 credentials (B2_KEY_ID / B2_APPLICATION_KEY) are not configured."
            )
        if self._s3_client is None:
            try:
                import os
                endpoint = self.endpoint_url
                region = "us-east-005"
                if ".backblazeb2.com" in endpoint:
                    parts = endpoint.replace("https://", "").replace("http://", "").split(".")[0]
                    if parts.startswith("s3."):
                        region = parts[3:]
                region = os.getenv("B2_REGION") or os.getenv("AWS_REGION") or region

                boto_config = Config(
                    signature_version="s3v4",
                    s3={"addressing_style": "path"},
                    retries={"max_attempts": 3, "mode": "standard"},
                    connect_timeout=15,
                    read_timeout=30,
                )
                self._s3_client = boto3.client(
                    "s3",
                    endpoint_url=endpoint,
                    aws_access_key_id=key,
                    aws_secret_access_key=app_key,
                    region_name=region,
                    config=boto_config,
                )
            except Exception as e:
                logger.error("Failed to initialize S3/B2 client: %s", type(e).__name__)
                raise StorageError(f"Storage client initialization error: {type(e).__name__}") from e
        return self._s3_client

    def _sync_upload(self, object_key: str, data: bytes, content_type: Optional[str] = None) -> str:
        norm_key = object_key.replace("\\", "/").lstrip("/")
        extra_args = {}
        if content_type:
            extra_args["ContentType"] = content_type

        client = self._get_s3_client()
        try:
            client.put_object(
                Bucket=self.bucket_name,
                Key=norm_key,
                Body=data,
                **extra_args,
            )
            return norm_key
        except Exception as e:
            msg = str(e)
            # Redact any accidental secret substring if present
            if self.application_key and self.application_key in msg:
                msg = msg.replace(self.application_key, "[REDACTED]")
            if self.key_id and self.key_id in msg:
                msg = msg.replace(self.key_id, "[REDACTED]")
            logger.error("B2 upload failed for key '%s': %s (%s)", norm_key, type(e).__name__, msg)
            raise StorageError(f"Upload to storage failed: {type(e).__name__} - {msg}") from e

    def _sync_download(self, object_key: str) -> Tuple[bytes, Optional[str]]:
        norm_key = object_key.replace("\\", "/").lstrip("/")
        client = self._get_s3_client()
        try:
            response = client.get_object(
                Bucket=self.bucket_name,
                Key=norm_key,
            )
            content_type = response.get("ContentType")
            data = response["Body"].read()
            return data, content_type
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code")
            if error_code in ("404", "NoSuchKey"):
                raise StorageError(f"Object not found in storage: {norm_key}") from e
            logger.error("B2 download error for key '%s': %s", norm_key, error_code)
            raise StorageError(f"Storage download error: {error_code}") from e
        except Exception as e:
            logger.error("Unexpected B2 download error for key '%s': %s", norm_key, type(e).__name__)
            raise StorageError(f"Unexpected storage download error: {type(e).__name__}") from e

    def _sync_delete(self, object_key: str) -> bool:
        norm_key = object_key.replace("\\", "/").lstrip("/")
        client = self._get_s3_client()
        try:
            client.delete_object(
                Bucket=self.bucket_name,
                Key=norm_key,
            )
            return True
        except Exception as e:
            logger.error("B2 delete error for key '%s': %s", norm_key, type(e).__name__)
            raise StorageError(f"Storage delete error: {type(e).__name__}") from e

    def _sync_exists(self, object_key: str) -> bool:
        norm_key = object_key.replace("\\", "/").lstrip("/")
        client = self._get_s3_client()
        try:
            client.head_object(Bucket=self.bucket_name, Key=norm_key)
            return True
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code")
            if error_code in ("404", "NoSuchKey"):
                return False
            logger.warning("B2 head_object error for key '%s': %s", norm_key, error_code)
            return False
        except Exception:
            return False

    @property
    def is_configured(self) -> bool:
        """Check if cloud storage credentials and endpoint are present."""
        return bool(self.key_id and self.application_key and self.endpoint_url)

    async def upload_file(self, object_key: str, data: bytes, content_type: Optional[str] = None) -> str:
        """Asynchronously upload file data to B2 with retry."""
        if not self.is_configured:
            raise StorageError("Backblaze B2 credentials (B2_KEY_ID / B2_APPLICATION_KEY) are not configured.")
        last_err = None
        for attempt in range(3):
            try:
                return await asyncio.to_thread(self._sync_upload, object_key, data, content_type)
            except Exception as e:
                last_err = e
                logger.warning("B2 upload attempt %d failed for key '%s': %s", attempt + 1, object_key, e)
                if attempt < 2:
                    await asyncio.sleep(0.5 * (attempt + 1))
        raise last_err

    async def safe_upload_file(self, object_key: str, data: bytes, content_type: Optional[str] = None) -> bool:
        """
        Attempts to upload to B2. If credentials are missing or network error occurs,
        returns False safely without raising an exception.
        """
        if not self.is_configured:
            return False
        try:
            await self.upload_file(object_key, data, content_type)
            return True
        except Exception as e:
            logger.warning("B2 upload failed for key '%s': %s. Falling back to local storage.", object_key, e)
            return False

    async def download_file(self, object_key: str) -> Tuple[bytes, Optional[str]]:
        """Asynchronously download file data from B2."""
        return await asyncio.to_thread(self._sync_download, object_key)

    async def delete_file(self, object_key: str) -> bool:
        """Asynchronously delete an object from B2."""
        return await asyncio.to_thread(self._sync_delete, object_key)

    async def file_exists(self, object_key: str) -> bool:
        """Asynchronously check if an object exists in B2."""
        return await asyncio.to_thread(self._sync_exists, object_key)


_storage_service: Optional[StorageService] = None


def get_storage_service() -> StorageService:
    global _storage_service
    if _storage_service is None:
        _storage_service = StorageService()
    return _storage_service
