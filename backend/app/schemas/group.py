from typing import Any
import re
import uuid
from datetime import datetime
from pydantic import BaseModel, Field, field_validator

from app.models.group import EnglishLevel

TIME_REGEX = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")


class GroupCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    english_level: EnglishLevel
    schedule: str | None = Field(default=None, max_length=255)
    default_homework_time: str | None = Field(default="20:00", max_length=10)
    telegram_group_chat_id: str | None = Field(default=None, max_length=64)
    start_date: datetime | None = None
    curriculum_template_id: uuid.UUID | None = None

    @field_validator("english_level", mode="before")
    @classmethod
    def parse_english_level(cls, v: Any) -> Any:
        if isinstance(v, EnglishLevel):
            return v
        if isinstance(v, str):
            clean = v.strip().lower().replace("-", "_").replace(" ", "_")
            mapping = {
                "pre_intermediate": EnglishLevel.PRE_INTERMEDIATE,
                "upper_intermediate": EnglishLevel.UPPER_INTERMEDIATE,
                "elementary": EnglishLevel.ELEMENTARY,
                "beginner": EnglishLevel.BEGINNER,
                "intermediate": EnglishLevel.INTERMEDIATE,
                "advanced": EnglishLevel.ADVANCED,
                "a1": EnglishLevel.A1,
                "a2": EnglishLevel.A2,
                "b1": EnglishLevel.B1,
                "b2": EnglishLevel.B2,
                "c1": EnglishLevel.C1,
                "c2": EnglishLevel.C2,
                "cefr_a1": EnglishLevel.CEFR_A1,
                "cefr_a2": EnglishLevel.CEFR_A2,
                "cefr_b1": EnglishLevel.CEFR_B1,
                "cefr_b2": EnglishLevel.CEFR_B2,
                "cefr_c1": EnglishLevel.CEFR_C1,
                "cefr_c2": EnglishLevel.CEFR_C2,
                "ielts": EnglishLevel.IELTS,
                "ielts_foundation": EnglishLevel.IELTS_FOUNDATION,
                "ielts_graduation": EnglishLevel.IELTS_GRADUATION,
                "ielts_5.5": EnglishLevel.IELTS_5_5,
                "ielts_5_5": EnglishLevel.IELTS_5_5,
                "ielts_6.0": EnglishLevel.IELTS_6_0,
                "ielts_6_0": EnglishLevel.IELTS_6_0,
                "ielts_6.5": EnglishLevel.IELTS_6_5,
                "ielts_6_5": EnglishLevel.IELTS_6_5,
                "ielts_7.0": EnglishLevel.IELTS_7_0,
                "ielts_7_0": EnglishLevel.IELTS_7_0,
                "ielts_7.5+": EnglishLevel.IELTS_7_5_PLUS,
                "ielts_7_5_plus": EnglishLevel.IELTS_7_5_PLUS,
            }
            if clean in mapping:
                return mapping[clean]
            for member in EnglishLevel:
                if member.value == clean or member.name.lower() == clean:
                    return member
        return v

    @field_validator("default_homework_time")
    @classmethod
    def validate_time(cls, v: str | None) -> str | None:
        if v is not None and not TIME_REGEX.match(v):
            raise ValueError("Invalid time format. Must be HH:MM (00:00 to 23:59)")
        return v

    @field_validator("curriculum_template_id", mode="before")
    @classmethod
    def parse_tpl_id(cls, v: Any) -> uuid.UUID | None:
        if v is None or v == "" or str(v).strip() in ("", "null", "none"):
            return None
        if isinstance(v, uuid.UUID):
            return v
        try:
            return uuid.UUID(str(v).strip())
        except Exception:
            raise ValueError("Invalid curriculum_template_id UUID format")


class GroupUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    english_level: EnglishLevel | None = None
    schedule: str | None = Field(default=None, max_length=255)
    default_homework_time: str | None = Field(default=None, max_length=10)
    is_active: bool | None = None
    telegram_group_chat_id: str | None = Field(default=None, max_length=64)
    start_date: datetime | None = None
    curriculum_template_id: uuid.UUID | None = None

    @field_validator("english_level", mode="before")
    @classmethod
    def parse_english_level(cls, v: Any) -> Any:
        if v is None:
            return None
        if isinstance(v, EnglishLevel):
            return v
        if isinstance(v, str):
            clean = v.strip().lower().replace("-", "_").replace(" ", "_")
            mapping = {
                "pre_intermediate": EnglishLevel.PRE_INTERMEDIATE,
                "upper_intermediate": EnglishLevel.UPPER_INTERMEDIATE,
                "elementary": EnglishLevel.ELEMENTARY,
                "beginner": EnglishLevel.BEGINNER,
                "intermediate": EnglishLevel.INTERMEDIATE,
                "advanced": EnglishLevel.ADVANCED,
                "a1": EnglishLevel.A1,
                "a2": EnglishLevel.A2,
                "b1": EnglishLevel.B1,
                "b2": EnglishLevel.B2,
                "c1": EnglishLevel.C1,
                "c2": EnglishLevel.C2,
                "cefr_a1": EnglishLevel.CEFR_A1,
                "cefr_a2": EnglishLevel.CEFR_A2,
                "cefr_b1": EnglishLevel.CEFR_B1,
                "cefr_b2": EnglishLevel.CEFR_B2,
                "cefr_c1": EnglishLevel.CEFR_C1,
                "cefr_c2": EnglishLevel.CEFR_C2,
                "ielts": EnglishLevel.IELTS,
                "ielts_foundation": EnglishLevel.IELTS_FOUNDATION,
                "ielts_graduation": EnglishLevel.IELTS_GRADUATION,
                "ielts_5.5": EnglishLevel.IELTS_5_5,
                "ielts_5_5": EnglishLevel.IELTS_5_5,
                "ielts_6.0": EnglishLevel.IELTS_6_0,
                "ielts_6_0": EnglishLevel.IELTS_6_0,
                "ielts_6.5": EnglishLevel.IELTS_6_5,
                "ielts_6_5": EnglishLevel.IELTS_6_5,
                "ielts_7.0": EnglishLevel.IELTS_7_0,
                "ielts_7_0": EnglishLevel.IELTS_7_0,
                "ielts_7.5+": EnglishLevel.IELTS_7_5_PLUS,
                "ielts_7_5_plus": EnglishLevel.IELTS_7_5_PLUS,
            }
            if clean in mapping:
                return mapping[clean]
            for member in EnglishLevel:
                if member.value == clean or member.name.lower() == clean:
                    return member
        return v

    @field_validator("default_homework_time")
    @classmethod
    def validate_time(cls, v: str | None) -> str | None:
        if v is not None and not TIME_REGEX.match(v):
            raise ValueError("Invalid time format. Must be HH:MM (00:00 to 23:59)")
        return v

    @field_validator("curriculum_template_id", mode="before")
    @classmethod
    def parse_tpl_id(cls, v: Any) -> uuid.UUID | None:
        if v is None or v == "" or str(v).strip() in ("", "null", "none"):
            return None
        if isinstance(v, uuid.UUID):
            return v
        try:
            return uuid.UUID(str(v).strip())
        except Exception:
            raise ValueError("Invalid curriculum_template_id UUID format")


class GroupOut(BaseModel):
    id: uuid.UUID
    name: str
    english_level: EnglishLevel
    schedule: str | None = None
    default_homework_time: str | None = "20:00"
    current_cycle: int = 1
    is_active: bool = True
    telegram_group_chat_id: str | None = None
    student_count: int = 0
    start_date: datetime | None = None
    curriculum_template_id: uuid.UUID | None = None
    curriculum_template_title: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class AssignmentItemOverview(BaseModel):
    assignment_id: uuid.UUID
    submission_id: uuid.UUID | None = None
    title: str
    deadline: datetime
    status: str
    completion_percentage: int
    cycle_number: int = 1
    score: int | None = None
    stars: int | None = None
    has_submission: bool = False
    is_overdue: bool = False
    is_locked: bool = False
    unlock_at: datetime | None = None
    day_offset: int | None = None
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
    completed_cycle_count: int = 0
    total_cycle_count: int = 0
    cycle_completion_percentage: int = 0
    overdue_assignments_count: int = 0
    assignments: list[AssignmentItemOverview] = []


class GroupAssignmentHeader(BaseModel):
    id: uuid.UUID
    title: str
    deadline: datetime
    status: str
    cycle_number: int = 1
    prerequisite_id: uuid.UUID | None = None
    unlock_at: datetime | None = None
    day_offset: int | None = None
    is_locked: bool = False


class GroupDetailOut(BaseModel):
    id: uuid.UUID
    name: str
    english_level: EnglishLevel
    schedule: str | None
    default_homework_time: str | None = "20:00"
    current_cycle: int = 1
    is_active: bool
    student_count: int = 0
    cycle_completion_percentage: int = 0
    start_date: datetime | None = None
    curriculum_template_id: uuid.UUID | None = None
    curriculum_template_title: str | None = None
    assignments: list[GroupAssignmentHeader] = []
    students: list[GroupStudentDetail] = []

    model_config = {"from_attributes": True}


class PublishCycleRequest(BaseModel):
    assignment_ids: list[uuid.UUID] | None = None
    new_deadline: datetime | None = None
    cycle_title: str | None = None


class PublishCycleResponse(BaseModel):
    success: bool = True
    group_id: uuid.UUID
    new_cycle: int
    active_tasks_count: int
    archived_tasks_count: int
    message: str
