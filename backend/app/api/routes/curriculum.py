import uuid
from datetime import datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user, require_teacher
from app.db.session import get_db
from app.models.assignment import Assignment, AssignmentStatus
from app.models.curriculum import CurriculumItem, CurriculumTemplate
from app.models.group import Group
from app.models.user import User
from app.schemas.curriculum import (
    ApplyCurriculumRequest,
    ApplyCurriculumResponse,
    CurriculumItemCreate,
    CurriculumItemOut,
    CurriculumTemplateCreate,
    CurriculumTemplateOut,
    CurriculumTemplateUpdate,
)
from app.utils.datetimes import ensure_utc, utcnow

router = APIRouter(prefix="/curriculum", tags=["curriculum"])


def _template_to_out(template: CurriculumTemplate) -> CurriculumTemplateOut:
    items_out = [
        CurriculumItemOut(
            id=item.id,
            template_id=item.template_id,
            title=item.title,
            description=item.description,
            day_offset=item.day_offset,
            order_index=item.order_index,
            deadline_offset_days=item.deadline_offset_days,
            created_at=item.created_at,
        )
        for item in (template.items or [])
    ]
    items_out.sort(key=lambda x: (x.day_offset, x.order_index))
    return CurriculumTemplateOut(
        id=template.id,
        title=template.title,
        description=template.description,
        english_level=template.english_level,
        created_by=template.created_by,
        items=items_out,
        item_count=len(items_out),
        created_at=template.created_at,
    )


@router.get("/templates", response_model=list[CurriculumTemplateOut])
async def list_curriculum_templates(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_teacher),
):
    """
    List all master curriculum templates. Lightweight query eager-loading items.
    """
    stmt = (
        select(CurriculumTemplate)
        .options(selectinload(CurriculumTemplate.items))
        .order_by(CurriculumTemplate.created_at.desc())
    )
    result = await db.execute(stmt)
    templates = result.scalars().all()
    return [_template_to_out(t) for t in templates]


@router.post("/templates", response_model=CurriculumTemplateOut, status_code=status.HTTP_201_CREATED)
async def create_curriculum_template(
    body: CurriculumTemplateCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_teacher),
):
    """
    Create a new master curriculum template with relative day offset schedule (e.g. Day 1, Day 3, Day 5).
    """
    template = CurriculumTemplate(
        title=body.title.strip(),
        description=body.description.strip() if body.description else None,
        english_level=body.english_level,
        created_by=current_user.id,
    )
    db.add(template)
    await db.flush()

    for idx, item_in in enumerate(body.items):
        item = CurriculumItem(
            template_id=template.id,
            title=item_in.title.strip(),
            description=item_in.description.strip() if item_in.description else None,
            day_offset=item_in.day_offset,
            order_index=item_in.order_index or idx,
            deadline_offset_days=item_in.deadline_offset_days,
        )
        db.add(item)

    await db.commit()

    stmt = (
        select(CurriculumTemplate)
        .options(selectinload(CurriculumTemplate.items))
        .where(CurriculumTemplate.id == template.id)
    )
    saved = (await db.execute(stmt)).scalar_one()
    return _template_to_out(saved)


@router.get("/templates/{template_id}", response_model=CurriculumTemplateOut)
async def get_curriculum_template(
    template_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_teacher),
):
    stmt = (
        select(CurriculumTemplate)
        .options(selectinload(CurriculumTemplate.items))
        .where(CurriculumTemplate.id == template_id)
    )
    template = (await db.execute(stmt)).scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Curriculum template not found")
    return _template_to_out(template)


