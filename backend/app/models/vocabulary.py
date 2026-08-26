import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base, TimestampMixin, UUIDPKMixin


class VocabularyAssignment(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "vocabulary_assignments"

    teacher_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    group_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("groups.id", ondelete="CASCADE"), nullable=False, index=True
    )
    assignment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("assignments.id", ondelete="CASCADE"), nullable=True, index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    group: Mapped["Group"] = relationship()
    assignment: Mapped["Assignment | None"] = relationship(back_populates="vocabulary_assignment")
    words: Mapped[list["VocabularyWord"]] = relationship(
        "VocabularyWord", back_populates="assignment", cascade="all, delete-orphan",
        order_by="VocabularyWord.created_at"
    )
    attempts: Mapped[list["VocabularyAttempt"]] = relationship(
        "VocabularyAttempt", back_populates="assignment", cascade="all, delete-orphan"
    )



class VocabularyWord(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "vocabulary_words"

    vocabulary_assignment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("vocabulary_assignments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    english_word: Mapped[str] = mapped_column(String(255), nullable=False)
    translation: Mapped[str] = mapped_column(String(255), nullable=False)
    example_sentence: Mapped[str | None] = mapped_column(Text, nullable=True)

    assignment: Mapped["VocabularyAssignment"] = relationship(back_populates="words")


class VocabularyAttempt(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "vocabulary_attempts"
    __table_args__ = (
        UniqueConstraint("vocabulary_assignment_id", "student_id", name="uq_vocab_attempt_assignment_student"),
    )

    vocabulary_assignment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("vocabulary_assignments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("student_profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    total_questions: Mapped[int] = mapped_column(Integer, nullable=False)
    correct_answers: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    incorrect_answers: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    percentage: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    is_completed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    assignment: Mapped["VocabularyAssignment"] = relationship(back_populates="attempts")
    answers: Mapped[list["VocabularyAnswer"]] = relationship(
        "VocabularyAnswer", back_populates="attempt", cascade="all, delete-orphan"
    )
    student: Mapped["StudentProfile"] = relationship()


class VocabularyAnswer(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "vocabulary_answers"
    __table_args__ = (
        UniqueConstraint("attempt_id", "vocabulary_word_id", name="uq_vocab_answer_attempt_word"),
    )

    attempt_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vocabulary_attempts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    vocabulary_word_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vocabulary_words.id", ondelete="CASCADE"), nullable=False, index=True
    )
    student_answer: Mapped[str] = mapped_column(String(255), nullable=False)
    is_correct: Mapped[bool] = mapped_column(Boolean, nullable=False)

    attempt: Mapped["VocabularyAttempt"] = relationship(back_populates="answers")
    word: Mapped["VocabularyWord"] = relationship()
