import uuid
from collections import Counter
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user, require_teacher
from app.db.session import get_db
from app.models.feedback import PlatformFeedback
from app.models.student import StudentProfile
from app.models.user import User, UserRole
from app.schemas.feedback import (
    PlatformFeedbackCreate,
    PlatformFeedbackOut,
    PlatformFeedbackStats,
)
from app.services.gamification_service import award_xp

router = APIRouter(prefix="/api/feedback", tags=["feedback"])


@router.post("/platform", response_model=PlatformFeedbackOut, status_code=status.HTTP_201_CREATED)
async def submit_platform_feedback(
    payload: PlatformFeedbackCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    feedback = PlatformFeedback(
        user_id=current_user.id,
        rating=payload.rating,
        category=payload.category.strip(),
        message=payload.message.strip(),
    )
    db.add(feedback)
    await db.flush()

    # Award +5 XP bonus if student
    if current_user.role == UserRole.STUDENT:
        sp_res = await db.execute(select(StudentProfile).where(StudentProfile.user_id == current_user.id))
        sp = sp_res.scalar_one_or_none()
        if sp:
            await award_xp(
                db,
                student_id=sp.id,
                amount=5,
                activity_type="platform_feedback",
                reference_id=str(feedback.id),
                description="Bonus XP for platform feedback",
            )

    await db.commit()
    await db.refresh(feedback)

    return PlatformFeedbackOut(
        id=feedback.id,
        user_id=feedback.user_id,
        user_full_name=current_user.full_name,
        user_role=current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role),
        rating=feedback.rating,
        category=feedback.category,
        message=feedback.message,
        created_at=feedback.created_at,
    )


@router.get("/teacher/platform", response_model=list[PlatformFeedbackOut], dependencies=[Depends(require_teacher)])
async def list_platform_feedback(
    db: AsyncSession = Depends(get_db),
):
    feedbacks = (
        await db.execute(
            select(PlatformFeedback)
            .options(selectinload(PlatformFeedback.user))
            .order_by(PlatformFeedback.created_at.desc())
        )
    ).scalars().all()

    return [
        PlatformFeedbackOut(
            id=f.id,
            user_id=f.user_id,
            user_full_name=f.user.full_name if f.user else "Anonymous User",
            user_role=f.user.role.value if (f.user and hasattr(f.user.role, "value")) else str(f.user.role if f.user else "student"),
            rating=f.rating,
            category=f.category,
            message=f.message,
            created_at=f.created_at,
        )
        for f in feedbacks
    ]


@router.get("/teacher/platform/stats", response_model=PlatformFeedbackStats, dependencies=[Depends(require_teacher)])
async def get_platform_feedback_stats(
    db: AsyncSession = Depends(get_db),
):
    feedbacks = (await db.execute(select(PlatformFeedback))).scalars().all()
    if not feedbacks:
        return PlatformFeedbackStats(
            average_rating=5.0,
            total_reviews=0,
            rating_distribution={"1": 0, "2": 0, "3": 0, "4": 0, "5": 0},
        )

    total = len(feedbacks)
    avg = sum(f.rating for f in feedbacks) / total
    counts = Counter(str(f.rating) for f in feedbacks)
    distribution = {str(star): counts.get(str(star), 0) for star in range(1, 6)}

    return PlatformFeedbackStats(
        average_rating=round(avg, 2),
        total_reviews=total,
        rating_distribution=distribution,
    )
