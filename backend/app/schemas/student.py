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
    telegram_username: str | None = None
    bio: str | None = None
    avatar_url: str | None = None
    is_active: bool
    approval_status: str = "approved"
    total_stars: int
    total_lightning: int = 0
    group: StudentGroupBrief | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class StudentListItem(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID | None = None
    full_name: str
    email: str
    username: str = ""
    phone: str | None = None
    telegram_username: str | None = None
    is_active: bool
    approval_status: str = "approved"
    total_stars: int
    total_lightning: int = 0
    group_id: uuid.UUID | None = None
    group_name: str | None = None
    level: str | None = None
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class StudentUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=255)
    phone: str | None = Field(default=None, max_length=32)
    bio: str | None = Field(default=None, max_length=2000)
    group_id: uuid.UUID | None = None


class StudentStatusUpdate(BaseModel):
    is_active: bool


class StudentApprovalAction(BaseModel):
    action: str = Field(description="approve or reject")


class PendingStudentItem(BaseModel):
    id: uuid.UUID
    first_name: str
    last_name: str
    username: str
    telegram_username: str | None = None
    group_id: uuid.UUID | None = None
    group_name: str | None = None
    english_level: str | None = None
    approval_status: str = "PENDING"
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class PaginatedPendingStudents(BaseModel):
    items: list[PendingStudentItem]
    page: int
    page_size: int
    total: int
    total_pages: int


class ApprovedStudentData(BaseModel):
    id: uuid.UUID
    first_name: str
    last_name: str
    username: str
    group_id: uuid.UUID | None = None
    group_name: str | None = None
    english_level: str | None = None
    approval_status: str = "APPROVED"
    is_active: bool = True


class ApproveStudentResponse(BaseModel):
    success: bool = True
    message: str = "Student approved successfully."
    student: ApprovedStudentData


class RejectedStudentData(BaseModel):
    id: uuid.UUID
    approval_status: str = "REJECTED"
    is_active: bool = False


class RejectStudentResponse(BaseModel):
    success: bool = True
    message: str = "Student rejected successfully."
    student: RejectedStudentData


class PaginatedStudents(BaseModel):
    items: list[StudentListItem]
    total: int
    page: int
    page_size: int


class StudentHistoryItem(BaseModel):
    assignment_id: uuid.UUID
    title: str
    assignment_type: str = "assignment"
    assigned_date: datetime
    deadline: datetime
    completion_percentage: int
    submission_id: uuid.UUID | None = None
    submission_status: str | None = None
    submitted_at: datetime | None = None
    score: int | None = None
    feedback: str | None = None
    stars_earned: int = 0
    text_answer: str | None = None
    file_original_name: str | None = None


class StudentHistoryOut(BaseModel):
    student_id: uuid.UUID
    full_name: str
    username: str
    telegram_username: str | None = None
    level: str | None = None
    group_name: str | None = None
    total_stars: int
    total_lightning: int = 0
    history: list[StudentHistoryItem] = []
