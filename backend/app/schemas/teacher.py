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
    is_active: bool = True
    group_count: int = 0
    student_count: int = 0

    model_config = {"from_attributes": True}


class ResetTeacherPasswordRequest(BaseModel):
    new_password: str = Field(..., min_length=6, max_length=128)


class TeacherStatusUpdate(BaseModel):
    is_active: bool


class TeacherBreakdownItem(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    full_name: str
    username: str
    email: str
    is_active: bool
    group_count: int
    student_count: int


class PlatformStatsResponse(BaseModel):
    total_teachers: int
    total_students: int
    active_students: int
    pending_approvals: int
    total_groups: int
    total_assignments: int
    total_submissions: int
    teachers_breakdown: list[TeacherBreakdownItem]


class PendingApprovalUserOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    role: str
    full_name: str
    username: str
    email: str
    phone: str | None = None
    group_name: str | None = None
    teacher_name: str | None = None
    created_at: datetime


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


class CreateTeacherRequest(BaseModel):
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    email: str = Field(..., min_length=5, max_length=255)
    username: str = Field(..., min_length=3, max_length=60)
    password: str = Field(..., min_length=6, max_length=128)
    phone: str | None = Field(default=None, max_length=32)
    bio: str | None = Field(default=None, max_length=2000)
