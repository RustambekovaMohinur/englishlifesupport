import enum
import uuid

from sqlalchemy import Boolean, Enum, ForeignKey, String
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

    students: Mapped[list["StudentProfile"]] = relationship(back_populates="group")
    assignments: Mapped[list["Assignment"]] = relationship(back_populates="group", cascade="all, delete-orphan")
