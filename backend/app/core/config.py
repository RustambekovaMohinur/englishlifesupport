"""
Centralized application configuration.

All secrets and environment-specific values are loaded from environment
variables (via a local .env file in development). Nothing sensitive is
hardcoded here.
"""
from functools import lru_cache
from typing import List

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Database
    DATABASE_URL: str = ""
    ASYNC_DATABASE_URL: str = ""

    @model_validator(mode="after")
    def sync_database_urls(self) -> "Settings":
        db_url = self.DATABASE_URL.strip() if self.DATABASE_URL else ""
        async_db_url = self.ASYNC_DATABASE_URL.strip() if self.ASYNC_DATABASE_URL else ""

        if not async_db_url and db_url:
            async_db_url = db_url
        elif not db_url and async_db_url:
            db_url = async_db_url

        if async_db_url.startswith("postgres://"):
            async_db_url = "postgresql+asyncpg://" + async_db_url[len("postgres://"):]
        elif async_db_url.startswith("postgresql+psycopg2://"):
            async_db_url = "postgresql+asyncpg://" + async_db_url[len("postgresql+psycopg2://"):]
        elif async_db_url.startswith("postgresql://") and not async_db_url.startswith("postgresql+"):
            async_db_url = "postgresql+asyncpg://" + async_db_url[len("postgresql://"):]

        if db_url.startswith("postgres://"):
            db_url = "postgresql+psycopg2://" + db_url[len("postgres://"):]
        elif db_url.startswith("postgresql+asyncpg://"):
            db_url = "postgresql+psycopg2://" + db_url[len("postgresql+asyncpg://"):]
        elif db_url.startswith("postgresql://") and not db_url.startswith("postgresql+"):
            db_url = "postgresql+psycopg2://" + db_url[len("postgresql://"):]

        self.DATABASE_URL = db_url
        self.ASYNC_DATABASE_URL = async_db_url

        # Flexible resolution of B2 / S3 environment variable aliases
        import os
        if not self.B2_KEY_ID:
            self.B2_KEY_ID = (
                os.getenv("B2_KEY_ID") or
                os.getenv("B2_APPLICATION_KEY_ID") or
                os.getenv("B2_APP_KEY_ID") or
                os.getenv("BACKBLAZE_KEY_ID") or
                os.getenv("BACKBLAZE_APPLICATION_KEY_ID") or
                os.getenv("AWS_ACCESS_KEY_ID") or
                ""
            ).strip()

        if not self.B2_APPLICATION_KEY:
            self.B2_APPLICATION_KEY = (
                os.getenv("B2_APPLICATION_KEY") or
                os.getenv("B2_APPLICATION_KEY_SECRET") or
                os.getenv("B2_APP_KEY") or
                os.getenv("B2_SECRET_ACCESS_KEY") or
                os.getenv("BACKBLAZE_APPLICATION_KEY") or
                os.getenv("BACKBLAZE_SECRET_KEY") or
                os.getenv("AWS_SECRET_ACCESS_KEY") or
                ""
            ).strip()

        # Priority: explicit B2_BUCKET_NAME env var, else default to 'english-life-files'
        env_b2_bucket = os.getenv("B2_BUCKET_NAME")
        if env_b2_bucket and env_b2_bucket.strip():
            self.B2_BUCKET_NAME = env_b2_bucket.strip()
        else:
            self.B2_BUCKET_NAME = "english-life-files"

        if not self.B2_ENDPOINT or self.B2_ENDPOINT == "https://s3.us-east-005.backblazeb2.com":
            env_endpoint = (
                os.getenv("B2_ENDPOINT") or
                os.getenv("B2_ENDPOINT_URL") or
                os.getenv("BACKBLAZE_ENDPOINT") or
                os.getenv("BACKBLAZE_ENDPOINT_URL") or
                os.getenv("S3_ENDPOINT_URL")
            )
            if env_endpoint:
                self.B2_ENDPOINT = env_endpoint.strip()

        return self

    # JWT
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 14

    # CORS
    CORS_ORIGINS: str = (
        "http://localhost:5173,"
        "http://127.0.0.1:5173,"
        "http://localhost:3000,"
        "https://englishlifesupport-git-main-rustambekovamohinur.vercel.app,"
        "https://englishlifesupport.vercel.app"
    )
    CORS_ORIGIN_REGEX: str = r"^https:\/\/(.*\.)?(vercel\.app|onrender\.com)$"

    # Uploads & Storage
    UPLOAD_DIR: str = "uploads"
    MAX_UPLOAD_SIZE_MB: int = 10
    AUDIO_MAX_SIZE_MB: int = 20

    # Storage Backend (b2, database, or local)
    STORAGE_BACKEND: str = "b2"
    B2_ENDPOINT: str = "https://s3.us-east-005.backblazeb2.com"
    B2_BUCKET_NAME: str = "english-life-files"
    B2_KEY_ID: str = ""
    B2_APPLICATION_KEY: str = ""

    # App
    ENVIRONMENT: str = "development"
    OVERDUE_STAR_PENALTY: int = 20

    # Bootstrap teacher account (created on first startup if no teacher exists)
    BOOTSTRAP_TEACHER_EMAIL: str = "teacher@englishlife.uz"
    BOOTSTRAP_TEACHER_PASSWORD: str = "ChangeMe123!"
    BOOTSTRAP_TEACHER_NAME: str = "English Life Teacher"

    @property
    def cors_origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    @property
    def max_upload_size_bytes(self) -> int:
        return self.MAX_UPLOAD_SIZE_MB * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
