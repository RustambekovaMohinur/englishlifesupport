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

    model_config = {"from_attributes": True}


class PaginatedSubmissions(BaseModel):
    items: list[SubmissionOut]
    total: int
    page: int
    page_size: int


class GradeCreate(BaseModel):
    score: int = Field(ge=0, le=10)
    feedback: str | None = Field(default=None, max_length=2000)
    stars: int = Field(ge=2, le=5)
