import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_teacher
from app.models.user import User
from app.models.group import Group
from app.models.student import StudentProfile
from app.schemas.group import GroupCreate, GroupOut, GroupUpdate
from app.db.session import get_db
router = APIRouter(prefix="/api/groups", tags=["groups"], dependencies=[Depends(require_teacher)])


async def _to_group_out(db: AsyncSession, group: Group) -> GroupOut:
    count = (
        await db.execute(select(func.count()).select_from(StudentProfile).where(StudentProfile.group_id == group.id))
    ).scalar_one()
    return GroupOut(
        id=group.id,
        name=group.name,
        english_level=group.english_level,
        schedule=group.schedule,
        is_active=group.is_active,
        student_count=count,
        created_at=group.created_at,
    )


@router.get("", response_model=list[GroupOut])
async def list_groups(
    include_archived: bool = False,
    current_user: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns all groups for the teacher panel.
    """
    query = select(Group).order_by(Group.name)
    if not include_archived:
        query = query.where(Group.is_active.is_(True))
    groups = (await db.execute(query)).scalars().all()
    return [await _to_group_out(db, g) for g in groups]


@router.post("", response_model=GroupOut, status_code=status.HTTP_201_CREATED)
async def create_group(body: GroupCreate, current_user: User = Depends(require_teacher), db: AsyncSession = Depends(get_db)):
    group = Group(
        name=body.name,
        english_level=body.english_level,
        schedule=body.schedule,
        created_by=current_user.id,
    )
    db.add(group)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A group with this name already exists")
    await db.refresh(group)
    return await _to_group_out(db, group)


@router.get("/{group_id}", response_model=GroupOut)
async def get_group(group_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    group = (await db.execute(select(Group).where(Group.id == group_id))).scalar_one_or_none()
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")
    return await _to_group_out(db, group)


@router.patch("/{group_id}", response_model=GroupOut)
async def update_group(group_id: uuid.UUID, body: GroupUpdate, db: AsyncSession = Depends(get_db)):
    group = (await db.execute(select(Group).where(Group.id == group_id))).scalar_one_or_none()
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(group, field, value)

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A group with this name already exists")
    await db.refresh(group)
    return await _to_group_out(db, group)


@router.delete("/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_group(group_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Permanently deletes the group safely."""
    group = (await db.execute(select(Group).where(Group.id == group_id))).scalar_one_or_none()
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")
    await db.delete(group)
    await db.commit()
    return None
