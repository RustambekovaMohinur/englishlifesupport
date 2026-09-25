import enum
import uuid
from typing import Any

import sqlalchemy as sa
from sqlalchemy import Float, ForeignKey, JSON, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base, TimestampMixin, UUIDPKMixin


class AIEvaluationStatus(str, enum.Enum):
    PENDING = "pending"
    COMPLETED = "completed"
    FAILED = "failed"


class SubmissionAIFeedback(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "submission_ai_feedbacks"

    submission_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("submissions.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    assignment_type: Mapped[str] = mapped_column(String(30), nullable=False)  # "writing" or "speaking"
    band_score: Mapped[float | None] = mapped_column(Float, nullable=True)  # IELTS/CEFR band score e.g. 6.5
    scaled_score_10: Mapped[float | None] = mapped_column(Float, nullable=True)  # 0.0 - 10.0 scale for teacher grading
    overall_feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    criteria_scores: Mapped[dict[str, Any] | None] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"), nullable=True
    )
    strengths: Mapped[list[str] | None] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"), nullable=True
    )
    areas_for_improvement: Mapped[list[str] | None] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"), nullable=True
    )
    detailed_corrections: Mapped[list[dict[str, Any]] | None] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"), nullable=True
    )
    transcription: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_raw_response: Mapped[dict[str, Any] | None] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"), nullable=True
    )
    status: Mapped[str] = mapped_column(
        String(30), default=AIEvaluationStatus.PENDING.value, server_default=sa.text("'pending'"), nullable=False
    )
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    submission: Mapped["Submission"] = relationship(back_populates="ai_feedback")
