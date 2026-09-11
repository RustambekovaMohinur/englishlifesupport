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
    PlatformFeedbackSummary,
)
from app.services.gamification_service import award_xp

router = APIRouter(prefix="/api/feedback", tags=["feedback"])


def _to_out(feedback: PlatformFeedback, user: User | None = None) -> PlatformFeedbackOut:
    u = user or getattr(feedback, "user", None)
    full_name = u.full_name if u else "Anonymous User"
    role_str = u.role.value if (u and hasattr(u.role, "value")) else str(u.role if u else "student")
    return PlatformFeedbackOut(
        id=feedback.id,
        user_id=feedback.user_id,
        user_full_name=full_name,
        user_role=role_str,
        rating=feedback.rating,
        what_works_well=feedback.what_works_well,
        what_to_improve=feedback.what_to_improve,
        category=feedback.category,
        message=feedback.message,
        created_at=feedback.created_at,
    )


@router.post("", response_model=PlatformFeedbackOut, status_code=status.HTTP_201_CREATED)
@router.post("/platform", response_model=PlatformFeedbackOut, status_code=status.HTTP_201_CREATED)
async def submit_platform_feedback(
    payload: PlatformFeedbackCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Check if user already submitted feedback (upsert)
    res = await db.execute(
        select(PlatformFeedback)
        .where(PlatformFeedback.user_id == current_user.id)
        .order_by(PlatformFeedback.created_at.desc())
    )
    feedback = res.scalars().first()
    is_new = False

    what_works = payload.what_works_well.strip() if payload.what_works_well else None
    what_improve = payload.what_to_improve.strip() if payload.what_to_improve else None
    cat = (payload.category or "Platform Experience").strip()
    msg = payload.message.strip() if payload.message else (what_works or what_improve or "")

    if not feedback:
        feedback = PlatformFeedback(
            user_id=current_user.id,
            rating=payload.rating,
            what_works_well=what_works,
            what_to_improve=what_improve,
            category=cat,
            message=msg,
        )
        db.add(feedback)
        is_new = True
    else:
        feedback.rating = payload.rating
        feedback.what_works_well = what_works
        feedback.what_to_improve = what_improve
        feedback.category = cat
        feedback.message = msg

    await db.flush()

    # Award +5 XP bonus if student and first review
    if is_new and current_user.role == UserRole.STUDENT:
        sp_res = await db.execute(select(StudentProfile).where(StudentProfile.user_id == current_user.id))
        sp = sp_res.scalars().first()
        if sp:
            try:
                await award_xp(
                    db,
                    student_id=sp.id,
                    amount=5,
                    activity_type="platform_feedback",
                    reference_id=str(feedback.id),
                    description="Bonus XP for platform feedback",
                )
            except Exception:
                pass

    await db.commit()
    await db.refresh(feedback)

    return _to_out(feedback, current_user)


@router.get("/summary", response_model=PlatformFeedbackSummary)
async def get_platform_feedback_summary(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return public community rating summary and user's review status."""
    feedbacks = (await db.execute(select(PlatformFeedback))).scalars().all()
    if not feedbacks:
        return PlatformFeedbackSummary(
            average_rating=5.0,
            total_reviews=0,
            rating_distribution={"1": 0, "2": 0, "3": 0, "4": 0, "5": 0},
            user_has_reviewed=False,
            user_review=None,
        )

    total = len(feedbacks)
    avg = sum(f.rating for f in feedbacks) / total
    counts = Counter(str(f.rating) for f in feedbacks)
    distribution = {str(star): counts.get(str(star), 0) for star in range(1, 6)}

    # User review
    user_feedbacks = [f for f in feedbacks if f.user_id == current_user.id]
    user_review = None
    if user_feedbacks:
        latest = sorted(user_feedbacks, key=lambda x: x.created_at, reverse=True)[0]
        user_review = _to_out(latest, current_user)

    return PlatformFeedbackSummary(
        average_rating=round(avg, 1),
        total_reviews=total,
        rating_distribution=distribution,
        user_has_reviewed=bool(user_review),
        user_review=user_review,
    )


@router.get("/all", response_model=list[PlatformFeedbackOut], dependencies=[Depends(require_teacher)])
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

    return [_to_out(f, f.user) for f in feedbacks]


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

