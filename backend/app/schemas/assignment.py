import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class AssignmentCreate(BaseModel):
    group_id: uuid.UUID
    title: str = Field(min_length=2, max_length=255)
    description: str = Field(min_length=1)
    deadline: datetime
    order_index: int | None = Field(default=None, ge=1)


class AssignmentUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=255)
    description: str | None = None
    deadline: datetime | None = None
    group_id: uuid.UUID | None = None
    order_index: int | None = Field(default=None, ge=1)


class AssignmentOut(BaseModel):
    id: uuid.UUID
    group_id: uuid.UUID
    group_name: str
    title: str
    description: str
    deadline: datetime
    order_index: int | None = None
    created_at: datetime
    submission_count: int = 0

    model_config = {"from_attributes": True}


class AssignmentForStudent(BaseModel):
    id: uuid.UUID
    title: str
    description: str
    deadline: datetime
    is_past_deadline: bool
    is_locked: bool = False
    lock_reason: str | None = None
    submission_status: str | None = None  # None if not yet submitted
    score: int | None = None

    model_config = {"from_attributes": True}
