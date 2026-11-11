from datetime import datetime
import enum
import uuid

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base, TimestampMixin, UUIDPKMixin


class EnglishLevel(str, enum.Enum):
    BEGINNER = "beginner"
    ELEMENTARY = "elementary"
    PRE_INTERMEDIATE = "pre_intermediate"
    INTERMEDIATE = "intermediate"
    UPPER_INTERMEDIATE = "upper_intermediate"
    ADVANCED = "advanced"
    # CEFR Levels
    A1 = "a1"
    A2 = "a2"
    B1 = "b1"
    B2 = "b2"
    C1 = "c1"
    C2 = "c2"
    CEFR_A1 = "cefr_a1"
    CEFR_A2 = "cefr_a2"
    CEFR_B1 = "cefr_b1"
    CEFR_B2 = "cefr_b2"
    CEFR_C1 = "cefr_c1"
    CEFR_C2 = "cefr_c2"
    # IELTS Levels
    IELTS = "ielts"
    IELTS_FOUNDATION = "ielts_foundation"
    IELTS_GRADUATION = "ielts_graduation"
    IELTS_5_5 = "ielts_5_5"
    IELTS_6_0 = "ielts_6_0"
    IELTS_6_5 = "ielts_6_5"
    IELTS_7_0 = "ielts_7_0"
    IELTS_7_5_PLUS = "ielts_7_5_plus"


class Group(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "groups"

    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False, index=True)
    english_level: Mapped[EnglishLevel] = mapped_column(
        Enum(EnglishLevel, name="english_level", values_callable=lambda x: [e.value for e in x]),
        nullable=False,
    )
    schedule: Mapped[str | None] = mapped_column(String(255), nullable=True)  # e.g. "Mon/Wed/Fri 16:00-17:30"
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    default_homework_time: Mapped[str | None] = mapped_column(String(10), nullable=True, default="20:00")
    # Telegram group chat ID for bound group notifications
    telegram_group_chat_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    current_cycle: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    start_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    curriculum_template_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("curriculum_templates.id", ondelete="SET NULL"), nullable=True
    )

    curriculum_template: Mapped["CurriculumTemplate | None"] = relationship("CurriculumTemplate", lazy="selectin")
    students: Mapped[list["StudentProfile"]] = relationship(back_populates="group")
    assignments: Mapped[list["Assignment"]] = relationship(back_populates="group", cascade="all, delete-orphan")
