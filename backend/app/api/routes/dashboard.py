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
from app.utils.datetimes import as_utc, utcnow

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
            (SELECT count(DISTINCT student_id) FROM submissions WHERE status = 'late') as late_students,
            (SELECT count(*) FROM wordlist_sets) as total_wordlists
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
        total_wordlists,
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
        total_wordlists=total_wordlists,
        recent_submissions=[
            RecentSubmissionItem(
                id=s.id,
                student_name=s.student.full_name,
                student_avatar=s.student.avatar_url if s.student else None,
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
    try:
        group_name = None
        teacher_name = None
        english_level = "Beginner"
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
        teacher_name = teacher.full_name if teacher else "Teacher"

        # Gamification stats with safe defaults
        streak_val = 0
        try:
            strk = (await db.execute(select(StudentStreak).where(StudentStreak.student_id == profile.id))).scalar_one_or_none()
            if strk:
                streak_val = strk.current_streak or 0
        except Exception:
            pass

        total_xp = 0
        try:
            xp_row = (await db.execute(select(StudentXP).where(StudentXP.student_id == profile.id))).scalar_one_or_none()
            if xp_row:
                total_xp = xp_row.total_xp or 0
        except Exception:
            pass

        level, level_title = calculate_level(total_xp)

        free_pass_available = True
        try:
            month_key = utcnow().strftime("%Y-%m")
            fp = await get_or_create_monthly_free_pass(db, profile.id, month_key)
            if fp:
                free_pass_available = not fp.is_used
        except Exception:
            pass

        submissions = []
        try:
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
        except Exception:
            pass

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

            # Query task lock overrides to exclude exempted tasks from progress denominator
            from app.models.gamification import TaskLockOverride
            overrides = (
                await db.execute(
                    select(TaskLockOverride).where(TaskLockOverride.student_id == profile.id)
                )
            ).scalars().all()
            exempted_ids = {o.assignment_id for o in overrides if getattr(o, "is_exempted", False)}

            non_exempt_cycle_assignments = [a for a in cycle_assignments if a.id not in exempted_ids]
            total_assignments = len(non_exempt_cycle_assignments)
            cycle_assign_ids = {a.id for a in non_exempt_cycle_assignments}

            # Active, non-archived submissions for non-exempt current cycle tasks
            cycle_assign_map = {a.id: a for a in non_exempt_cycle_assignments}
            active_cycle_subs = [
                s for s in submissions
                if s.assignment_id in cycle_assign_ids
                and (getattr(s, "cycle_number", 1) or 1) == current_cycle
                and not getattr(s, "is_archived", False)
                and (
                    not getattr(cycle_assign_map.get(s.assignment_id), "updated_at", None)
                    or as_utc(s.submitted_at) >= as_utc(cycle_assign_map[s.assignment_id].updated_at)
                )
            ]
            completed_assignments = len(active_cycle_subs)
            submitted_cycle_ids = {s.assignment_id for s in submissions if not getattr(s, "is_archived", False)} | exempted_ids

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

            all_cycle_sorted = sorted(
                cycle_assignments,
                key=lambda x: (getattr(x, "order_index", 0) or 0, x.deadline, x.created_at),
            )
            override_map = {o.assignment_id: o for o in overrides}

            upcoming = []
            for a in upcoming_assignments:
                is_sub = a.id in submitted_cycle_ids
                ovr = override_map.get(a.id)
                is_ovr = bool(ovr and (ovr.is_unlocked or getattr(ovr, "is_exempted", False)))

                is_locked = False
                lock_reason = None
                if not is_sub and not is_ovr:
                    prereq_id = a.prerequisite_id
                    if not prereq_id:
                        idx = next((i for i, item in enumerate(all_cycle_sorted) if item.id == a.id), None)
                        if idx is not None and idx > 0:
                            prereq_id = all_cycle_sorted[idx - 1].id
                    if prereq_id and prereq_id != a.id:
                        prereq_ovr = override_map.get(prereq_id)
                        prereq_sat = (
                            prereq_id in submitted_cycle_ids
                            or (prereq_ovr and (prereq_ovr.is_unlocked or getattr(prereq_ovr, "is_exempted", False)))
                        )
                        if not prereq_sat:
                            is_locked = True
                            prereq_a = next((item for item in all_cycle_sorted if item.id == prereq_id), None)
                            p_title = prereq_a.title if prereq_a else "previous assignment"
                            lock_reason = f"Locked: Complete '{p_title}' to unlock"

                upcoming.append(
                    UpcomingAssignmentItem(
                        id=a.id,
                        title=a.title,
                        deadline=a.deadline,
                        submitted=is_sub,
                        is_locked=is_locked,
                        lock_reason=lock_reason,
                    )
                )

        recent_grades = []
        try:
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
                    assignment_title=submission.assignment.title if submission and submission.assignment else "Assignment",
                    score=grade.score,
                    stars=grade.stars,
                    graded_at=grade.graded_at,
                )
                for grade, submission in recent_grades_query
                if submission
            ]
        except Exception:
            pass

        return StudentDashboard(
            full_name=profile.full_name or "Student",
            group_name=group_name or "No Group",
            teacher_name=teacher_name,
            english_level=english_level,
            total_stars=getattr(profile, "total_stars", 0) or 0,
            streak=streak_val,
            total_xp=total_xp,
            level=level,
            level_title=level_title,
            free_pass_available=free_pass_available,
            average_score=average_score,
            total_assignments=total_assignments,
            completed_assignments=completed_assignments,
            upcoming_deadlines=upcoming,
            recent_grades=recent_grades,
        )
    except Exception as exc:
        logger.exception("Error preparing student dashboard: %s", exc)
        return StudentDashboard(
            full_name=profile.full_name or "Student",
            group_name="No Group",
            teacher_name="Teacher",
            english_level="Beginner",
            total_stars=getattr(profile, "total_stars", 0) or 0,
            streak=0,
            total_xp=0,
            level=1,
            level_title="Novice",
            free_pass_available=True,
            average_score=None,
            total_assignments=0,
            completed_assignments=0,
            upcoming_deadlines=[],
            recent_grades=[],
        )
