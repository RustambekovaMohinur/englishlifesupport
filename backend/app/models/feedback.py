import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, SmallInteger, String, Text, UniqueConstraint
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
    replies: Mapped[list['FeedbackReply']] = relationship(
        back_populates='feedback', cascade='all, delete-orphan', order_by='FeedbackReply.created_at'
    )
    likes: Mapped[list['FeedbackLike']] = relationship(
        back_populates='feedback', cascade='all, delete-orphan'
    )


class FeedbackReply(UUIDPKMixin, Base):
    __tablename__ = 'feedback_replies'

    feedback_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey('platform_feedbacks.id', ondelete='CASCADE'), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True
    )
    message: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    feedback: Mapped['PlatformFeedback'] = relationship(back_populates='replies')
    user: Mapped['User'] = relationship(lazy='selectin')


class FeedbackLike(UUIDPKMixin, Base):
    __tablename__ = 'feedback_likes'
    __table_args__ = (
        UniqueConstraint('feedback_id', 'user_id', name='uq_feedback_likes_feedback_user'),
    )

    feedback_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey('platform_feedbacks.id', ondelete='CASCADE'), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    feedback: Mapped['PlatformFeedback'] = relationship(back_populates='likes')
    user: Mapped['User'] = relationship(lazy='selectin')

