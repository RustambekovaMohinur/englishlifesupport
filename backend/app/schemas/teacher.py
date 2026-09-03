import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class TeacherProfileOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    email: str
    username: str = ""
    full_name: str
    phone: str | None = None
    bio: str | None = None
    avatar_url: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class TeacherProfileUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=255)
    phone: str | None = Field(default=None, max_length=32)
    bio: str | None = Field(default=None, max_length=2000)
    email: str | None = Field(default=None, min_length=3, max_length=255)
    current_password: str | None = None


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str
    confirm_password: str
