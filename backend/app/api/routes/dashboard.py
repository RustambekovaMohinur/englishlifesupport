from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_student_profile, get_current_teacher_profile, require_teacher
from app.db.session import get_db
from app.models.assignment import Assignment, AssignmentStatus
from app.models.grade import Grade
from app.models.group import Group
from app.models.student import StudentProfile
from app.models.submission import Submission, SubmissionStatus
from app.models.teacher import TeacherProfile
from app.models.user import User, UserRole
from app.schemas.dashboard import (
    RecentGradeItem,
    RecentSubmissionItem,
    StudentDashboard,
    TeacherDashboard,
    UpcomingAssignmentItem,
)

from app.models.gamification import FreePass, StudentStreak, StudentXP, TaskLockOverride
from app.services.gamification_service import calculate_level, get_or_create_monthly_free_pass
from app.utils.datetimes import utcnow

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/teacher", response_model=TeacherDashboard, dependencies=[Depends(require_teacher)])
async def teacher_dashboard(db: AsyncSession = Depends(get_db)):
    total_students = (await db.execute(select(func.count()).select_from(StudentProfile))).scalar_one()
    active_students = (
        await db.execute(
            select(func.count())
            .select_from(StudentProfile)
            .join(User, StudentProfile.user_id == User.id)
            .where(User.is_active.is_(True))
        )
    ).scalar_one()
    inactive_students = total_students - active_students

    total_groups = (
        await db.execute(select(func.count()).select_from(Group).where(Group.is_active.is_(True)))
    ).scalar_one()
    total_assignments = (await db.execute(select(func.count()).select_from(Assignment))).scalar_one()
    pending_submissions = (
        await db.execute(
            select(func.count()).select_from(Submission).where(Submission.status != SubmissionStatus.GRADED)
        )
    ).scalar_one()

    # Calculate real overall completion rate and late students
    total_submissions = (await db.execute(select(func.count()).select_from(Submission))).scalar_one()
    published_assignments = (
        await db.execute(select(func.count()).select_from(Assignment).where(Assignment.status == AssignmentStatus.PUBLISHED))
    ).scalar_one()
    potential_total = total_students * published_assignments
    completion_rate = int(round((total_submissions / potential_total) * 100)) if potential_total > 0 else 100

    late_students = (
        await db.execute(
            select(func.count(func.distinct(Submission.student_id))).where(Submission.status == SubmissionStatus.LATE)
        )
    ).scalar_one()

    # Find locked students count
    # A student is locked if there's an assignment with a prerequisite they haven't submitted (and no override)
    all_students = (await db.execute(select(StudentProfile.id, StudentProfile.group_id))).all()
    assignments_with_prereqs = (
        (await db.execute(select(Assignment.id, Assignment.group_id, Assignment.prerequisite_id).where(Assignment.prerequisite_id.isnot(None), Assignment.status == AssignmentStatus.PUBLISHED)))
        .all()
    )

    locked_students_count = 0
    if assignments_with_prereqs:
        for s_id, s_grp in all_students:
            if not s_grp:
                continue
            grp_prereqs = [a for a in assignments_with_prereqs if a[1] == s_grp]
            if not grp_prereqs:
                continue
            # check student submissions
            sub_assign_ids = set(
                (await db.execute(select(Submission.assignment_id).where(Submission.student_id == s_id))).scalars().all()
            )
            # check overrides
            overrides = set(
                (await db.execute(select(TaskLockOverride.assignment_id).where(TaskLockOverride.student_id == s_id, TaskLockOverride.is_unlocked.is_(True)))).scalars().all()
            )
            is_locked = False
            for a_id, _, prereq_id in grp_prereqs:
                if a_id in overrides:
                    continue
                if prereq_id not in sub_assign_ids:
                    is_locked = True
                    break
            if is_locked:
                locked_students_count += 1

    recent = (
        await db.execute(
            select(Submission)
            .options(selectinload(Submission.assignment), selectinload(Submission.student))
            .order_by(Submission.submitted_at.desc())
            .limit(10)
        )
    ).scalars().all()

    return TeacherDashboard(
        total_students=total_students,
        active_students=active_students,
        total_groups=total_groups,
        total_assignments=total_assignments,
        pending_submissions=pending_submissions,
        completion_rate=completion_rate,
        late_students=late_students,
        locked_students=locked_students_count,
        inactive_students=inactive_students,
        recent_submissions=[
            RecentSubmissionItem(
                id=s.id,
                student_name=s.student.full_name,
                assignment_title=s.assignment.title,
                submitted_at=s.submitted_at,
                status=s.status.value,
            )
            for s in recent
        ],
    )


