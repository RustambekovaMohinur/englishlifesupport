import uuid
from datetime import datetime
from pydantic import BaseModel, Field


class WordlistItemBase(BaseModel):
    word: str
    part_of_speech: str | None = None
    phonetic: str | None = None
    definition: str | None = None
    example: str | None = None
    audio_us_url: str | None = None
    audio_gb_url: str | None = None
    order_index: int = 0


class WordlistItemCreate(WordlistItemBase):
    pass


class WordlistItemOut(WordlistItemBase):
    id: uuid.UUID
    set_id: uuid.UUID
    created_at: datetime

    class Config:
        from_attributes = True


class WordlistSetCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    group_id: uuid.UUID | None = None
    items: list[WordlistItemCreate] = Field(default_factory=list)


class QuizAttemptOut(BaseModel):
    id: uuid.UUID
    student_id: uuid.UUID
    student_name: str | None = None
    mode: str
    total_questions: int
    correct_answers: int
    score_percentage: int
    time_spent_seconds: int
    is_mastered: bool
    terminated_early: bool
    anti_cheat_triggered: bool
    created_at: datetime

    class Config:
        from_attributes = True


class WordlistSetBriefOut(BaseModel):
    id: uuid.UUID
    title: str
    group_id: uuid.UUID | None = None
    group_name: str | None = None
    created_by: uuid.UUID
    created_at: datetime
    word_count: int = 0
    is_mastered: bool = False
    best_score: int | None = None
    best_time_seconds: int | None = None
    attempts_count: int = 0

    class Config:
        from_attributes = True


class WordlistSetDetailOut(BaseModel):
    id: uuid.UUID
    title: str
    group_id: uuid.UUID | None = None
    group_name: str | None = None
    created_by: uuid.UUID
    created_at: datetime
    items: list[WordlistItemOut] = Field(default_factory=list)
    recent_attempts: list[QuizAttemptOut] = Field(default_factory=list)
    student_is_mastered: bool = False
    student_best_score: int | None = None

    class Config:
        from_attributes = True


# Aliases to match schema specifications
WordlistSetSummary = WordlistSetBriefOut
WordlistSetDetail = WordlistSetDetailOut


class PreviewBulkRequest(BaseModel):
    words: list[str] = Field(..., max_items=50)


# Alias to match BulkPreviewRequest specification
BulkPreviewRequest = PreviewBulkRequest


class WordDetailPreview(BaseModel):
    word: str
    custom_translation: str = ""
    part_of_speech: str = ""
    phonetic: str = ""
    definition: str = ""
    example: str = ""
    audio_us_url: str | None = None
    audio_gb_url: str | None = None
    source: str = "dictionary"


class SubmitQuizRequest(BaseModel):
    mode: str = "mixed"
    total_questions: int
    correct_answers: int
    time_spent_seconds: int
    terminated_early: bool = False
    anti_cheat_triggered: bool = False
    incorrect_word_ids: list[str] = Field(default_factory=list)
