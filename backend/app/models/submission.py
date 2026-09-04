import enum
import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Enum, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base, TimestampMixin, UUIDPKMixin


class SubmissionStatus(str, enum.Enum):
    SUBMITTED = "submitted"
    LATE = "late"
    GRADED = "graded"


class Submission(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "submissions"
    __table_args__ = (
        # A student can only have ONE submission row per assignment; resubmission
        # updates this row (and only while before the deadline / allowed).
        UniqueConstraint("assignment_id", "student_id", name="uq_submission_assignment_student"),
    )

    assignment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("assignments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("student_profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    text_answer: Mapped[str | None] = mapped_column(Text, nullable=True)

    # File metadata - actual bytes live on disk (or later S3) under a safe,
    # generated filename. We never trust or serve the client-provided filename.
    file_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    file_original_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    file_content_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    file_size_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

    status: Mapped[SubmissionStatus] = mapped_column(
        Enum(SubmissionStatus, name="submission_status", values_callable=lambda x: [e.value for e in x]),
        default=SubmissionStatus.SUBMITTED,
        nullable=False,
    )
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    assignment: Mapped["Assignment"] = relationship(back_populates="submissions")
    student: Mapped["StudentProfile"] = relationship(back_populates="submissions")
    grade: Mapped["Grade | None"] = relationship(
        back_populates="submission", uselist=False, cascade="all, delete-orphan"
    )
    corrections: Mapped[list["SubmissionCorrection"]] = relationship(
        back_populates="submission",
        cascade="all, delete-orphan",
        order_by="SubmissionCorrection.created_at",
        lazy="selectin",
    )
    comments: Mapped[list["SubmissionComment"]] = relationship(
        back_populates="submission",
        cascade="all, delete-orphan",
        order_by="SubmissionComment.created_at",
        lazy="selectin",
    )


class SubmissionCorrection(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "submission_corrections"

    submission_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("submissions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    teacher_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    selected_text: Mapped[str] = mapped_column(Text, nullable=False)
    correction: Mapped[str] = mapped_column(Text, nullable=False)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_type: Mapped[str | None] = mapped_column(String(50), nullable=True)

    submission: Mapped["Submission"] = relationship(back_populates="corrections")
    teacher: Mapped["User"] = relationship()


class SubmissionComment(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "submission_comments"

    submission_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("submissions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    teacher_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    comment: Mapped[str] = mapped_column(Text, nullable=False)

    submission: Mapped["Submission"] = relationship(back_populates="comments")
    teacher: Mapped["User"] = relationship()
