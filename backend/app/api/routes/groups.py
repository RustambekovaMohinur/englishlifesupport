import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_teacher
from app.db.session import get_db
from app.models.assignment import Assignment
from app.models.group import Group
from app.models.student import StudentProfile
from app.models.submission import Submission
from app.models.user import User
from app.schemas.group import GroupCreate, GroupOut, GroupTelegramSync, GroupUpdate
from app.services.telegram_sync import build_group_status_snapshot, notify_accountability_reminder, send_telegram_message

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
        telegram_chat_id=group.telegram_chat_id,
        telegram_chat_title=group.telegram_chat_title,
        telegram_sync_enabled=group.telegram_sync_enabled,
        telegram_last_synced_at=group.telegram_last_synced_at,
        student_count=count,
        created_at=group.created_at,
    )


@router.get("", response_model=list[GroupOut])
async def list_groups(db: AsyncSession = Depends(get_db)):
    groups = (await db.execute(select(Group).order_by(Group.name))).scalars().all()
    return [await _to_group_out(db, g) for g in groups]


@router.post("", response_model=GroupOut, status_code=status.HTTP_201_CREATED)
async def create_group(body: GroupCreate, db: AsyncSession = Depends(get_db)):
    group = Group(
        name=body.name,
        english_level=body.english_level,
        schedule=body.schedule,
        telegram_chat_id=(body.telegram_chat_id.strip() if body.telegram_chat_id else None),
        telegram_chat_title=(body.telegram_chat_title.strip() if body.telegram_chat_title else None),
        telegram_sync_enabled=body.telegram_sync_enabled,
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
        if field in {"telegram_chat_id", "telegram_chat_title"} and value is not None:
            value = value.strip()
        setattr(group, field, value)

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A group with this name already exists")
    await db.refresh(group)
    return await _to_group_out(db, group)


@router.patch("/{group_id}/telegram", response_model=GroupOut)
async def sync_group_telegram(group_id: uuid.UUID, body: GroupTelegramSync, db: AsyncSession = Depends(get_db)):
    group = (await db.execute(select(Group).where(Group.id == group_id))).scalar_one_or_none()
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")

    if body.telegram_chat_id is not None:
        group.telegram_chat_id = body.telegram_chat_id.strip() or None
    if body.telegram_chat_title is not None:
        group.telegram_chat_title = body.telegram_chat_title.strip() or None
    group.telegram_sync_enabled = body.telegram_sync_enabled
    group.telegram_last_synced_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(group)

    if group.telegram_sync_enabled and group.telegram_chat_id:
        total_students = (
            await db.execute(select(func.count()).select_from(StudentProfile).where(StudentProfile.group_id == group.id))
        ).scalar_one()
        active_students = (
            await db.execute(
                select(func.count())
                .select_from(StudentProfile)
                .join(User, User.id == StudentProfile.user_id)
                .where(StudentProfile.group_id == group.id, User.is_active.is_(True))
            )
        ).scalar_one()
        pending_tasks = (
            await db.execute(select(func.count()).select_from(Assignment).where(Assignment.group_id == group.id))
        ).scalar_one()
        send_telegram_message(
            group.telegram_chat_id,
            build_group_status_snapshot(group.name, total_students, active_students, pending_tasks),
        )

    return await _to_group_out(db, group)


@router.post("/{group_id}/telegram/remind")
async def send_group_accountability_alerts(group_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    group = (await db.execute(select(Group).where(Group.id == group_id))).scalar_one_or_none()
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")
    if not group.telegram_chat_id or not group.telegram_sync_enabled:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Telegram sync is not enabled for this group")

    students = (await db.execute(select(StudentProfile).where(StudentProfile.group_id == group_id))).scalars().all()
    assignments = (await db.execute(select(Assignment).where(Assignment.group_id == group_id))).scalars().all()

    reminder_names: list[str] = []
    for student in students:
        completed_ids = set(
            (
                await db.execute(
                    select(Submission.assignment_id).where(Submission.student_id == student.id)
                )
            ).scalars().all()
        )
        outstanding = [a for a in assignments if a.id not in completed_ids]
        if outstanding:
            notify_accountability_reminder(group.name, student.full_name, len(outstanding), group.telegram_chat_id)
            reminder_names.append(student.full_name)

    return {"sent": len(reminder_names), "students": reminder_names}


@router.delete("/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_group(group_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Soft-delete: groups are deactivated rather than hard-deleted, since
    they may have historical assignments/submissions attached."""
    group = (await db.execute(select(Group).where(Group.id == group_id))).scalar_one_or_none()
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")
    group.is_active = False
    await db.commit()
    return None
