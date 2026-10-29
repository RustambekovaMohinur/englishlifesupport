from datetime import datetime
import uuid
from pydantic import BaseModel, Field


# ─── Public Notes (Zametka) ───────────────────────────────────────────────────

class PublicNoteAuthor(BaseModel):
    id: uuid.UUID
    full_name: str
    username: str | None = None
    avatar_url: str | None = None
    custom_badge: str | None = None
    premium_plan: str | None = None


class PublicNoteCreate(BaseModel):
    title: str = Field(..., min_length=2, max_length=200)
    content: str = Field(..., min_length=5, max_length=10000)
    category: str = Field(default="general", max_length=50)


class PublicNoteOut(BaseModel):
    id: uuid.UUID
    title: str
    content: str
    category: str
    is_pinned: bool
    likes_count: int
    has_liked: bool = False
    created_at: datetime
    updated_at: datetime
    author: PublicNoteAuthor


# ─── Study Groups ─────────────────────────────────────────────────────────────

class StudyGroupMemberOut(BaseModel):
    student_id: uuid.UUID
    full_name: str
    username: str | None = None
    avatar_url: str | None = None
    custom_badge: str | None = None
    role: str
    joined_at: datetime


class StudyGroupCreate(BaseModel):
    name: str = Field(..., min_length=3, max_length=120)
    description: str = Field(default="", max_length=1000)
    topic: str = Field(default="IELTS / General English", max_length=64)
    max_members: int = Field(default=8, ge=2, le=50)


class StudyGroupOut(BaseModel):
    id: uuid.UUID
    name: str
    description: str
    topic: str
    max_members: int
    invite_code: str
    is_active: bool
    member_count: int
    is_member: bool = False
    is_creator: bool = False
    created_at: datetime
    creator: PublicNoteAuthor
    members: list[StudyGroupMemberOut] = []


class StudyGroupJoinRequest(BaseModel):
    invite_code: str | None = None
    group_id: uuid.UUID | None = None
