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
    total_groups = (
        await db.execute(select(func.count()).select_from(Group).where(Group.is_active.is_(True)))
    ).scalar_one()
    total_assignments = (await db.execute(select(func.count()).select_from(Assignment))).scalar_one()
    pending_submissions = (
        await db.execute(
            select(func.count()).select_from(Submission).where(Submission.status != SubmissionStatus.GRADED)
        )
    ).scalar_one()

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
        average_score=average_score,
        total_assignments=total_assignments,
        completed_assignments=len(submissions),
        upcoming_deadlines=upcoming,
        recent_grades=recent_grades,
    )
