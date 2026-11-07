import logging
import uuid
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException, status

from app.models.payment import PaymentTransaction
from app.models.student import StudentProfile
from app.models.user import User
from app.utils.datetimes import utcnow, ensure_utc

logger = logging.getLogger("app.services.payment_service")


async def check_student_has_paid(db: AsyncSession, student_profile_id: uuid.UUID) -> bool:
    """
    Strict payment verification check for student coursework, homework submissions,
    and active cohort access:
    1. Verified successful payment transaction in database (Click, Payme, card transfer)
       with status 'completed' or 'paid'.
    2. Active valid premium plan (standard or pro_vip) with non-expired timestamp.
    """
    try:
        # 1. Check StudentProfile & associated User premium status
        prof_res = await db.execute(
            select(StudentProfile).where(StudentProfile.id == student_profile_id)
        )
        prof = prof_res.scalar_one_or_none()
        if prof:
            if prof.is_premium and getattr(prof, "premium_plan", "free") in ("standard", "pro_vip"):
                if prof.premium_expires_at is None or ensure_utc(prof.premium_expires_at) > ensure_utc(utcnow()):
                    return True

            # Also check user record directly
            if prof.user_id:
                user_res = await db.execute(select(User).where(User.id == prof.user_id))
                user = user_res.scalar_one_or_none()
                if user and getattr(user, "is_premium", False):
                    if user.premium_expires_at is None or ensure_utc(user.premium_expires_at) > ensure_utc(utcnow()):
                        return True

        # 2. Check PaymentTransaction records for verified paid/completed transaction
        tx_res = await db.execute(
            select(PaymentTransaction).where(
                PaymentTransaction.student_id == student_profile_id,
                PaymentTransaction.status.in_(["completed", "paid"]),
            )
        )
        if tx_res.scalars().first() is not None:
            return True

        return False
    except Exception as exc:
        logger.exception("Error checking payment status for student profile %s: %s", student_profile_id, exc)
        return False


async def enforce_student_payment(
    db: AsyncSession,
    student_profile_id: uuid.UUID,
    action_desc: str = "access coursework or submit homework",
) -> None:
    """
    Enforces that student has paid. Raises 403 Forbidden with PAYMENT_REQUIRED code
    and directs to /student/billing.
    """
    has_paid = await check_student_has_paid(db, student_profile_id)
    if not has_paid:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Payment verification required (PAYMENT_REQUIRED): Please complete your subscription payment via Click or Payme at /student/billing before you can {action_desc}.",
        )