@router.put("/templates/{template_id}", response_model=CurriculumTemplateOut)
async def update_curriculum_template(
    template_id: uuid.UUID,
    body: CurriculumTemplateUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_teacher),
):
    stmt = (
        select(CurriculumTemplate)
        .options(selectinload(CurriculumTemplate.items))
        .where(CurriculumTemplate.id == template_id)
    )
    template = (await db.execute(stmt)).scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Curriculum template not found")

    if body.title is not None:
        template.title = body.title.strip()
    if body.description is not None:
        template.description = body.description.strip() if body.description else None
    if body.english_level is not None:
        template.english_level = body.english_level

    # If items list is supplied, replace items
    if body.items is not None:
        await db.execute(delete(CurriculumItem).where(CurriculumItem.template_id == template.id))
        for idx, item_in in enumerate(body.items):
            item = CurriculumItem(
                template_id=template.id,
                title=item_in.title.strip(),
                description=item_in.description.strip() if item_in.description else None,
                day_offset=item_in.day_offset,
                order_index=item_in.order_index or idx,
                deadline_offset_days=item_in.deadline_offset_days,
            )
            db.add(item)

    await db.commit()

    stmt = (
        select(CurriculumTemplate)
        .options(selectinload(CurriculumTemplate.items))
        .where(CurriculumTemplate.id == template_id)
    )
    saved = (await db.execute(stmt)).scalar_one()
    return _template_to_out(saved)


@router.delete("/templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_curriculum_template(
    template_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_teacher),
):
    stmt = select(CurriculumTemplate).where(CurriculumTemplate.id == template_id)
    template = (await db.execute(stmt)).scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Curriculum template not found")

    await db.delete(template)
    await db.commit()


@router.post("/templates/{template_id}/apply/{group_id}", response_model=ApplyCurriculumResponse)
async def apply_curriculum_template_to_group(
    template_id: uuid.UUID,
    group_id: uuid.UUID,
    body: ApplyCurriculumRequest | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_teacher),
):
    """
    Applies a template-based curriculum release to a group.
    Maps lesson unlocking logic based on `start_date + lesson_offset`.
    Creates or updates assignments for the group with calculated unlock_at and deadlines.
    """
    group_stmt = select(Group).where(Group.id == group_id)
    group = (await db.execute(group_stmt)).scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")

    tpl_stmt = (
        select(CurriculumTemplate)
        .options(selectinload(CurriculumTemplate.items))
        .where(CurriculumTemplate.id == template_id)
    )
    template = (await db.execute(tpl_stmt)).scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Curriculum template not found")

    # If body specifies start_date, update group.start_date
    if body and body.start_date is not None:
        group.start_date = ensure_utc(body.start_date)

    group.curriculum_template_id = template.id

    base_start = group.start_date or ensure_utc(utcnow())

    # Fetch existing group assignments
    existing_assigns_stmt = select(Assignment).where(
        Assignment.group_id == group.id,
        Assignment.cycle_number == group.current_cycle,
    )
    existing_assigns = (await db.execute(existing_assigns_stmt)).scalars().all()
    item_to_assign = {a.curriculum_item_id: a for a in existing_assigns if a.curriculum_item_id}

    created_count = 0
    updated_count = 0

    items_sorted = sorted(template.items or [], key=lambda x: (x.day_offset, x.order_index))

    for item in items_sorted:
        unlock_at = base_start + timedelta(days=item.day_offset)
        deadline = unlock_at + timedelta(days=item.deadline_offset_days or 1)

        if item.id in item_to_assign:
            # Update existing assignment
            assign = item_to_assign[item.id]
            assign.title = item.title
            assign.description = item.description or assign.description
            assign.unlock_at = unlock_at
            assign.deadline = deadline
            assign.day_offset = item.day_offset
            assign.order_index = item.order_index or item.day_offset
            updated_count += 1
        else:
            # Create new assignment for this curriculum lesson
            new_assign = Assignment(
                group_id=group.id,
                title=item.title,
                description=item.description or f"Curriculum Lesson: {item.title}",
                unlock_at=unlock_at,
                deadline=deadline,
                day_offset=item.day_offset,
                order_index=item.order_index or item.day_offset,
                cycle_number=group.current_cycle,
                curriculum_item_id=item.id,
                created_by=current_user.id,
                status=AssignmentStatus.PUBLISHED,
            )
            db.add(new_assign)
            created_count += 1

    await db.commit()

    return ApplyCurriculumResponse(
        success=True,
        message=f"Mapped {len(items_sorted)} curriculum lessons to {group.name} based on start date.",
        assignments_created=created_count,
        assignments_updated=updated_count,
        group_id=group.id,
        start_date=group.start_date,
    )
