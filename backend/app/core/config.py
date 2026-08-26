"""
Centralized application configuration.

All secrets and environment-specific values are loaded from environment
variables (via a local .env file in development). Nothing sensitive is
hardcoded here.
"""
from functools import lru_cache
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Database
    DATABASE_URL: str
    ASYNC_DATABASE_URL: str

    # JWT
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 14

    # CORS
    CORS_ORIGINS: str = "http://localhost:5173"

    # Uploads
    UPLOAD_DIR: str = "uploads"
    MAX_UPLOAD_SIZE_MB: int = 10

    # App
    ENVIRONMENT: str = "development"

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
