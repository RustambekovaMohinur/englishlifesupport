import uuid
from datetime import datetime
from pydantic import BaseModel, Field


class CurriculumItemCreate(BaseModel):
    title: str = Field(min_length=2, max_length=255)
    description: str | None = None
    day_offset: int = Field(ge=0, description="Relative day offset from group start date, e.g. 1 for Day 1, 3 for Day 3")
    order_index: int = 0
    deadline_offset_days: int = Field(default=1, ge=0, description="Days after lesson unlock when homework is due")


class CurriculumItemUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=255)
    description: str | None = None
    day_offset: int | None = Field(default=None, ge=0)
    order_index: int | None = None
    deadline_offset_days: int | None = Field(default=None, ge=0)


class CurriculumItemOut(BaseModel):
    id: uuid.UUID
    template_id: uuid.UUID
    title: str
    description: str | None = None
    day_offset: int
    order_index: int
    deadline_offset_days: int
    created_at: datetime

    model_config = {"from_attributes": True}


class CurriculumTemplateCreate(BaseModel):
    title: str = Field(min_length=2, max_length=255)
    description: str | None = None
    english_level: str | None = None
    items: list[CurriculumItemCreate] = []


class CurriculumTemplateUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=255)
    description: str | None = None
    english_level: str | None = None
    items: list[CurriculumItemCreate] | None = None


class CurriculumTemplateOut(BaseModel):
    id: uuid.UUID
    title: str
    description: str | None = None
    english_level: str | None = None
    created_by: uuid.UUID | None = None
    items: list[CurriculumItemOut] = []
    item_count: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}


class ApplyCurriculumRequest(BaseModel):
    start_date: datetime | None = None


class ApplyCurriculumResponse(BaseModel):
    success: bool
    message: str
    assignments_created: int
    assignments_updated: int
    group_id: uuid.UUID
    start_date: datetime | None = None
