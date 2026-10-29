import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, Integer, String, Text, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base, TimestampMixin, UUIDPKMixin


class CurriculumTemplate(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "curriculum_templates"

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    english_level: Mapped[str | None] = mapped_column(String(50), nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    items: Mapped[list["CurriculumItem"]] = relationship(
        "CurriculumItem",
        back_populates="template",
        cascade="all, delete-orphan",
        order_by="CurriculumItem.day_offset",
        lazy="selectin",
    )


class CurriculumItem(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "curriculum_items"

    template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("curriculum_templates.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    day_offset: Mapped[int] = mapped_column(Integer, nullable=False, default=1, index=True)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    deadline_offset_days: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    template: Mapped["CurriculumTemplate"] = relationship("CurriculumTemplate", back_populates="items")
