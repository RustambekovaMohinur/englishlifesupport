import re
from pydantic import BaseModel, Field, field_validator

from app.models.group import EnglishLevel

TIME_REGEX = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")


class GroupCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    english_level: EnglishLevel
    schedule: str | None = Field(default=None, max_length=255)
    default_homework_time: str | None = Field(default="20:00", max_length=10)

    @field_validator("default_homework_time")
    @classmethod
    def validate_time(cls, v: str | None) -> str | None:
        if v is not None and not TIME_REGEX.match(v):
            raise ValueError("Invalid time format. Must be HH:MM (00:00 to 23:59)")
        return v


class GroupUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    english_level: EnglishLevel | None = None
    schedule: str | None = Field(default=None, max_length=255)
    default_homework_time: str | None = Field(default=None, max_length=10)
    is_active: bool | None = None

    @field_validator("default_homework_time")
    @classmethod
    def validate_time(cls, v: str | None) -> str | None:
        if v is not None and not TIME_REGEX.match(v):
            raise ValueError("Invalid time format. Must be HH:MM (00:00 to 23:59)")
        return v


class GroupOut(BaseModel):
    id: uuid.UUID
    name: str
    english_level: EnglishLevel
    schedule: str | None
    default_homework_time: str | None = "20:00"
    is_active: bool
    student_count: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}


class AssignmentItemOverview(BaseModel):
    assignment_id: uuid.UUID
    title: str
    deadline: datetime
    status: str
    completion_percentage: int
    score: int | None = None
    stars: int | None = None
    has_submission: bool = False
    submitted_at: datetime | None = None


class GroupStudentDetail(BaseModel):
    id: uuid.UUID | None = None
    student_id: uuid.UUID
    user_id: uuid.UUID
    full_name: str
    username: str
    telegram_username: str | None = None
    avatar_url: str | None = None
    bio: str | None = None
    total_stars: int
    total_lightning: int = 0
    completed_assignments_count: int = 0
    total_assignments_count: int = 0
    overall_completion_percentage: int = 0
    assignments: list[AssignmentItemOverview] = []


class GroupAssignmentHeader(BaseModel):
    id: uuid.UUID
    title: str
    deadline: datetime
    status: str


class GroupDetailOut(BaseModel):
    id: uuid.UUID
    name: str
    english_level: EnglishLevel
    schedule: str | None
    default_homework_time: str | None = "20:00"
    is_active: bool
    student_count: int = 0
    assignments: list[GroupAssignmentHeader] = []
    students: list[GroupStudentDetail] = []

    model_config = {"from_attributes": True}
