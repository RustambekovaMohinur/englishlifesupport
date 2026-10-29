from datetime import datetime
import uuid

from sqlalchemy import DateTime, ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base, TimestampMixin, UUIDPKMixin


class ParentHomeworkNotification(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "parent_homework_notifications"

    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("student_profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    assignment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("assignments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    notification_channel: Mapped[str] = mapped_column(String(32), nullable=False)  # 'telegram', 'sms'
    recipient: Mapped[str] = mapped_column(String(64), nullable=False)  # chat_id or phone
    status: Mapped[str] = mapped_column(String(32), default="sent", nullable=False)  # 'sent', 'failed'
    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    student: Mapped["StudentProfile"] = relationship()
    assignment: Mapped["Assignment"] = relationship()

    __table_args__ = (
        UniqueConstraint("student_id", "assignment_id", "notification_channel", name="uq_parent_hw_notif"),
        Index("ix_parent_hw_notif_student_assign", "student_id", "assignment_id"),
        Index("ix_parent_hw_notif_assignment_id", "assignment_id"),
    )
