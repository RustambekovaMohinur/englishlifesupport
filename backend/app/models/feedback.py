import uuid

from sqlalchemy import ForeignKey, SmallInteger, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base, TimestampMixin, UUIDPKMixin


class PlatformFeedback(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = 'platform_feedbacks'

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True
    )
    rating: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    category: Mapped[str | None] = mapped_column(String(50), nullable=True)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    what_works_well: Mapped[str | None] = mapped_column(Text, nullable=True)
    what_to_improve: Mapped[str | None] = mapped_column(Text, nullable=True)

    user: Mapped['User'] = relationship()
