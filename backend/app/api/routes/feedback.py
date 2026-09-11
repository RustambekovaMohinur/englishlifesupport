import uuid
from collections import Counter
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_teacher
from app.db.session import get_db
from app.models.feedback import FeedbackLike, FeedbackReply, PlatformFeedback
from app.models.student import StudentProfile
from app.models.teacher import TeacherProfile
from app.models.user import User, UserRole
from app.schemas.feedback import (
    FeedbackLikeToggleOut,
    FeedbackReplyCreate,
    FeedbackReplyOut,
    PlatformFeedbackCreate,
    PlatformFeedbackOut,
    PlatformFeedbackStats,
    PlatformFeedbackSummary,
)
from app.services.gamification_service import award_xp

router = APIRouter(prefix="/api/feedback", tags=["feedback"])


@router.post("", status_code=status.HTTP_201_CREATED)
@router.post("/platform", status_code=status.HTTP_201_CREATED)
async def submit_platform_feedback(
    payload: PlatformFeedbackCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Submits or updates platform feedback.
    Completely decoupled from ORM relationship traversal to prevent greenlet_spawn crashes.
    """
    # 1. Extract all primitive values before DB session operations
    user_id = current_user.id
    user_full_name = getattr(current_user, "full_name", None) or getattr(current_user, "username", "User")
    user_role_str = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)

    what_works = payload.what_works_well.strip() if payload.what_works_well else None
    what_improve = payload.what_to_improve.strip() if payload.what_to_improve else None
    cat = (payload.category or "Platform Experience").strip()
    msg = payload.message.strip() if payload.message else (what_works or what_improve or "")
    now = datetime.now(timezone.utc)

    # 2. Check if user already submitted feedback (upsert by user_id)
    existing_id = (
        await db.execute(
            select(PlatformFeedback.id)
            .where(PlatformFeedback.user_id == user_id)
            .order_by(PlatformFeedback.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()

    is_new = False
    if existing_id is None:
        feedback_id = uuid.uuid4()
        feedback = PlatformFeedback(
            id=feedback_id,
            user_id=user_id,
            rating=payload.rating,
            what_works_well=what_works,
            what_to_improve=what_improve,
            category=cat,
            message=msg,
        )
        db.add(feedback)
        is_new = True
    else:
        feedback_id = existing_id
        await db.execute(
            update(PlatformFeedback)
            .where(PlatformFeedback.id == feedback_id)
            .values(
                rating=payload.rating,
                what_works_well=what_works,
                what_to_improve=what_improve,
                category=cat,
                message=msg,
                updated_at=now,
            )
        )

    # 3. Retrieve student full_name and award +5 XP bonus if first review
    if user_role_str == "student":
        try:
            sp_info = (
                await db.execute(
                    select(StudentProfile.id, StudentProfile.full_name).where(StudentProfile.user_id == user_id)
                )
            ).first()
            if sp_info:
                if sp_info.full_name:
                    user_full_name = sp_info.full_name
                if is_new:
                    await award_xp(
                        db,
                        student_id=sp_info.id,
                        amount=5,
                        activity_type="platform_feedback",
                        reference_id=str(feedback_id),
                        description="Bonus XP for platform feedback",
                    )
        except Exception:
            pass

    await db.commit()

    # 4. Return pure primitive dictionary (Zero ORM relationship traversal!)
    return {
        "status": "success",
        "message": "Fikringiz uchun rahmat! Tizimni yanada yaxshilaymiz! 🌟",
        "id": str(feedback_id),
        "user_id": str(user_id),
        "user_full_name": user_full_name,
        "user_role": user_role_str,
        "rating": payload.rating,
        "what_works_well": what_works,
        "what_to_improve": what_improve,
        "category": cat,
        "created_at": now.isoformat(),
    }


@router.get("/summary", response_model=PlatformFeedbackSummary)
async def get_platform_feedback_summary(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Return community rating summary and user's review status using pure joined queries.
    Immune to greenlet_spawn / lazy-loading IO.
    """
    stmt = (
        select(
            PlatformFeedback.id,
            PlatformFeedback.user_id,
            PlatformFeedback.rating,
            PlatformFeedback.what_works_well,
            PlatformFeedback.what_to_improve,
            PlatformFeedback.category,
            PlatformFeedback.message,
            PlatformFeedback.created_at,
            User.username,
            User.role,
            StudentProfile.full_name.label("student_name"),
        )
        .join(User, PlatformFeedback.user_id == User.id, isouter=True)
        .join(StudentProfile, User.id == StudentProfile.user_id, isouter=True)
        .order_by(PlatformFeedback.created_at.desc())
    )
    rows = (await db.execute(stmt)).all()

    if not rows:
        return PlatformFeedbackSummary(
            average_rating=5.0,
            total_reviews=0,
            rating_distribution={"1": 0, "2": 0, "3": 0, "4": 0, "5": 0},
            user_has_reviewed=False,
            user_review=None,
        )

    total = len(rows)
    avg = sum(r.rating for r in rows) / total
    counts = Counter(str(r.rating) for r in rows)
    distribution = {str(star): counts.get(str(star), 0) for star in range(1, 6)}

    # Check for current user's review
    user_review = None
    for r in rows:
        if r.user_id == current_user.id:
            role_val = r.role.value if hasattr(r.role, "value") else str(r.role or "student")
            name_val = r.student_name or r.username or "Anonymous"
            user_review = PlatformFeedbackOut(
                id=r.id,
                user_id=r.user_id,
                user_full_name=name_val,
                user_role=role_val,
                rating=r.rating,
                what_works_well=r.what_works_well,
                what_to_improve=r.what_to_improve,
                category=r.category,
                message=r.message,
                created_at=r.created_at,
            )
            break

    return PlatformFeedbackSummary(
        average_rating=round(avg, 1),
        total_reviews=total,
        rating_distribution=distribution,
        user_has_reviewed=user_review is not None,
        user_review=user_review,
    )


@router.get("", response_model=list[PlatformFeedbackOut], dependencies=[Depends(require_teacher)])
@router.get("/all", response_model=list[PlatformFeedbackOut], dependencies=[Depends(require_teacher)])
@router.get("/teacher/platform", response_model=list[PlatformFeedbackOut], dependencies=[Depends(require_teacher)])
async def list_platform_feedback(
    rating: int | None = Query(None, ge=1, le=5, description="Filter by star rating"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """
    Teacher Feedback Review Panel: retrieves student reviews with rating filters and pagination.
    Uses pure joined columns with zero lazy-loading IO.
    """
    stmt = (
        select(
            PlatformFeedback.id,
            PlatformFeedback.user_id,
            PlatformFeedback.rating,
            PlatformFeedback.what_works_well,
            PlatformFeedback.what_to_improve,
            PlatformFeedback.category,
            PlatformFeedback.message,
            PlatformFeedback.created_at,
            User.username,
            User.role,
            StudentProfile.full_name.label("student_name"),
        )
        .join(User, PlatformFeedback.user_id == User.id, isouter=True)
        .join(StudentProfile, User.id == StudentProfile.user_id, isouter=True)
    )

    if rating is not None:
        stmt = stmt.where(PlatformFeedback.rating == rating)

    stmt = stmt.order_by(PlatformFeedback.created_at.desc()).offset(offset).limit(limit)
    rows = (await db.execute(stmt)).all()

    items = []
    for r in rows:
        role_val = r.role.value if hasattr(r.role, "value") else str(r.role or "student")
        name_val = r.student_name or r.username or "Student"
        items.append(
            PlatformFeedbackOut(
                id=r.id,
                user_id=r.user_id,
                user_full_name=name_val,
                user_role=role_val,
                rating=r.rating,
                what_works_well=r.what_works_well,
                what_to_improve=r.what_to_improve,
                category=r.category,
                message=r.message,
                created_at=r.created_at,
            )
        )

    return items


@router.get("/stats", response_model=PlatformFeedbackStats, dependencies=[Depends(require_teacher)])
@router.get("/teacher/platform/stats", response_model=PlatformFeedbackStats, dependencies=[Depends(require_teacher)])
async def get_platform_feedback_stats(
    db: AsyncSession = Depends(get_db),
):
    """Aggregated stats for the teacher dashboard review panel."""
    ratings = (await db.execute(select(PlatformFeedback.rating))).scalars().all()
    if not ratings:
        return PlatformFeedbackStats(
            average_rating=5.0,
            total_reviews=0,
            rating_distribution={"1": 0, "2": 0, "3": 0, "4": 0, "5": 0},
        )

    total = len(ratings)
    avg = sum(ratings) / total
    counts = Counter(str(r) for r in ratings)
    distribution = {str(star): counts.get(str(star), 0) for star in range(1, 6)}

    return PlatformFeedbackStats(
        average_rating=round(avg, 2),
        total_reviews=total,
        rating_distribution=distribution,
    )


@router.post("/{feedback_id}/like", response_model=FeedbackLikeToggleOut)
async def toggle_feedback_like(
    feedback_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Toggle like on a platform feedback post.
    If already liked -> unlike and return liked=False.
    If not liked -> insert like and return liked=True.
    """
    # 1. Verify feedback exists
    exists = (
        await db.execute(select(PlatformFeedback.id).where(PlatformFeedback.id == feedback_id))
    ).scalar_one_or_none()
    if not exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feedback post not found")

    # 2. Check if user already liked
    existing_like = (
        await db.execute(
            select(FeedbackLike.id).where(
                FeedbackLike.feedback_id == feedback_id, FeedbackLike.user_id == current_user.id
            )
        )
    ).scalar_one_or_none()

    if existing_like:
        await db.execute(delete(FeedbackLike).where(FeedbackLike.id == existing_like))
        liked = False
    else:
        new_like = FeedbackLike(
            id=uuid.uuid4(),
            feedback_id=feedback_id,
            user_id=current_user.id,
        )
        db.add(new_like)
        liked = True

    await db.commit()

    # 3. Get fresh likes count
    count = (
        await db.execute(
            select(func.count(FeedbackLike.id)).where(FeedbackLike.feedback_id == feedback_id)
        )
    ).scalar() or 0

    return FeedbackLikeToggleOut(liked=liked, likes_count=count)


@router.post("/{feedback_id}/replies", response_model=FeedbackReplyOut, status_code=status.HTTP_201_CREATED)
async def add_feedback_reply(
    feedback_id: uuid.UUID,
    payload: FeedbackReplyCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Add a reply to a platform feedback post.
    Decoupled from lazy-loaded ORM attributes to prevent greenlet_spawn crashes.
    """
    # 1. Verify feedback exists
    exists = (
        await db.execute(select(PlatformFeedback.id).where(PlatformFeedback.id == feedback_id))
    ).scalar_one_or_none()
    if not exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feedback post not found")

    clean_msg = payload.message.strip()
    if not clean_msg:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Reply message cannot be empty")

    reply_id = uuid.uuid4()
    reply = FeedbackReply(
        id=reply_id,
        feedback_id=feedback_id,
        user_id=current_user.id,
        message=clean_msg,
    )
    db.add(reply)
    await db.commit()

    # 2. Fetch author display info via joined query
    user_role_str = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
    author_name = getattr(current_user, "username", "Foydalanuvchi")
    author_avatar = f"/api/profile/{current_user.id}/avatar"

    if user_role_str == "student":
        sp = (
            await db.execute(
                select(StudentProfile.full_name, StudentProfile.avatar_url).where(
                    StudentProfile.user_id == current_user.id
                )
            )
        ).first()
        if sp:
            if sp.full_name:
                author_name = sp.full_name
            if sp.avatar_url:
                author_avatar = sp.avatar_url
    elif user_role_str in ["teacher", "admin", "superadmin"]:
        tp = (
            await db.execute(
                select(TeacherProfile.full_name, TeacherProfile.avatar_url).where(
                    TeacherProfile.user_id == current_user.id
                )
            )
        ).first()
        if tp:
            if tp.full_name:
                author_name = tp.full_name
            if tp.avatar_url:
                author_avatar = tp.avatar_url

    return FeedbackReplyOut(
        id=str(reply_id),
        feedback_id=str(feedback_id),
        user_id=str(current_user.id),
        author_name=author_name,
        author_avatar=author_avatar,
        author_role=user_role_str,
        message=clean_msg,
        created_at=datetime.now(timezone.utc).isoformat(),
    )


@router.get("/public")
async def get_public_feedbacks(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Public Community Reviews Feed:
    Accessible to all authenticated students and teachers.
    Enriched with likes_count, has_liked, and threaded replies.
    Uses pure joined queries with zero ORM relationship lazy loading to avoid greenlet_spawn crashes.
    """
    # 1. Fetch feedbacks
    stmt = (
        select(
            PlatformFeedback.id,
            PlatformFeedback.user_id,
            PlatformFeedback.rating,
            PlatformFeedback.what_works_well,
            PlatformFeedback.what_to_improve,
            PlatformFeedback.category,
            PlatformFeedback.message,
            PlatformFeedback.created_at,
            User.username,
            User.role,
            StudentProfile.full_name.label("student_name"),
            StudentProfile.avatar_url.label("student_avatar"),
        )
        .join(User, PlatformFeedback.user_id == User.id, isouter=True)
        .join(StudentProfile, User.id == StudentProfile.user_id, isouter=True)
        .order_by(PlatformFeedback.created_at.desc())
        .limit(50)
    )
    rows = (await db.execute(stmt)).all()
    if not rows:
        return []

    feedback_ids = [r.id for r in rows]

    # 2. Fetch likes stats for these feedbacks
    likes_rows = (
        await db.execute(
            select(FeedbackLike.feedback_id, FeedbackLike.user_id).where(
                FeedbackLike.feedback_id.in_(feedback_ids)
            )
        )
    ).all()

    likes_count_map: dict[uuid.UUID, int] = {}
    user_liked_set: set[uuid.UUID] = set()
    for l_fb_id, l_u_id in likes_rows:
        likes_count_map[l_fb_id] = likes_count_map.get(l_fb_id, 0) + 1
        if l_u_id == current_user.id:
            user_liked_set.add(l_fb_id)

    # 3. Fetch replies for these feedbacks
    replies_stmt = (
        select(
            FeedbackReply.id,
            FeedbackReply.feedback_id,
            FeedbackReply.user_id,
            FeedbackReply.message,
            FeedbackReply.created_at,
            User.username,
            User.role,
            StudentProfile.full_name.label("student_name"),
            StudentProfile.avatar_url.label("student_avatar"),
            TeacherProfile.full_name.label("teacher_name"),
            TeacherProfile.avatar_url.label("teacher_avatar"),
        )
        .join(User, FeedbackReply.user_id == User.id, isouter=True)
        .join(StudentProfile, User.id == StudentProfile.user_id, isouter=True)
        .join(TeacherProfile, User.id == TeacherProfile.user_id, isouter=True)
        .where(FeedbackReply.feedback_id.in_(feedback_ids))
        .order_by(FeedbackReply.created_at.asc())
    )
    reply_rows = (await db.execute(replies_stmt)).all()

    replies_map: dict[uuid.UUID, list] = {fb_id: [] for fb_id in feedback_ids}
    for rep in reply_rows:
        role_val = rep.role.value if hasattr(rep.role, "value") else str(rep.role or "student")
        if role_val == "teacher" or role_val in ["admin", "superadmin"]:
            rep_author_name = rep.teacher_name or rep.username or "O'qituvchi"
            rep_author_avatar = rep.teacher_avatar or f"/api/profile/{rep.user_id}/avatar"
        else:
            rep_author_name = rep.student_name or rep.username or "O'quvchi"
            rep_author_avatar = rep.student_avatar or f"/api/profile/{rep.user_id}/avatar"

        replies_map[rep.feedback_id].append({
            "id": str(rep.id),
            "feedback_id": str(rep.feedback_id),
            "user_id": str(rep.user_id),
            "author_name": rep_author_name,
            "author_avatar": rep_author_avatar,
            "author_role": role_val,
            "message": rep.message,
            "created_at": rep.created_at.isoformat() if rep.created_at else None,
            "is_mine": (rep.user_id == current_user.id),
        })

    # 4. Build final response
    output = []
    for r in rows:
        author_name = r.student_name or r.username or "O'quvchi"
        author_avatar = r.student_avatar or f"/api/profile/{r.user_id}/avatar"

        output.append({
            "id": str(r.id),
            "rating": r.rating,
            "what_works_well": r.what_works_well,
            "what_to_improve": r.what_to_improve,
            "message": r.message,
            "category": r.category,
            "author_name": author_name,
            "author_avatar": author_avatar,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "is_mine": (r.user_id == current_user.id),
            "likes_count": likes_count_map.get(r.id, 0),
            "has_liked": (r.id in user_liked_set),
            "replies": replies_map.get(r.id, []),
        })

    return output



