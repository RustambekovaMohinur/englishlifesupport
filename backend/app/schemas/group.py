import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.group import EnglishLevel


class GroupCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    english_level: EnglishLevel
    schedule: str | None = Field(default=None, max_length=255)
    telegram_chat_id: str | None = Field(default=None, max_length=64)
    telegram_chat_title: str | None = Field(default=None, max_length=255)
    telegram_sync_enabled: bool = False


class GroupUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    english_level: EnglishLevel | None = None
    schedule: str | None = Field(default=None, max_length=255)
    is_active: bool | None = None
    telegram_chat_id: str | None = Field(default=None, max_length=64)
    telegram_chat_title: str | None = Field(default=None, max_length=255)
    telegram_sync_enabled: bool | None = None


class GroupTelegramSync(BaseModel):
    telegram_chat_id: str | None = Field(default=None, max_length=64)
    telegram_chat_title: str | None = Field(default=None, max_length=255)
    telegram_sync_enabled: bool = True


class GroupOut(BaseModel):
    id: uuid.UUID
    name: str
    english_level: EnglishLevel
    schedule: str | None
    is_active: bool
    telegram_chat_id: str | None = None
    telegram_chat_title: str | None = None
    telegram_sync_enabled: bool = False
    telegram_last_synced_at: datetime | None = None
    student_count: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}
