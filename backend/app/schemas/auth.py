import re
import uuid

from pydantic import BaseModel, Field, field_validator

from app.models.group import EnglishLevel
from app.models.user import UserRole


class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=30, pattern=r"^[A-Za-z0-9_]{3,30}$")
    email: str | None = Field(default=None)
    password: str = Field(min_length=8, max_length=128)
    first_name: str | None = Field(default=None, min_length=1, max_length=128)
    last_name: str | None = Field(default=None, min_length=1, max_length=128)
    full_name: str | None = Field(default=None, min_length=2, max_length=255)
    phone: str | None = Field(default=None, max_length=64, description="Telegram username or phone number")
    telegram_username: str | None = Field(default=None, max_length=64, description="Telegram username")
    group_id: uuid.UUID = Field(description="Group the student joins during registration")

    @property
    def effective_full_name(self) -> str:
        if self.first_name and self.last_name:
            return f"{self.first_name.strip()} {self.last_name.strip()}"
        if self.full_name:
            return self.full_name.strip()
        if self.first_name:
            return self.first_name.strip()
        return "Student"

    @property
    def effective_telegram(self) -> str:
        raw = self.telegram_username or self.phone or ""
        raw = raw.strip()
        if not raw:
            return ""
        if not raw.startswith("@") and not raw.startswith("+"):
            return f"@{raw}"
        return raw

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


class RegisterResponse(BaseModel):
    status: str = "pending"
    message: str = "Your request has been sent to your teacher. Access will be granted once approved."
    access_token: str | None = None
    refresh_token: str | None = None


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
