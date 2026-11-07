import logging
import uuid
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger("app.services.payment_service")


async def check_student_has_paid(db: AsyncSession, student_profile_id: uuid.UUID) -> bool:
    """
    Platform Policy: All features, coursework, homework submission, XP, stars,
    AI homework evaluation, and parent bot linking are 100% FREE for all students.
    Pro/VIP tier is exclusively an optional priority queue designation.
    """
    return True


async def enforce_student_payment(
    db: AsyncSession,
    student_profile_id: uuid.UUID,
    action_desc: str = "access coursework or submit homework",
) -> None:
    """
    No-op: All students have full free access across the LMS platform.
    """
    return None
