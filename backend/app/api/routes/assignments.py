import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_student_profile, require_teacher
from app.db.session import get_db
from app.models.assignment import Assignment
from app.models.group import Group
from app.models.student import StudentProfile
from app.models.submission import Submission, SubmissionStatus
from app.models.user import User
from app.schemas.assignment import AssignmentCreate, AssignmentForStudent, AssignmentOut, AssignmentUpdate

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/assignments", tags=["assignments"])


async def _ordered_assignments_for_group(db: AsyncSession, group_id: uuid.UUID) -> list[Assignment]:
    result = await db.execute(
        select(Assignment)
        .where(Assignment.group_id == group_id)
        .order_by(Assignment.order_index.asc().nullslast(), Assignment.deadline.asc())
    )
    return result.scalars().all()


async def _is_assignment_unlocked_for_student(db: AsyncSession, profile: StudentProfile, assignment: Assignment) -> bool:
    now = datetime.now(timezone.utc)
    group_assignments = (
        await db.execute(
            select(Assignment)
            .where(Assignment.group_id == assignment.group_id)
            .order_by(Assignment.deadline.asc())
        )
    ).scalars().all()

    for candidate in group_assignments:
        submission = (
            await db.execute(
                select(Submission)
                .where(Submission.assignment_id == candidate.id, Submission.student_id == profile.id)
            )
        ).scalar_one_or_none()

        is_uncompleted = submission is None or submission.status != SubmissionStatus.GRADED
        if candidate.deadline < now and is_uncompleted:
            return False

    return True


@router.get("", response_model=list[AssignmentOut], dependencies=[Depends(require_teacher)])
async def list_assignments(
    db: AsyncSession = Depends(get_db),
    group_id: uuid.UUID | None = Query(default=None),
):
    query = select(Assignment, Group.name).join(Group, Assignment.group_id == Group.id)
    if group_id:
        query = query.where(Assignment.group_id == group_id)
    query = query.order_by(Assignment.deadline.desc())
    rows = (await db.execute(query)).all()

    result = []
    for assignment, group_name in rows:
        sub_count = (
            await db.execute(
                select(func.count()).select_from(Submission).where(Submission.assignment_id == assignment.id)
            )
        ).scalar_one()
        result.append(
            AssignmentOut(
                id=assignment.id,
                group_id=assignment.group_id,
                group_name=group_name,
                title=assignment.title,
                description=assignment.description,
                deadline=assignment.deadline,
                order_index=assignment.order_index,
                created_at=assignment.created_at,
                submission_count=sub_count,
            )
        )
    return result


@router.post("", response_model=AssignmentOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_teacher)])
async def create_assignment(body: AssignmentCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_teacher)):
    group = (await db.execute(select(Group).where(Group.id == body.group_id))).scalar_one_or_none()
    if group is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Group not found")

    assignment = Assignment(
        group_id=body.group_id,
        title=body.title,
        description=body.description,
        deadline=body.deadline,
        order_index=body.order_index,
        created_by=current_user.id,
    )
    db.add(assignment)
    await db.commit()
    await db.refresh(assignment)

    if group.telegram_chat_id and not group.telegram_sync_enabled:
        logger.warning(
            "Assignment notification skipped for group '%s' because telegram_sync_enabled is false while chat_id is set.",
            group.name,
        )

    if group.telegram_chat_id:
        from app.services.telegram_sync import send_assignment_notification

        chat_id = str(group.telegram_chat_id).strip()
        if not chat_id:
            from app.services.telegram_sync import logger as telegram_logger

            telegram_logger.warning("Assignment created for group '%s' but telegram_chat_id is blank.", group.name)
        else:
            send_assignment_notification(group.name, assignment.title, chat_id)

    elif group.telegram_sync_enabled:
        logger.warning("Assignment notification skipped for group '%s': telegram_chat_id is missing or not linked.", group.name)

    return AssignmentOut(
        id=assignment.id,
        group_id=assignment.group_id,
        group_name=group.name,
        title=assignment.title,
        description=assignment.description,
        deadline=assignment.deadline,
        order_index=assignment.order_index,
        created_at=assignment.created_at,
        submission_count=0,
    )


@router.patch("/{assignment_id}", response_model=AssignmentOut, dependencies=[Depends(require_teacher)])
async def update_assignment(assignment_id: uuid.UUID, body: AssignmentUpdate, db: AsyncSession = Depends(get_db)):
    assignment = (await db.execute(select(Assignment).where(Assignment.id == assignment_id))).scalar_one_or_none()
    if assignment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found")

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(assignment, field, value)

    await db.commit()
    await db.refresh(assignment)
    group = (await db.execute(select(Group).where(Group.id == assignment.group_id))).scalar_one()

    chat_id = (group.telegram_chat_id or "-5541781061").strip()
    if chat_id:
        from app.services.telegram_sync import send_assignment_notification

        send_assignment_notification(group.name, assignment.title, chat_id)
    elif group.telegram_sync_enabled:
        logger.warning("Assignment update for group '%s' did not send Telegram message because telegram_chat_id is missing.", group.name)

    sub_count = (
        await db.execute(select(func.count()).select_from(Submission).where(Submission.assignment_id == assignment.id))
    ).scalar_one()
    return AssignmentOut(
        id=assignment.id,
        group_id=assignment.group_id,
        group_name=group.name,
        title=assignment.title,
        description=assignment.description,
        deadline=assignment.deadline,
        order_index=assignment.order_index,
        created_at=assignment.created_at,
        submission_count=sub_count,
    )


@router.delete("/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_teacher)])
async def delete_assignment(assignment_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    assignment = (await db.execute(select(Assignment).where(Assignment.id == assignment_id))).scalar_one_or_none()
    if assignment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found")
    await db.delete(assignment)
    await db.commit()
    return None


@router.get("/mine", response_model=list[AssignmentForStudent])
async def list_my_assignments(
    profile: StudentProfile = Depends(get_current_student_profile),
    db: AsyncSession = Depends(get_db),
):
    """Student-only: only assignments for the student's own group, ever."""
    if profile.group_id is None:
        return []

    assignments = (
        (await db.execute(select(Assignment).where(Assignment.group_id == profile.group_id).order_by(Assignment.deadline)))
        .scalars()
        .all()
    )

    result = []
    now = datetime.now(timezone.utc)
    has_overdue_uncompleted = False
    for assignment in assignments:
        submission = (
            await db.execute(
                select(Submission)
                .options(selectinload(Submission.grade))
                .where(Submission.assignment_id == assignment.id, Submission.student_id == profile.id)
            )
        ).scalar_one_or_none()

        if assignment.deadline < now and (submission is None or submission.status != SubmissionStatus.GRADED):
            has_overdue_uncompleted = True
            break

    for assignment in assignments:
        submission = (
            await db.execute(
                select(Submission)
                .options(selectinload(Submission.grade))
                .where(Submission.assignment_id == assignment.id, Submission.student_id == profile.id)
            )
        ).scalar_one_or_none()

        score = None
        if submission and submission.grade:
            score = submission.grade.score

        result.append(
            AssignmentForStudent(
                id=assignment.id,
                title=assignment.title,
                description=assignment.description,
                deadline=assignment.deadline,
                is_past_deadline=assignment.deadline < now,
                is_locked=has_overdue_uncompleted,
                lock_reason="You have an overdue assignment that must be completed before new work can be opened." if has_overdue_uncompleted else None,
                submission_status=submission.status.value if submission else None,
                score=score,
            )
        )
    return result
