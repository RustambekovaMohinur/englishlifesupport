import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class GradeOut(BaseModel):
    id: uuid.UUID
    score: int
    feedback: str | None
    stars: int
    graded_at: datetime

    model_config = {"from_attributes": True}


class SubmissionCorrectionCreate(BaseModel):
    selected_text: str = Field(min_length=1)
    correction: str = Field(min_length=1)
    comment: str | None = None
    error_type: str | None = Field(default=None, max_length=50)


class SubmissionCorrectionOut(BaseModel):
    id: uuid.UUID
    submission_id: uuid.UUID
    teacher_id: uuid.UUID
    selected_text: str
    correction: str
    comment: str | None = None
    error_type: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class SubmissionCommentCreate(BaseModel):
    comment: str = Field(min_length=1, max_length=2000)


class SubmissionCommentOut(BaseModel):
    id: uuid.UUID
    submission_id: uuid.UUID
    teacher_id: uuid.UUID
    comment: str
    created_at: datetime

    model_config = {"from_attributes": True}


class SubmissionOut(BaseModel):
    id: uuid.UUID
    assignment_id: uuid.UUID
    assignment_title: str
    student_id: uuid.UUID
    student_name: str
    text_answer: str | None
    file_url: str | None
    file_original_name: str | None
    status: str
    submitted_at: datetime
    grade: GradeOut | None = None
    corrections: list[SubmissionCorrectionOut] = []
    comments: list[SubmissionCommentOut] = []

    model_config = {"from_attributes": True}


class PaginatedSubmissions(BaseModel):
    items: list[SubmissionOut]
    total: int
    page: int
    page_size: int


class GradeCreate(BaseModel):
    score: int = Field(ge=0, le=10)
    feedback: str | None = Field(default=None, max_length=2000)
    stars: int = Field(ge=0, le=100, default=5)

