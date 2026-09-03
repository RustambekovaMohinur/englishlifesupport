import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class StudentGroupBrief(BaseModel):
    id: uuid.UUID
    name: str
    english_level: str

    model_config = {"from_attributes": True}


class StudentOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    email: str
    username: str = ""
    full_name: str
    phone: str | None = None
    bio: str | None = None
    avatar_url: str | None = None
    is_active: bool
    total_stars: int
    group: StudentGroupBrief | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class StudentListItem(BaseModel):
    id: uuid.UUID
    full_name: str
    email: str
    phone: str | None = None
    is_active: bool
    total_stars: int
    group_name: str | None = None

    model_config = {"from_attributes": True}


class StudentUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=255)
    phone: str | None = Field(default=None, max_length=32)
    bio: str | None = Field(default=None, max_length=2000)
    group_id: uuid.UUID | None = None


class StudentStatusUpdate(BaseModel):
    is_active: bool


class PaginatedStudents(BaseModel):
    items: list[StudentListItem]
    total: int
    page: int
    page_size: int
