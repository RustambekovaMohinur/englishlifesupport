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
    StudentUpdate,
)

router = APIRouter(prefix="/api/students", tags=["students"])


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
    query = select(StudentProfile, User.email, User.is_active, Group.name.label("group_name")).join(
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
            phone=profile.phone,
            is_active=is_active,
            total_stars=profile.total_stars,
            group_name=group_name,
        )
        for profile, email, is_active, group_name in rows
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
        username=full_profile.user.username,
        full_name=full_profile.full_name,
        phone=full_profile.phone,
        bio=full_profile.bio,
        avatar_url=full_profile.avatar_url,
        is_active=full_profile.user.is_active,
        total_stars=full_profile.total_stars,
        group=full_profile.group,
        created_at=full_profile.created_at,
    )


@router.patch("/me", response_model=StudentOut)
async def update_my_student_profile(
    body: StudentUpdate,
    profile: StudentProfile = Depends(get_current_student_profile),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(StudentProfile)
        .options(selectinload(StudentProfile.group), selectinload(StudentProfile.user))
        .where(StudentProfile.id == profile.id)
    )
    full_profile = result.scalar_one()

    # Students cannot change their own group or active status
    if body.full_name is not None:
        full_profile.full_name = body.full_name
    if body.phone is not None:
        raw_phone = body.phone.strip()
        if raw_phone and not raw_phone.startswith("@") and not raw_phone.startswith("+"):
            raw_phone = f"@{raw_phone}"
        full_profile.phone = raw_phone or None
    if body.bio is not None:
        full_profile.bio = body.bio

    await db.commit()
    await db.refresh(full_profile, attribute_names=["group", "user"])

    return StudentOut(
        id=full_profile.id,
        user_id=full_profile.user_id,
        email=full_profile.user.email,
        username=full_profile.user.username,
        full_name=full_profile.full_name,
        phone=full_profile.phone,
        bio=full_profile.bio,
        avatar_url=full_profile.avatar_url,
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
        username=profile.user.username,
        full_name=profile.full_name,
        phone=profile.phone,
        bio=profile.bio,
        avatar_url=profile.avatar_url,
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
        is_active=profile.user.is_active,
        total_stars=profile.total_stars,
        group=profile.group,
        created_at=profile.created_at,
    )


@router.delete("/{student_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_teacher)])
async def delete_student(student_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Permanently deletes student profile and user account."""
    profile = (
        await db.execute(select(StudentProfile).where(StudentProfile.id == student_id))
    ).scalar_one_or_none()
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")

    user = (await db.execute(select(User).where(User.id == profile.user_id))).scalar_one_or_none()
    if user:
        await db.delete(user)
    else:
        await db.delete(profile)
    await db.commit()
    return None
