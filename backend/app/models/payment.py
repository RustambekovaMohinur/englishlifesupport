from datetime import datetime, timezone
import uuid

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base, UUIDPKMixin


class PaymentTransaction(UUIDPKMixin, Base):
    """
    Secure tokenized payment transactions (Click / Payme / Mock).
    CRITICAL SECURITY GUARANTEE:
    No credit/debit card numbers, CVVs, or sensitive authentication data
    are ever stored in this table or anywhere in the LMS database.
    """
    __tablename__ = "payment_transactions"

    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("student_profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    provider: Mapped[str] = mapped_column(String(32), default="mock", nullable=False)  # click | payme | mock
    provider_transaction_id: Mapped[str] = mapped_column(String(128), unique=True, nullable=False, index=True)
    plan: Mapped[str] = mapped_column(String(32), nullable=False)  # standard | pro_vip
    amount_uzs: Mapped[int] = mapped_column(Integer, nullable=False)  # 19000 | 29000
    currency: Mapped[str] = mapped_column(String(8), default="UZS", nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="pending", nullable=False, index=True)  # pending | completed | failed | cancelled
    metadata_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    student: Mapped["StudentProfile"] = relationship("StudentProfile", lazy="selectin")
