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


class WordlistSetBriefOut(BaseModel):
    id: uuid.UUID
    title: str
    group_id: uuid.UUID | None = None
    group_name: str | None = None
    created_by: uuid.UUID
    created_at: datetime
    word_count: int = 0

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

    class Config:
        from_attributes = True


class PreviewBulkRequest(BaseModel):
    words: list[str] = Field(..., max_items=50)


class WordDetailPreview(BaseModel):
    word: str
    part_of_speech: str = ""
    phonetic: str = ""
    definition: str = ""
    example: str = ""
    audio_us_url: str | None = None
    audio_gb_url: str | None = None
    source: str = "dictionary"
