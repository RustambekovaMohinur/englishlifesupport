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
    # 1. Consolidated count metrics + locked students in a single query
    q_metrics = """
    WITH 
    scalars AS (
        SELECT 
            (SELECT count(*) FROM student_profiles) as total_students,
            (SELECT count(*) FROM student_profiles sp JOIN users u ON sp.user_id = u.id WHERE u.is_active = true) as active_students,
            (SELECT count(*) FROM groups WHERE is_active = true) as total_groups,
            (SELECT count(*) FROM assignments) as total_assignments,
            (SELECT count(*) FROM submissions WHERE status != 'graded') as pending_submissions,
            (SELECT count(*) FROM submissions) as total_submissions,
            (SELECT count(*) FROM assignments WHERE status = 'published') as published_assignments,
            (SELECT count(DISTINCT student_id) FROM submissions WHERE status = 'late') as late_students
    ),
    prereqs AS (
        SELECT id, group_id, prerequisite_id
        FROM assignments
        WHERE prerequisite_id IS NOT NULL AND status = 'published'
    ),
    locked_candidates AS (
        SELECT sp.id as student_id
        FROM student_profiles sp
        JOIN prereqs p ON sp.group_id = p.group_id
        LEFT JOIN submissions s ON s.student_id = sp.id AND s.assignment_id = p.prerequisite_id
        LEFT JOIN task_lock_overrides o ON o.student_id = sp.id AND o.assignment_id = p.id AND o.is_unlocked = true
        WHERE s.id IS NULL AND o.id IS NULL
        GROUP BY sp.id
    )
    SELECT 
        s.*,
        (SELECT count(*) FROM locked_candidates) as locked_students
    FROM scalars s;
    """
    from sqlalchemy import text
    scalar_row = (await db.execute(text(q_metrics))).one()
    (
        total_students,
        active_students,
        total_groups,
        total_assignments,
        pending_submissions,
        total_submissions,
        published_assignments,
        late_students,
        locked_students_count,
    ) = scalar_row
    inactive_students = total_students - active_students

    potential_total = total_students * published_assignments
    completion_rate = int(round((total_submissions / potential_total) * 100)) if potential_total > 0 else 100

    # 3. Recent 10 submissions feed
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
    english_level = None
    if profile.group_id:
        group = (await db.execute(select(Group).where(Group.id == profile.group_id))).scalar_one_or_none()
        if group:
            group_name = group.name
            if group.english_level:
                english_level = (
                    group.english_level.value
                    if hasattr(group.english_level, "value")
                    else str(group.english_level)
                )

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
    completed_assignments = 0
    now_dt = datetime.now(timezone.utc)
    upcoming = []

    if profile.group_id:
        group_obj = (await db.execute(select(Group).where(Group.id == profile.group_id))).scalar_one_or_none()
        current_cycle = getattr(group_obj, "current_cycle", 1) or 1

        # Current cycle assignments for the student's cohort
        cycle_assignments = (
            await db.execute(
                select(Assignment)
                .where(
                    Assignment.group_id == profile.group_id,
                    Assignment.status == AssignmentStatus.PUBLISHED,
                    Assignment.cycle_number == current_cycle,
                )
            )
        ).scalars().all()

        # If no assignments tagged with current_cycle, fallback to all published
        if not cycle_assignments:
            cycle_assignments = (
                await db.execute(
                    select(Assignment)
                    .where(
                        Assignment.group_id == profile.group_id,
                        Assignment.status == AssignmentStatus.PUBLISHED,
                    )
                )
            ).scalars().all()

        total_assignments = len(cycle_assignments)
        cycle_assign_ids = {a.id for a in cycle_assignments}

        # Active, non-archived submissions for the current cycle
        active_cycle_subs = [
            s for s in submissions
            if s.assignment_id in cycle_assign_ids
            and (getattr(s, "cycle_number", 1) or 1) == current_cycle
            and not getattr(s, "is_archived", False)
        ]
        completed_assignments = len(active_cycle_subs)
        submitted_cycle_ids = {s.assignment_id for s in active_cycle_subs}

        upcoming_assignments = (
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
        ).scalars().all()

        upcoming = [
            UpcomingAssignmentItem(id=a.id, title=a.title, deadline=a.deadline, submitted=a.id in submitted_cycle_ids)
            for a in upcoming_assignments
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
        english_level=english_level,
        total_stars=profile.total_stars,
        streak=streak_val,
        total_xp=total_xp,
        level=level,
        level_title=level_title,
        free_pass_available=not fp.is_used,
        average_score=average_score,
        total_assignments=total_assignments,
        completed_assignments=completed_assignments,
        upcoming_deadlines=upcoming,
        recent_grades=recent_grades,
    )
