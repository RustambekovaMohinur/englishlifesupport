import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_student_profile, require_teacher
from app.db.session import get_db
from app.models.group import Group
from app.models.student import StudentProfile
from app.models.user import User
from app.schemas.student import (
    PaginatedStudents,
    StudentListItem,
    StudentOut,
    StudentStatusUpdate,
    StudentTelegramLink,
    StudentUpdate,
)

router = APIRouter(prefix="/api/students", tags=["students"])


def student_telegram_connected(profile: StudentProfile | None) -> bool:
    if profile is None:
        return False
    chat_id = (profile.telegram_chat_id or "").strip()
    username = (profile.telegram_username or "").strip()
    return bool(chat_id or username)


@router.post("/telegram/link", response_model=StudentOut)
async def link_student_telegram(
    body: StudentTelegramLink,
    db: AsyncSession = Depends(get_db),
):
    """Associate a Telegram account with a student profile using the bot's /start data or a login lookup."""
    if not body.student_id and not body.email and not body.telegram_chat_id and not body.telegram_username:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No student identifier or Telegram data provided")

    normalized_username = body.telegram_username.strip().lstrip("@") if body.telegram_username else None
    normalized_chat_id = body.telegram_chat_id.strip() if body.telegram_chat_id else None

    query = select(StudentProfile).options(selectinload(StudentProfile.group), selectinload(StudentProfile.user))

    if body.student_id:
        query = query.where(StudentProfile.id == body.student_id)
    elif body.email:
        query = query.join(User, StudentProfile.user_id == User.id).where(User.email == str(body.email))
    elif normalized_chat_id:
        query = query.where(StudentProfile.telegram_chat_id == normalized_chat_id)
    elif normalized_username:
        query = query.where(StudentProfile.telegram_username == normalized_username)
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Telegram link request missing a valid identifier")

    profile = (await db.execute(query)).scalar_one_or_none()
    if profile is None:
        if normalized_chat_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No student matched this Telegram chat ID")
        if normalized_username:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No student matched this Telegram username")
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")

    if normalized_chat_id:
        profile.telegram_chat_id = normalized_chat_id
    if normalized_username:
        profile.telegram_username = normalized_username

    await db.commit()
    await db.refresh(profile, attribute_names=["group", "user"])
    return StudentOut(
        id=profile.id,
        user_id=profile.user_id,
        email=profile.user.email,
        full_name=profile.full_name,
        phone=profile.phone,
        telegram_chat_id=profile.telegram_chat_id,
        telegram_username=profile.telegram_username,
        telegram_connected=student_telegram_connected(profile),
        is_active=profile.user.is_active,
        total_stars=profile.total_stars,
        group=profile.group,
        created_at=profile.created_at,
    )


@router.get("", response_model=PaginatedStudents, dependencies=[Depends(require_teacher)])
async def list_students(
    db: AsyncSession = Depends(get_db),
    search: str | None = Query(default=None, description="Search by name or email"),
    group_id: uuid.UUID | None = Query(default=None),
    is_active: bool | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
):
    """Teacher-only. Server-side paginated/searchable/filterable list - never
    dumps all 500+ students to the client at once."""
    query = select(StudentProfile, User.email, Group.name.label("group_name")).join(
        User, StudentProfile.user_id == User.id
    ).outerjoin(Group, StudentProfile.group_id == Group.id)

    if search:
        like = f"%{search.strip()}%"
        query = query.where(or_(StudentProfile.full_name.ilike(like), User.email.ilike(like)))
    if group_id:
        query = query.where(StudentProfile.group_id == group_id)
    if is_active is not None:
        query = query.where(User.is_active == is_active)

    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar_one()

    query = query.order_by(StudentProfile.full_name).offset((page - 1) * page_size).limit(page_size)
    rows = (await db.execute(query)).all()

    items = [
        StudentListItem(
            id=profile.id,
            full_name=profile.full_name,
            email=email,
            telegram_chat_id=profile.telegram_chat_id,
            telegram_username=profile.telegram_username,
            telegram_connected=student_telegram_connected(profile),
            is_active=profile.user.is_active if profile.user else True,
            total_stars=profile.total_stars,
            group_name=group_name,
        )
        for profile, email, group_name in rows
    ]
    # is_active comes from the User row via a join above; fetch it directly since
    # profile.user may trigger a lazy-load in async context otherwise.
    return PaginatedStudents(items=items, total=total, page=page, page_size=page_size)


