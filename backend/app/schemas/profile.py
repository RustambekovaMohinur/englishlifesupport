import uuid
from typing import Any
from pydantic import BaseModel, Field


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
    group_name: str | None = None
    english_level: str | None = None
    approval_status: str | None = None
    total_stars: int = 0
    total_lightning: int = 0


class UserProfileUpdate(BaseModel):
    first_name: str | None = Field(default=None, max_length=128)
    last_name: str | None = Field(default=None, max_length=128)
    full_name: str | None = Field(default=None, max_length=255)
    telegram_username: str | None = Field(default=None, max_length=64)
    phone: str | None = Field(default=None, max_length=64)
    bio: str | None = Field(default=None, max_length=2000)
