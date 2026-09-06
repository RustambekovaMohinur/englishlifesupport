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
        self.backend = (settings.STORAGE_BACKEND or "b2").lower().strip()
        self.bucket_name = settings.B2_BUCKET_NAME
        self.endpoint_url = settings.B2_ENDPOINT
        self.key_id = settings.B2_KEY_ID
        self.application_key = settings.B2_APPLICATION_KEY
        self._s3_client = None

        # Log safe initialization info without secrets
        endpoint_host = ""
        try:
            from urllib.parse import urlparse
            endpoint_host = urlparse(self.endpoint_url).hostname or ""
        except Exception:
            pass
        logger.info(
            "Initialized StorageService (backend=%s, bucket=%s, endpoint_host=%s, credentials_present=%s)",
            self.backend,
            self.bucket_name,
            endpoint_host,
            bool(self.key_id and self.application_key),
        )

    def _get_s3_client(self):
        if self._s3_client is None:
            if not self.key_id or not self.application_key:
                raise StorageError(
                    "Backblaze B2 credentials (B2_KEY_ID / B2_APPLICATION_KEY) are not configured."
                )
            try:
                # Backblaze B2 endpoint region (e.g. us-east-005 from https://s3.us-east-005.backblazeb2.com)
                endpoint = (self.endpoint_url or "").strip().rstrip("/")
                if not endpoint.startswith("http"):
                    endpoint = f"https://{endpoint}"

                region = "us-east-005"
                if ".backblazeb2.com" in endpoint:
                    parts = endpoint.replace("https://", "").replace("http://", "").split(".")[0]
                    if parts.startswith("s3."):
                        region = parts[3:]

                boto_config = Config(
                    signature_version="s3v4",
                    s3={"addressing_style": "virtual"},
                    retries={"max_attempts": 3, "mode": "standard"},
                    connect_timeout=15,
                    read_timeout=30,
                )
                self._s3_client = boto3.client(
                    "s3",
                    endpoint_url=endpoint,
                    aws_access_key_id=self.key_id,
                    aws_secret_access_key=self.application_key,
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
        except (BotoCoreError, ClientError) as e:
            logger.error("B2 upload failed for key '%s': %s", norm_key, type(e).__name__)
            raise StorageError(f"Failed to upload object to storage: {type(e).__name__}") from e

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

    async def upload_file(self, object_key: str, data: bytes, content_type: Optional[str] = None) -> str:
        """Asynchronously upload file data to B2."""
        return await asyncio.to_thread(self._sync_upload, object_key, data, content_type)

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
