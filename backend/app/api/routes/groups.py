import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user, require_teacher
from app.core.config import settings
from app.db.session import get_db
from app.models.assignment import Assignment, AssignmentStatus
from app.models.group import Group
from app.models.student import StudentProfile
from app.models.submission import Submission
from app.models.user import ApprovalStatus, User
from app.schemas.group import (
    AssignmentItemOverview,
    GroupAssignmentHeader,
    GroupCreate,
    GroupDetailOut,
    GroupOut,
    GroupStudentDetail,
    GroupUpdate,
)
from app.utils.datetimes import as_utc, utcnow

from collections import defaultdict

router = APIRouter(prefix="/api/groups", tags=["groups"])


async def get_active_student_counts(db: AsyncSession, group_ids: list[uuid.UUID]) -> dict[uuid.UUID, int]:
    """
    Computes deduplicated active student counts across groups.
    Matches the exact deduplication and active activity criteria used in GroupDetailOut.
    """
    if not group_ids:
        return {}

    subquery = (
        select(
            StudentProfile.id,
            StudentProfile.group_id,
            StudentProfile.full_name,
            User.username,
            StudentProfile.total_stars,
            select(func.count())
            .select_from(Submission)
            .where(
                Submission.student_id == StudentProfile.id,
                Submission.is_archived.is_(False),
            )
            .correlate(StudentProfile)
            .scalar_subquery()
            .label("sub_cnt"),
        )
        .join(User, StudentProfile.user_id == User.id)
        .where(
            StudentProfile.group_id.in_(group_ids),
            or_(User.approval_status == ApprovalStatus.APPROVED, User.approval_status.is_(None)),
            User.is_active.is_(True),
        )
    )
    res = await db.execute(subquery)
    rows = res.all()

    by_group = defaultdict(list)
    for r in rows:
        by_group[r.group_id].append(r)

    counts_map: dict[uuid.UUID, int] = {}
    for gid in group_ids:
        g_rows = by_group.get(gid, [])
        dedup_map: dict[str, tuple] = {}
        for r in g_rows:
            sp_id, _, full_name, username, stars, sub_cnt = r
            norm_name = " ".join((full_name or "").strip().lower().split())
            norm_user = (username or "").strip().lower()
            key = norm_name or norm_user or str(sp_id)
            score = (stars or 0) * 10 + (sub_cnt or 0) * 5 + (20 if (sub_cnt or 0) > 0 else 0)

            if key not in dedup_map:
                dedup_map[key] = (r, score)
            else:
                _, existing_score = dedup_map[key]
                if score > existing_score:
                    dedup_map[key] = (r, score)

        active = [
            r for r, _ in dedup_map.values()
            if (r[4] or 0) > 0 or (r[5] or 0) > 0
        ]
        counts_map[gid] = len(active) if active else len(dedup_map)

    return counts_map


async def _to_group_out(db: AsyncSession, group: Group) -> GroupOut:
    counts_map = await get_active_student_counts(db, [group.id])
    return GroupOut(
        id=group.id,
        name=group.name,
        english_level=group.english_level,
        schedule=group.schedule,
        default_homework_time=group.default_homework_time or "20:00",
        current_cycle=getattr(group, "current_cycle", 1) or 1,
        is_active=group.is_active,
        student_count=counts_map.get(group.id, 0),
        created_at=group.created_at,
    )


