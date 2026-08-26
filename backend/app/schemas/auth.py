import re
import uuid

from pydantic import BaseModel, Field, field_validator

from app.models.group import EnglishLevel
from app.models.user import UserRole


class RegisterRequest(BaseModel):
    username: str | None = Field(default=None, min_length=3, max_length=255)
    email: str | None = Field(default=None)
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=2, max_length=255)
    phone: str | None = Field(default=None, max_length=64, description="Telegram username or phone number")
    group_id: uuid.UUID = Field(description="Group the student joins during registration")

    @property
    def effective_username(self) -> str:
        return self.username or self.email or ""

    @field_validator("password")
    @classmethod
    def password_complexity(cls, v: str) -> str:
        if not re.search(r"[A-Za-z]", v) or not re.search(r"\d", v):
            raise ValueError("Password must contain at least one letter and one number")
        return v


class GroupPublicOut(BaseModel):
    """Public group info exposed to unauthenticated users during registration."""
    id: uuid.UUID
    name: str
    english_level: EnglishLevel
    schedule: str | None

    model_config = {"from_attributes": True}


class LoginRequest(BaseModel):
    username: str | None = Field(default=None)
    email: str | None = Field(default=None)
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class AccessTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class CurrentUser(BaseModel):
    id: uuid.UUID
    email: str
    username: str = ""
    role: UserRole
    is_active: bool

    model_config = {"from_attributes": True}
