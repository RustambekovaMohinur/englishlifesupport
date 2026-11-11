import uuid
from typing import Any
from pydantic import BaseModel, Field, field_validator


class UserProfileOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    role: str
    username: str
    email: str
    full_name: str
    first_name: str = ""
    last_name: str = ""
    phone: str | None = None
    telegram_username: str | None = None
    bio: str | None = None
    avatar_url: str | None = None
    stats: dict[str, Any] = Field(default_factory=dict)
    group_id: uuid.UUID | None = None
    group_name: str | None = None
    english_level: str | None = None
    teacher_id: uuid.UUID | None = None
    teacher_name: str | None = None
    approval_status: str | None = None
    total_stars: int = 0
    total_lightning: int = 0
    parent_phone: str | None = None
    parent_telegram_id: str | None = None
    parent_telegram_chat_id: str | None = None
    parent_name: str | None = None


class UserProfileUpdate(BaseModel):
    first_name: str | None = Field(default=None, max_length=128)
    last_name: str | None = Field(default=None, max_length=128)
    full_name: str | None = Field(default=None, max_length=255)
    username: str | None = Field(default=None, min_length=3, max_length=64)
    telegram_username: str | None = Field(default=None, max_length=64)
    phone: str | None = Field(default=None, max_length=64)
    bio: str | None = Field(default=None, max_length=2000)
    group_id: uuid.UUID | None = None
    parent_phone: str | None = Field(default=None, max_length=64)
    parent_telegram_id: str | None = Field(default=None, max_length=64)
    parent_telegram_chat_id: str | None = Field(default=None, max_length=64)
    parent_name: str | None = Field(default=None, max_length=255)

    @field_validator("group_id", mode="before")
    @classmethod
    def parse_group_id(cls, v: Any) -> uuid.UUID | None:
        if v is None or v == "" or str(v).strip() in ("", "null", "none"):
            return None
        if isinstance(v, uuid.UUID):
            return v
        try:
            return uuid.UUID(str(v).strip())
        except Exception:
            raise ValueError("Invalid group_id UUID format")


class ChangePasswordRequest(BaseModel):
    old_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=6, max_length=128)

