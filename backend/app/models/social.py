import datetime
import uuid

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base, TimestampMixin, UUIDPKMixin


class PublicNote(UUIDPKMixin, TimestampMixin, Base):
    """
    Public notes (Zametka) posted by premium students (can_write_notes=True).
    Visible to all students to encourage engagement and show premium value.
    """
    __tablename__ = "public_notes"

    author_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("student_profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(String(50), nullable=False, default="general", index=True)
    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    likes_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    author: Mapped["StudentProfile"] = relationship("StudentProfile", lazy="selectin")
    likes: Mapped[list["NoteLike"]] = relationship(
        "NoteLike", back_populates="note", cascade="all, delete-orphan", lazy="selectin"
    )


class NoteLike(UUIDPKMixin, TimestampMixin, Base):
    """Likes on public notes."""
    __tablename__ = "note_likes"

    note_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("public_notes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("student_profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )

    note: Mapped["PublicNote"] = relationship("PublicNote", back_populates="likes")
    student: Mapped["StudentProfile"] = relationship("StudentProfile", lazy="selectin")

    __table_args__ = (
        UniqueConstraint("note_id", "student_id", name="uq_note_student_like"),
    )


class StudyGroup(UUIDPKMixin, TimestampMixin, Base):
    """
    Custom study groups created by Pro VIP students (can_create_groups=True).
    Students can join open study groups up to max_members.
    """
    __tablename__ = "study_groups"

    creator_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("student_profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    topic: Mapped[str] = mapped_column(String(64), nullable=False, default="IELTS / General English")
    max_members: Mapped[int] = mapped_column(Integer, default=8, nullable=False)
    invite_code: Mapped[str] = mapped_column(String(16), unique=True, nullable=False, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    creator: Mapped["StudentProfile"] = relationship("StudentProfile", lazy="selectin")
    members: Mapped[list["StudyGroupMember"]] = relationship(
        "StudyGroupMember", back_populates="group", cascade="all, delete-orphan", lazy="selectin"
    )


class StudyGroupMember(UUIDPKMixin, Base):
    """Members of a custom student study group."""
    __tablename__ = "study_group_members"

    study_group_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("study_groups.id", ondelete="CASCADE"), nullable=False, index=True
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("student_profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role: Mapped[str] = mapped_column(String(20), default="member", nullable=False)  # creator | member
    joined_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.datetime.now(datetime.timezone.utc), nullable=False
    )

    group: Mapped["StudyGroup"] = relationship("StudyGroup", back_populates="members")
    student: Mapped["StudentProfile"] = relationship("StudentProfile", lazy="selectin")

    __table_args__ = (
        UniqueConstraint("study_group_id", "student_id", name="uq_study_group_member"),
    )