@router.get("", response_model=list[GroupOut])
async def list_groups(
    include_archived: bool = False,
    current_user: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns all groups for the teacher panel belonging to this teacher.
    Uses batched active deduplicated student counting across all groups.
    """
    teacher_filter = or_(
        Group.created_by == current_user.id,
        and_(Group.created_by.is_(None), current_user.email == settings.BOOTSTRAP_TEACHER_EMAIL),
    )
    query = select(Group).where(teacher_filter).order_by(Group.name)
    if not include_archived:
        query = query.where(Group.is_active.is_(True))
    groups = (await db.execute(query)).scalars().all()

    if not groups:
        return []

    group_ids = [g.id for g in groups]
    counts_map = await get_active_student_counts(db, group_ids)

    return [
        GroupOut(
            id=g.id,
            name=g.name,
            english_level=g.english_level,
            schedule=g.schedule,
            default_homework_time=g.default_homework_time or "20:00",
            current_cycle=getattr(g, "current_cycle", 1) or 1,
            is_active=g.is_active,
            student_count=counts_map.get(g.id, 0),
            created_at=g.created_at,
        )
        for g in groups
    ]


@router.post("", response_model=GroupOut, status_code=status.HTTP_201_CREATED)
async def create_group(body: GroupCreate, current_user: User = Depends(require_teacher), db: AsyncSession = Depends(get_db)):
    group = Group(
        name=body.name,
        english_level=body.english_level,
        schedule=body.schedule,
        default_homework_time=body.default_homework_time or "20:00",
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


async def _build_group_detail_out(db: AsyncSession, group: Group) -> GroupDetailOut:
    """Builds GroupDetailOut including student details and assignment completion matrix."""
    group_id = group.id

    # Fetch published assignments for this group ordered by deadline/order_index
    assignments_res = await db.execute(
        select(Assignment)
        .where(Assignment.group_id == group_id, Assignment.status == AssignmentStatus.PUBLISHED)
        .order_by(Assignment.created_at.asc())
    )
    assignments = assignments_res.scalars().all()

    # Fetch all approved, active students in this group with user details (preserving legacy records)
    students_res = await db.execute(
        select(StudentProfile, User)
        .join(User, StudentProfile.user_id == User.id)
        .where(
            StudentProfile.group_id == group_id,
            or_(User.approval_status == ApprovalStatus.APPROVED, User.approval_status.is_(None)),
            User.is_active == True,
        )
        .order_by(StudentProfile.full_name.asc())
    )
    student_rows = students_res.all()

    current_cycle = getattr(group, "current_cycle", 1) or 1
    now_dt = utcnow()

    # Define Active Group Assignments:
    # All assignments where group_id == target_group_id, is_active == True (status == PUBLISHED),
    # is_archived == False, and (cycle == group.current_cycle OR deadline >= now_utc()).
    active_assignments = [
        a for a in assignments
        if (getattr(a, "cycle_number", 1) or 1) == current_cycle or as_utc(a.deadline) >= now_dt
    ]
    active_assignment_ids = {a.id for a in active_assignments}
    total_active_tasks = len(active_assignments)

    # Fetch all submissions for these assignments and students in a single bulk query
    assignment_ids = [a.id for a in assignments]
    student_ids = [s.id for s, _ in student_rows]

    submissions_map: dict[tuple[uuid.UUID, uuid.UUID], Submission] = {}
    overrides_set: set[tuple[uuid.UUID, uuid.UUID]] = set()
    if assignment_ids and student_ids:
        subs_res = await db.execute(
            select(Submission)
            .options(selectinload(Submission.grade))
            .where(
                Submission.assignment_id.in_(assignment_ids),
                Submission.student_id.in_(student_ids),
                Submission.is_archived == False,
            )
            .order_by(Submission.submitted_at.desc(), Submission.id.desc())
        )
        for sub in subs_res.scalars().all():
            if (sub.assignment_id, sub.student_id) not in submissions_map:
                submissions_map[(sub.assignment_id, sub.student_id)] = sub

        from app.models.gamification import TaskLockOverride
        ov_res = await db.execute(
            select(TaskLockOverride.assignment_id, TaskLockOverride.student_id)
            .where(
                TaskLockOverride.assignment_id.in_(assignment_ids),
                TaskLockOverride.student_id.in_(student_ids),
                TaskLockOverride.is_unlocked == True,
            )
        )
        overrides_set = {(r[0], r[1]) for r in ov_res.all()}

    student_details: list[GroupStudentDetail] = []
    for st_profile, st_user in student_rows:
        student_assignments: list[AssignmentItemOverview] = []
        active_completed_count = 0
        overdue_count = 0

        for a in assignments:
            sub = submissions_map.get((a.id, st_profile.id))
            comp_pct = 0
            score = None
            stars = None
            has_sub = False
            sub_at = None
            a_cycle = getattr(a, "cycle_number", 1) or 1
            is_past_dl = as_utc(a.deadline) < now_dt
            is_active_cohort_task = a.id in active_assignment_ids

            # A submission is valid if non-archived
            is_valid_sub = (
                sub is not None
                and not getattr(sub, "is_archived", False)
            )

            if is_valid_sub:
                has_sub = True
                sub_at = sub.submitted_at
                if sub.grade is not None:
                    score = sub.grade.score
                    stars = sub.grade.stars
                    comp_pct = min(100, max(0, int((sub.grade.score / 10.0) * 100)))
                else:
                    comp_pct = 100

                if is_active_cohort_task:
                    active_completed_count += 1
            else:
                comp_pct = 0
                if is_past_dl and is_active_cohort_task:
                    overdue_count += 1

            # Determine lock status
            is_locked = False
            if a.prerequisite_id and not has_sub:
                if (a.id, st_profile.id) not in overrides_set:
                    prereq_sub = submissions_map.get((a.prerequisite_id, st_profile.id))
                    prereq_active = (
                        prereq_sub is not None
                        and not getattr(prereq_sub, "is_archived", False)
                    )
                    if not prereq_active:
                        is_locked = True

            computed_status = (
                "locked"
                if is_locked
                else ("overdue" if (is_past_dl and not has_sub) else (sub.status.value if (has_sub and sub) else "not_submitted"))
            )

            student_assignments.append(
                AssignmentItemOverview(
                    assignment_id=a.id,
                    submission_id=sub.id if sub else None,
                    title=a.title,
                    deadline=a.deadline,
                    status=computed_status,
                    completion_percentage=comp_pct,
                    cycle_number=a_cycle,
                    score=score,
                    stars=stars,
                    has_submission=has_sub,
                    is_overdue=is_past_dl and not has_sub,
                    is_locked=is_locked,
                    submitted_at=sub_at,
                )
            )

        progress_pct = (
            int(round((active_completed_count / total_active_tasks) * 100))
            if total_active_tasks > 0
            else 0
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
                completed_assignments_count=active_completed_count,
                total_assignments_count=total_active_tasks,
                overall_completion_percentage=progress_pct,
                completed_cycle_count=active_completed_count,
                total_cycle_count=total_active_tasks,
                cycle_completion_percentage=progress_pct,
                overdue_assignments_count=overdue_count,
                assignments=student_assignments,
            )
        )

    # Deduplicate student details per cohort: prioritize active student with more stars/submissions, eliminate ghost stubs
    dedup_map: dict[str, tuple[GroupStudentDetail, int]] = {}
    for s in student_details:
        norm_name = " ".join((s.full_name or "").strip().lower().split())
        norm_user = (s.username or "").strip().lower()
        key = norm_name or norm_user or str(s.student_id)
        has_sub = s.completed_assignments_count > 0 or any(a.has_submission for a in s.assignments)
        score = (s.total_stars or 0) * 10 + s.completed_assignments_count * 5 + (20 if has_sub else 0)

        if key not in dedup_map:
            dedup_map[key] = (s, score)
        else:
            _, existing_score = dedup_map[key]
            if score > existing_score:
                dedup_map[key] = (s, score)

    active_students = [
        s for s, _ in dedup_map.values()
        if (s.total_stars or 0) > 0 or s.completed_assignments_count > 0 or any(a.has_submission for a in s.assignments)
    ]
    final_students = active_students if len(active_students) > 0 else [s for s, _ in dedup_map.values()]
    final_students.sort(key=lambda x: (x.full_name or "").lower())

    # Harmonized Group Cycle Progress:
    total_active_students = len(final_students)
    cycle_denominator = total_active_students * total_active_tasks
    total_valid_cycle_submissions = sum(s.completed_cycle_count for s in final_students)
    group_cycle_pct = (
        int(round((total_valid_cycle_submissions / cycle_denominator) * 100))
        if cycle_denominator > 0
        else 0
    )

    headers = [
        GroupAssignmentHeader(
            id=a.id,
            title=a.title,
            deadline=a.deadline,
            status=a.status.value if hasattr(a.status, "value") else str(a.status),
            cycle_number=getattr(a, "cycle_number", 1) or 1,
            prerequisite_id=a.prerequisite_id,
        )
        for a in assignments
    ]

    return GroupDetailOut(
        id=group.id,
        name=group.name,
        english_level=group.english_level,
        schedule=group.schedule,
        default_homework_time=group.default_homework_time or "20:00",
        current_cycle=current_cycle,
        is_active=group.is_active,
        student_count=len(final_students),
        cycle_completion_percentage=group_cycle_pct,
        assignments=headers,
        students=final_students,
    )


@router.get("/my/matrix", response_model=GroupDetailOut)
async def get_my_group_matrix(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Enables authenticated students to view their cohort's Progress Matrix
    (matching Reference Image 3: Student Progress Table with Sticky Left Column).
    """
    # Find student profile
    profile_res = await db.execute(
        select(StudentProfile).where(StudentProfile.user_id == current_user.id)
    )
    profile = profile_res.scalar_one_or_none()
    if not profile or not profile.group_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="You are not currently enrolled in any class group.",
        )

    group = (await db.execute(select(Group).where(Group.id == profile.group_id))).scalar_one_or_none()
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")

    return await _build_group_detail_out(db, group)


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

    is_owner = (
        group.created_by == current_user.id
        or (group.created_by is None and current_user.email == settings.BOOTSTRAP_TEACHER_EMAIL)
    )
    if not is_owner:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this group")

    return await _build_group_detail_out(db, group)


@router.post("/{group_id}/start-cycle", response_model=GroupOut)
async def start_new_homework_cycle(
    group_id: uuid.UUID,
    current_user: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db),
):
    """
    Advances group to a new active homework cycle (e.g. Cycle 1 -> Cycle 2).
    Historical assignments, submissions, grades, and stars remain 100% preserved.
    Current cycle progress resets to 0% for the new cycle until students complete new work.
    """
    group = (await db.execute(select(Group).where(Group.id == group_id))).scalar_one_or_none()
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")

    is_owner = (
        group.created_by == current_user.id
        or (group.created_by is None and current_user.email == settings.BOOTSTRAP_TEACHER_EMAIL)
    )
    if not is_owner:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have permission to modify this group")

    group.current_cycle = (getattr(group, "current_cycle", 1) or 1) + 1
    await db.commit()
    await db.refresh(group)
    return await _to_group_out(db, group)


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
