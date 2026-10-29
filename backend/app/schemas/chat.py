from datetime import datetime
import uuid
from pydantic import BaseModel, Field


# ─── 1-on-1 Private Messaging ────────────────────────────────────────────────

class PrivateMessageSend(BaseModel):
    recipient_id: uuid.UUID
    content: str = Field(..., min_length=1, max_length=5000)


class PrivateMessageOut(BaseModel):
    id: uuid.UUID
    sender_id: uuid.UUID
    recipient_id: uuid.UUID
    content: str
    is_read: bool
    created_at: datetime
    sender_name: str
    sender_avatar: str | None = None
    sender_badge: str | None = None
    is_me: bool = False


class PeerChatContactOut(BaseModel):
    student_id: uuid.UUID
    full_name: str
    username: str | None = None
    avatar_url: str | None = None
    custom_badge: str | None = None
    premium_plan: str | None = None
    last_message: str | None = None
    last_message_at: datetime | None = None
    unread_count: int = 0


# ─── AI Companion Chat ────────────────────────────────────────────────────────

class AIChatSend(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)


class AIChatMessageOut(BaseModel):
    id: uuid.UUID
    role: str
    content: str
    created_at: datetime
