import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base, TimestampMixin, UUIDPKMixin


class EnglishLevel(str, enum.Enum):
    BEGINNER = "beginner"
    ELEMENTARY = "elementary"
    PRE_INTERMEDIATE = "pre_intermediate"
    INTERMEDIATE = "intermediate"
    UPPER_INTERMEDIATE = "upper_intermediate"
    ADVANCED = "advanced"


class Group(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "groups"

    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False, index=True)
    english_level: Mapped[EnglishLevel] = mapped_column(
        Enum(EnglishLevel, name="english_level", values_callable=lambda enum_cls: [member.value for member in enum_cls]),
        nullable=False,
    )
    schedule: Mapped[str | None] = mapped_column(String(255), nullable=True)  # e.g. "Mon/Wed/Fri 16:00-17:30"
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    telegram_chat_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    telegram_chat_title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    telegram_sync_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    telegram_last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    students: Mapped[list["StudentProfile"]] = relationship(back_populates="group")
    assignments: Mapped[list["Assignment"]] = relationship(back_populates="group", cascade="all, delete-orphan")
