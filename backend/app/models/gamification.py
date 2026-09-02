import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base, TimestampMixin, UUIDPKMixin


class StarTransactionReason(str, enum.Enum):
    ON_TIME_SUBMISSION = "on_time_submission"
    EARLY_SUBMISSION = "early_submission"
    VOCABULARY_ACHIEVEMENT = "vocabulary_achievement"
    PERFECT_WEEK = "perfect_week"
    STUDENT_OF_THE_WEEK = "student_of_the_week"
    LATE_PENALTY = "late_penalty"
    TEACHER_ADJUSTMENT = "teacher_adjustment"
    FREE_PASS_REFUND = "free_pass_refund"


class StarTransaction(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "star_transactions"
    __table_args__ = (
        UniqueConstraint("student_id", "reason", "reference_id", name="uq_star_tx_student_reason_ref"),
    )

    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("student_profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    reason: Mapped[StarTransactionReason] = mapped_column(
        Enum(StarTransactionReason, name="star_transaction_reason", values_callable=lambda x: [e.value for e in x]),
        nullable=False,
    )
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    reference_id: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)

    student: Mapped["StudentProfile"] = relationship()


class FreePass(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "free_passes"
    __table_args__ = (
        UniqueConstraint("student_id", "month_key", name="uq_free_pass_student_month"),
    )

    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("student_profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    month_key: Mapped[str] = mapped_column(String(7), nullable=False)
    is_used: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    used_for_assignment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("assignments.id", ondelete="SET NULL"), nullable=True
    )

    student: Mapped["StudentProfile"] = relationship()
    assignment: Mapped["Assignment"] = relationship()


class StudentStreak(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "student_streaks"

    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("student_profiles.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    current_streak: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    longest_streak: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_activity_date: Mapped[str | None] = mapped_column(String(10), nullable=True)

    student: Mapped["StudentProfile"] = relationship()


class StudentXP(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "student_xp"

    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("student_profiles.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    total_xp: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    level: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    student: Mapped["StudentProfile"] = relationship()


class XPTransaction(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "xp_transactions"
    __table_args__ = (
        UniqueConstraint("student_id", "activity_type", "reference_id", name="uq_xp_tx_student_act_ref"),
    )

    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("student_profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    activity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    reference_id: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)

    student: Mapped["StudentProfile"] = relationship()


class Achievement(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "achievements"
    __table_args__ = (
        UniqueConstraint("student_id", "badge_key", name="uq_achievement_student_badge"),
    )

    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("student_profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    badge_key: Mapped[str] = mapped_column(String(50), nullable=False)
    title: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    icon: Mapped[str] = mapped_column(String(50), nullable=False)
    unlocked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    student: Mapped["StudentProfile"] = relationship()


class TaskLockOverride(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "task_lock_overrides"
    __table_args__ = (
        UniqueConstraint("student_id", "assignment_id", name="uq_task_lock_override"),
    )

    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("student_profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    assignment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("assignments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    is_unlocked: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    overridden_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    student: Mapped["StudentProfile"] = relationship()
    assignment: Mapped["Assignment"] = relationship()


class StudentOfTheWeek(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "student_of_the_week"
    __table_args__ = (
        UniqueConstraint("group_id", "week_key", name="uq_sotw_group_week"),
    )

    group_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("groups.id", ondelete="CASCADE"), nullable=False, index=True
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("student_profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    week_key: Mapped[str] = mapped_column(String(10), nullable=False)
    stars_awarded: Mapped[int] = mapped_column(Integer, default=50, nullable=False)
    selected_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    reason: Mapped[str | None] = mapped_column(String(255), nullable=True)

    group: Mapped["Group"] = relationship()
    student: Mapped["StudentProfile"] = relationship()
