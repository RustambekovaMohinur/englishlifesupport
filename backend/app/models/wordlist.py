import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base, TimestampMixin, UUIDPKMixin
from app.utils.datetimes import utcnow


class WordlistSet(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "wordlist_sets"

    group_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("groups.id", ondelete="CASCADE"), nullable=True, index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )
    b2_file_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    total_words: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    items: Mapped[list["WordlistItem"]] = relationship(
        "WordlistItem",
        back_populates="wordlist_set",
        cascade="all, delete-orphan",
        order_by="WordlistItem.order_index",
        lazy="selectin",
    )
    group = relationship("Group", lazy="selectin")
    creator = relationship("User", lazy="selectin")
    attempts: Mapped[list["WordlistQuizAttempt"]] = relationship(
        "WordlistQuizAttempt",
        back_populates="wordlist_set",
        cascade="all, delete-orphan",
        order_by="WordlistQuizAttempt.created_at.desc()",
        lazy="selectin",
    )


class WordlistItem(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "wordlist_items"

    set_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("wordlist_sets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    word: Mapped[str] = mapped_column(String(128), nullable=False)
    part_of_speech: Mapped[str | None] = mapped_column(String(32), nullable=True)
    phonetic: Mapped[str | None] = mapped_column(String(64), nullable=True)
    definition: Mapped[str | None] = mapped_column(Text, nullable=True)
    example: Mapped[str | None] = mapped_column(Text, nullable=True)
    audio_us_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    audio_gb_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    order_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    wordlist_set: Mapped["WordlistSet"] = relationship("WordlistSet", back_populates="items")


class WordlistQuizAttempt(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "wordlist_quiz_attempts"

    set_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("wordlist_sets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("student_profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    mode: Mapped[str] = mapped_column(String(32), default="mixed", nullable=False)
    total_questions: Mapped[int] = mapped_column(Integer, nullable=False)
    correct_answers: Mapped[int] = mapped_column(Integer, nullable=False)
    score_percentage: Mapped[int] = mapped_column(Integer, nullable=False)
    time_spent_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_mastered: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    terminated_early: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    anti_cheat_triggered: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    wordlist_set: Mapped["WordlistSet"] = relationship("WordlistSet", back_populates="attempts")
    student: Mapped["StudentProfile"] = relationship(lazy="selectin")