@router.get("/student", response_model=StudentDashboard)
async def student_dashboard(
    profile: StudentProfile = Depends(get_current_student_profile),
    db: AsyncSession = Depends(get_db),
):
    group_name = None
    teacher_name = None
    if profile.group_id:
        group = (await db.execute(select(Group).where(Group.id == profile.group_id))).scalar_one_or_none()
        group_name = group.name if group else None

    # Single-teacher system: show the (only) teacher's name.
    teacher = (await db.execute(select(TeacherProfile).limit(1))).scalar_one_or_none()
    teacher_name = teacher.full_name if teacher else None

    # Gamification stats
    strk = (await db.execute(select(StudentStreak).where(StudentStreak.student_id == profile.id))).scalar_one_or_none()
    streak_val = strk.current_streak if strk else 0

    xp_row = (await db.execute(select(StudentXP).where(StudentXP.student_id == profile.id))).scalar_one_or_none()
    total_xp = xp_row.total_xp if xp_row else 0
    level, level_title = calculate_level(total_xp)

    month_key = utcnow().strftime("%Y-%m")
    fp = await get_or_create_monthly_free_pass(db, profile.id, month_key)

    submissions = (
        (
            await db.execute(
                select(Submission)
                .options(selectinload(Submission.grade))
                .where(Submission.student_id == profile.id)
            )
        )
        .scalars()
        .all()
    )

    graded = [s for s in submissions if s.grade is not None]
    average_score = round(sum(s.grade.score for s in graded) / len(graded), 2) if graded else None

    total_assignments = 0
    if profile.group_id:
        total_assignments = (
            await db.execute(
                select(func.count())
                .select_from(Assignment)
                .where(
                    Assignment.group_id == profile.group_id,
                    Assignment.status == AssignmentStatus.PUBLISHED,
                )
            )
        ).scalar_one()

    now_dt = datetime.now(timezone.utc)
    upcoming = []
    if profile.group_id:
        assignments = (
            (
                await db.execute(
                    select(Assignment)
                    .where(
                        Assignment.group_id == profile.group_id,
                        Assignment.status == AssignmentStatus.PUBLISHED,
                        Assignment.deadline >= now_dt,
                    )
                    .order_by(Assignment.deadline)
                    .limit(5)
                )
            )
            .scalars()
            .all()
        )
        submitted_ids = {s.assignment_id for s in submissions}
        upcoming = [
            UpcomingAssignmentItem(id=a.id, title=a.title, deadline=a.deadline, submitted=a.id in submitted_ids)
            for a in assignments
        ]

    recent_grades_query = (
        await db.execute(
            select(Grade, Submission)
            .join(Submission, Grade.submission_id == Submission.id)
            .options(selectinload(Submission.assignment))
            .where(Submission.student_id == profile.id)
            .order_by(Grade.graded_at.desc())
            .limit(5)
        )
    ).all()

    recent_grades = [
        RecentGradeItem(
            assignment_title=submission.assignment.title,
            score=grade.score,
            stars=grade.stars,
            graded_at=grade.graded_at,
        )
        for grade, submission in recent_grades_query
    ]

    return StudentDashboard(
        full_name=profile.full_name,
        group_name=group_name,
        teacher_name=teacher_name,
        total_stars=profile.total_stars,
        streak=streak_val,
        total_xp=total_xp,
        level=level,
        level_title=level_title,
        free_pass_available=not fp.is_used,
        average_score=average_score,
        total_assignments=total_assignments,
        completed_assignments=len(submissions),
        upcoming_deadlines=upcoming,
        recent_grades=recent_grades,
    )