@router.get("/me", response_model=StudentOut)
async def get_my_profile(
    profile: StudentProfile = Depends(get_current_student_profile),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(StudentProfile)
        .options(selectinload(StudentProfile.group), selectinload(StudentProfile.user))
        .where(StudentProfile.id == profile.id)
    )
    full_profile = result.scalar_one()
    return StudentOut(
        id=full_profile.id,
        user_id=full_profile.user_id,
        email=full_profile.user.email,
        full_name=full_profile.full_name,
        phone=full_profile.phone,
        telegram_chat_id=full_profile.telegram_chat_id,
        telegram_username=full_profile.telegram_username,
        telegram_connected=student_telegram_connected(full_profile),
        is_active=full_profile.user.is_active,
        total_stars=full_profile.total_stars,
        group=full_profile.group,
        created_at=full_profile.created_at,
    )


@router.get("/{student_id}", response_model=StudentOut, dependencies=[Depends(require_teacher)])
async def get_student(student_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(StudentProfile)
        .options(selectinload(StudentProfile.group), selectinload(StudentProfile.user))
        .where(StudentProfile.id == student_id)
    )
    profile = result.scalar_one_or_none()
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")
    return StudentOut(
        id=profile.id,
        user_id=profile.user_id,
        email=profile.user.email,
        full_name=profile.full_name,
        phone=profile.phone,
        telegram_chat_id=profile.telegram_chat_id,
        telegram_username=profile.telegram_username,
        telegram_connected=student_telegram_connected(profile),
        is_active=profile.user.is_active,
        total_stars=profile.total_stars,
        group=profile.group,
        created_at=profile.created_at,
    )


@router.patch("/{student_id}", response_model=StudentOut, dependencies=[Depends(require_teacher)])
async def update_student(student_id: uuid.UUID, body: StudentUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(StudentProfile)
        .options(selectinload(StudentProfile.group), selectinload(StudentProfile.user))
        .where(StudentProfile.id == student_id)
    )
    profile = result.scalar_one_or_none()
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")

    if body.group_id is not None:
        group = (await db.execute(select(Group).where(Group.id == body.group_id))).scalar_one_or_none()
        if group is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Group not found")

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(profile, field, value)

    await db.commit()
    await db.refresh(profile, attribute_names=["group", "user"])
    return StudentOut(
        id=profile.id,
        user_id=profile.user_id,
        email=profile.user.email,
        full_name=profile.full_name,
        phone=profile.phone,
        telegram_chat_id=profile.telegram_chat_id,
        telegram_username=profile.telegram_username,
        telegram_connected=student_telegram_connected(profile),
        is_active=profile.user.is_active,
        total_stars=profile.total_stars,
        group=profile.group,
        created_at=profile.created_at,
    )


@router.patch("/{student_id}/status", response_model=StudentOut, dependencies=[Depends(require_teacher)])
async def set_student_status(student_id: uuid.UUID, body: StudentStatusUpdate, db: AsyncSession = Depends(get_db)):
    """Activate/deactivate a student. Deactivating immediately blocks their
    login and API access (checked in get_current_user on every request)."""
    result = await db.execute(
        select(StudentProfile)
        .options(selectinload(StudentProfile.group), selectinload(StudentProfile.user))
        .where(StudentProfile.id == student_id)
    )
    profile = result.scalar_one_or_none()
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")

    profile.user.is_active = body.is_active
    await db.commit()
    await db.refresh(profile, attribute_names=["group", "user"])
    return StudentOut(
        id=profile.id,
        user_id=profile.user_id,
        email=profile.user.email,
        full_name=profile.full_name,
        phone=profile.phone,
        telegram_chat_id=profile.telegram_chat_id,
        telegram_username=profile.telegram_username,
        telegram_connected=student_telegram_connected(profile),
        is_active=profile.user.is_active,
        total_stars=profile.total_stars,
        group=profile.group,
        created_at=profile.created_at,
    )
