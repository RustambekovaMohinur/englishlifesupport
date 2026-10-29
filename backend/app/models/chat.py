from datetime import datetime, timezone
import uuid

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base, UUIDPKMixin


class PrivateMessage(UUIDPKMixin, Base):
    """
    1-on-1 private messaging between premium students (can_private_chat=True).
    """
    __tablename__ = "private_messages"

    sender_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("student_profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    recipient_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("student_profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False, index=True
    )

    sender: Mapped["StudentProfile"] = relationship("StudentProfile", foreign_keys=[sender_id], lazy="selectin")
    recipient: Mapped["StudentProfile"] = relationship("StudentProfile", foreign_keys=[recipient_id], lazy="selectin")


class AIChatMessage(UUIDPKMixin, Base):
    """
    AI English Companion chat messages with pedagogical constraints.
    """
    __tablename__ = "ai_chat_messages"

    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("student_profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role: Mapped[str] = mapped_column(String(16), nullable=False)  # 'user' | 'assistant'
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False, index=True
    )

    student: Mapped["StudentProfile"] = relationship("StudentProfile", lazy="selectin")
