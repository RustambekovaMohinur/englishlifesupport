import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy.orm import selectinload

from app.api.deps import require_teacher
from app.core.config import settings
from app.models.assignment import Assignment, AssignmentStatus
from app.models.group import Group
from app.models.student import StudentProfile
from app.models.submission import Submission
from app.models.user import User
from app.schemas.group import (
    AssignmentItemOverview,
    GroupAssignmentHeader,
    GroupCreate,
    GroupDetailOut,
    GroupOut,
    GroupStudentDetail,
    GroupUpdate,
)
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


@router.get("/{group_id}/detail", response_model=GroupDetailOut)
async def get_group_detail(
    group_id: uuid.UUID,
    current_user: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db),
):
    """Teacher views full group details, including all students and their assignment completion grid."""
    group = (await db.execute(select(Group).where(Group.id == group_id))).scalar_one_or_none()
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")

    if group.created_by and group.created_by != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this group")

    # Fetch published assignments for this group ordered by deadline/order_index
    assignments_res = await db.execute(
        select(Assignment)
        .where(Assignment.group_id == group_id, Assignment.status == AssignmentStatus.PUBLISHED)
        .order_by(Assignment.created_at.asc())
    )
    assignments = assignments_res.scalars().all()

    # Fetch all students in this group with user details
    students_res = await db.execute(
        select(StudentProfile, User)
        .join(User, StudentProfile.user_id == User.id)
        .where(StudentProfile.group_id == group_id)
        .order_by(StudentProfile.full_name.asc())
    )
    student_rows = students_res.all()

    # Fetch all submissions for these assignments and students
    assignment_ids = [a.id for a in assignments]
    student_ids = [s.id for s, _ in student_rows]

    submissions_map: dict[tuple[uuid.UUID, uuid.UUID], Submission] = {}
    if assignment_ids and student_ids:
        subs_res = await db.execute(
            select(Submission)
            .options(selectinload(Submission.grade))
            .where(Submission.assignment_id.in_(assignment_ids), Submission.student_id.in_(student_ids))
        )
        for sub in subs_res.scalars().all():
            submissions_map[(sub.assignment_id, sub.student_id)] = sub

    student_details: list[GroupStudentDetail] = []
    for st_profile, st_user in student_rows:
        student_assignments: list[AssignmentItemOverview] = []
        completed_count = 0

        for a in assignments:
            sub = submissions_map.get((a.id, st_profile.id))
            comp_pct = 0
            score = None
            stars = None
            has_sub = False
            sub_at = None

            if sub is not None:
                has_sub = True
                sub_at = sub.submitted_at
                if sub.grade is not None:
                    score = sub.grade.score
                    stars = sub.grade.stars
                    # Graded assignments: completion proportional to score (e.g. 8/10 -> 80%, 10/10 -> 100%)
                    comp_pct = min(100, max(0, int((sub.grade.score / 10.0) * 100)))
                else:
                    # Submitted but not yet graded -> 100% submission completion
                    comp_pct = 100

                if comp_pct >= 100:
                    completed_count += 1
            else:
                # Brand new or not submitted -> 0%
                comp_pct = 0

            student_assignments.append(
                AssignmentItemOverview(
                    assignment_id=a.id,
                    title=a.title,
                    deadline=a.deadline,
                    status=sub.status.value if sub else "not_submitted",
                    completion_percentage=comp_pct,
                    score=score,
                    stars=stars,
                    has_submission=has_sub,
                    submitted_at=sub_at,
                )
            )

        overall_pct = (
            int((completed_count / len(assignments)) * 100) if assignments else 100
        )

        student_details.append(
            GroupStudentDetail(
                id=st_profile.id,
                student_id=st_profile.id,
                user_id=st_user.id,
                full_name=st_profile.full_name,
                username=st_user.username,
                telegram_username=st_profile.phone,
                avatar_url=st_profile.avatar_url,
                bio=st_profile.bio,
                total_stars=st_profile.total_stars,
                total_lightning=getattr(st_profile, "total_lightning", 0),
                completed_assignments_count=completed_count,
                total_assignments_count=len(assignments),
                overall_completion_percentage=overall_pct,
                assignments=student_assignments,
            )
        )

    headers = [
        GroupAssignmentHeader(
            id=a.id,
            title=a.title,
            deadline=a.deadline,
            status=a.status.value,
        )
        for a in assignments
    ]

    return GroupDetailOut(
        id=group.id,
        name=group.name,
        english_level=group.english_level,
        schedule=group.schedule,
        is_active=group.is_active,
        student_count=len(student_rows),
        assignments=headers,
        students=student_details,
    )


@router.patch("/{group_id}", response_model=GroupOut)
async def update_group(
    group_id: uuid.UUID,
    body: GroupUpdate,
    current_user: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db),
):
    group = (await db.execute(select(Group).where(Group.id == group_id))).scalar_one_or_none()
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")

    if group.created_by and group.created_by != current_user.id and current_user.email != settings.BOOTSTRAP_TEACHER_EMAIL:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this group")

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
async def delete_group(
    group_id: uuid.UUID,
    current_user: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db),
):
    """Permanently deletes the group safely."""
    group = (await db.execute(select(Group).where(Group.id == group_id))).scalar_one_or_none()
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")

    if group.created_by and group.created_by != current_user.id and current_user.email != settings.BOOTSTRAP_TEACHER_EMAIL:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this group")

    await db.delete(group)
    await db.commit()
    return None
