import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base, TimestampMixin, UUIDPKMixin


class PremiumPlan(str, enum.Enum):
    FREE = "free"
    STANDARD = "standard"
    PRO_VIP = "pro_vip"


class UserRole(str, enum.Enum):
    TEACHER = "teacher"
    STUDENT = "student"


class ApprovalStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class User(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="user_role", values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        index=True,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    approval_status: Mapped[ApprovalStatus] = mapped_column(
        Enum(ApprovalStatus, name="approval_status", values_callable=lambda x: [e.value for e in x]),
        default=ApprovalStatus.APPROVED,
        nullable=False,
        index=True,
    )
    # Global unique username (case‑insensitive)
    username: Mapped[str] = mapped_column(String(255), nullable=False, index=True)

    # Premium & Social Ecosystem fields
    is_premium: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    premium_plan: Mapped[str] = mapped_column(String(32), default="free", nullable=False)
    premium_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    custom_badge: Mapped[str | None] = mapped_column(String(16), nullable=True)
    profile_bg_theme: Mapped[str] = mapped_column(String(64), default="default", nullable=False)
    can_write_notes: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    can_private_chat: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    can_create_groups: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


    student_profile: Mapped["StudentProfile | None"] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    teacher_profile: Mapped["TeacherProfile | None"] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    refresh_tokens: Mapped[list["RefreshToken"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )

    @property
    def full_name(self) -> str:
        from sqlalchemy.orm import attributes
        state = attributes.instance_state(self)
        if "student_profile" in state.dict:
            sp = state.dict["student_profile"]
            if sp and getattr(sp, "full_name", None):
                return sp.full_name
        if "teacher_profile" in state.dict:
            tp = state.dict["teacher_profile"]
            if tp and getattr(tp, "full_name", None):
                return tp.full_name
        return self.username or self.email

    @property
    def first_name(self) -> str:
        name = self.full_name
        return name.split()[0] if name else ""

    @property
    def last_name(self) -> str:
        parts = self.full_name.split()
        return " ".join(parts[1:]) if len(parts) > 1 else ""

