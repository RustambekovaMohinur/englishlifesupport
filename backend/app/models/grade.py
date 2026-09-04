import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, SmallInteger, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base, TimestampMixin, UUIDPKMixin


class Grade(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "grades"
    __table_args__ = (
        CheckConstraint("score >= 0 AND score <= 10", name="ck_grade_score_range"),
        CheckConstraint("stars >= 0 AND stars <= 100", name="ck_grade_stars_range"),
    )

    submission_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("submissions.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    score: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    stars: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    graded_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    graded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    submission: Mapped["Submission"] = relationship(back_populates="grade")
