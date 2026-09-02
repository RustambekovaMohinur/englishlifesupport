import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.assignment import AssignmentStatus


class VocabWordItem(BaseModel):
    id: uuid.UUID
    english_word: str
    translation: str
    example_sentence: str | None = None

    model_config = {"from_attributes": True}


class AssignmentCreate(BaseModel):
    group_id: uuid.UUID
    title: str = Field(min_length=2, max_length=255)
    description: str = Field(min_length=1)
    deadline: datetime
    status: AssignmentStatus = AssignmentStatus.DRAFT
    order_index: int = 0
    prerequisite_id: uuid.UUID | None = None


class AssignmentUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=255)
    description: str | None = None
    deadline: datetime | None = None
    group_id: uuid.UUID | None = None
    status: AssignmentStatus | None = None
    order_index: int | None = None
    prerequisite_id: uuid.UUID | None = None


class AssignmentOut(BaseModel):
    id: uuid.UUID
    group_id: uuid.UUID
    group_name: str
    title: str
    description: str
    deadline: datetime
    status: str
    file_url: str | None = None
    file_original_name: str | None = None
    vocab_words: list[VocabWordItem] = []
    created_at: datetime
    submission_count: int = 0
    order_index: int = 0
    prerequisite_id: uuid.UUID | None = None

    model_config = {"from_attributes": True}


class AssignmentForStudent(BaseModel):
    id: uuid.UUID
    title: str
    description: str
    deadline: datetime
    status: str
    file_url: str | None = None
    file_original_name: str | None = None
    vocab_words: list[VocabWordItem] = []
    is_past_deadline: bool
    submission_status: str | None = None  # None if not yet submitted
    score: int | None = None
    submission_id: uuid.UUID | None = None
    order_index: int = 0
    prerequisite_id: uuid.UUID | None = None
    is_locked: bool = False
    lock_reason: str | None = None

    model_config = {"from_attributes": True}

