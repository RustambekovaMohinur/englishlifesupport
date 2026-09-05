import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import (
    get_current_student_profile,
    get_current_user,
    require_teacher,
)
from app.db.session import get_db
from app.models.assignment import Assignment, AssignmentStatus
from app.models.gamification import (
    Achievement,
    FreePass,
    StarTransaction,
    StarTransactionReason,
    StudentOfTheWeek,
    StudentStreak,
    StudentXP,
    TaskLockOverride,
    XPTransaction,
)
from app.models.group import Group
from app.models.student import StudentProfile
from app.models.submission import Submission
from app.models.user import ApprovalStatus, User, UserRole
from app.schemas.gamification import (
    AchievementOut,
    FreePassStatus,
    LeaderboardEntry,
    SotwNomination,
    SotwOut,
    StarTransactionOut,
    StudentGamificationSummary,
    TaskLockOverrideRequest,
    VocabPracticeSubmission,
    WeeklyLeaderboardOut,
)
from app.services.gamification_service import (
    LEVEL_THRESHOLDS,
    award_stars,
    award_xp,
    calculate_level,
    get_or_create_monthly_free_pass,
    unlock_achievement,
    update_student_streak,
    use_free_pass,
)
from app.utils.datetimes import as_utc, utcnow

router = APIRouter(prefix="/api/gamification", tags=["gamification"])


@router.get("/summary", response_model=StudentGamificationSummary)
async def get_my_gamification_summary(
    profile: StudentProfile = Depends(get_current_student_profile),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns student's persistent stars, ⚡ streak, 🎯 XP/level, 🛡 free pass,
    achievements, and recent star transactions.
    """
    # 1. Streak
    streak_row = (
        await db.execute(select(StudentStreak).where(StudentStreak.student_id == profile.id))
    ).scalar_one_or_none()
    current_streak = streak_row.current_streak if streak_row else 0
    longest_streak = streak_row.longest_streak if streak_row else 0
    last_act = streak_row.last_activity_date if streak_row else None

    # 2. XP & Level
    xp_row = (
        await db.execute(select(StudentXP).where(StudentXP.student_id == profile.id))
    ).scalar_one_or_none()
    total_xp = xp_row.total_xp if xp_row else 0
    level, level_title = calculate_level(total_xp)

    # Next level XP
    next_xp = 100
    for lvl, min_xp, max_xp, _ in LEVEL_THRESHOLDS:
        if lvl == level:
            next_xp = max_xp
            break

    # 3. Free Pass
    month_key = utcnow().strftime("%Y-%m")
    fp = await get_or_create_monthly_free_pass(db, profile.id, month_key)
    free_pass_status = FreePassStatus(
        month_key=month_key,
        has_free_pass=not fp.is_used,
        is_used=fp.is_used,
        used_at=fp.used_at,
    )

    # 4. Achievements
    achievements = (
        (
            await db.execute(
                select(Achievement)
                .where(Achievement.student_id == profile.id)
                .order_by(Achievement.unlocked_at.desc())
            )
        )
        .scalars()
        .all()
    )

    # 5. Recent Star Transactions
    txs = (
        (
            await db.execute(
                select(StarTransaction)
                .where(StarTransaction.student_id == profile.id)
                .order_by(StarTransaction.created_at.desc())
                .limit(10)
            )
        )
        .scalars()
        .all()
    )

    return StudentGamificationSummary(
        total_stars=profile.total_stars,
        streak=current_streak,
        longest_streak=longest_streak,
        last_activity_date=last_act,
        total_xp=total_xp,
        level=level,
        level_title=level_title,
        next_level_xp=next_xp,
        free_pass=free_pass_status,
        achievements=[AchievementOut.model_validate(a) for a in achievements],
        recent_transactions=[
            StarTransactionOut(
                id=t.id,
                amount=t.amount,
                reason=t.reason.value if hasattr(t.reason, "value") else str(t.reason),
                description=t.description,
                reference_id=t.reference_id,
                created_at=t.created_at,
            )
            for t in txs
        ],
    )


@router.post("/free-pass/use")
async def use_student_free_pass(
    assignment_id: uuid.UUID,
    profile: StudentProfile = Depends(get_current_student_profile),
    db: AsyncSession = Depends(get_db),
):
    """
    Consumes the monthly Free Pass for a late/missed assignment.
    Refunds star penalty and unlocks task progression.
    """
    success, message = await use_free_pass(db, profile.id, assignment_id)
    if not success:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message)
    await db.commit()
    return {"status": "success", "message": message}


@router.get("/leaderboard", response_model=WeeklyLeaderboardOut)
async def get_weekly_leaderboard(
    group_id: uuid.UUID | None = Query(default=None),
    scope: str | None = Query(default=None, description="group or global"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns weekly leaderboard for the group or global from real PostgreSQL data.
    Computes weekly XP, weekly stars, streaks, and completion %.
    Shows current student's own rank even outside top 3.
    Pending and rejected students are strictly excluded.
    """
    is_global = scope == "global"
    target_group_id = group_id
    current_student_id = None
    if current_user.role == UserRole.STUDENT:
        student_profile = (
            await db.execute(select(StudentProfile).where(StudentProfile.user_id == current_user.id))
        ).scalar_one_or_none()
        if student_profile:
            current_student_id = student_profile.id
            if not is_global and not target_group_id:
                if not student_profile.group_id:
                    return WeeklyLeaderboardOut(week_key=f"{utcnow().year}-W{utcnow().isocalendar()[1]}", entries=[])
                target_group_id = student_profile.group_id

    group_name = "Global Leaderboard" if is_global else None
    if not is_global:
        if not target_group_id:
            first_group = (await db.execute(select(Group).where(Group.is_active.is_(True)).limit(1))).scalar_one_or_none()
            if not first_group:
                return WeeklyLeaderboardOut(week_key=f"{utcnow().year}-W{utcnow().isocalendar()[1]}", entries=[])
            target_group_id = first_group.id

        group = (await db.execute(select(Group).where(Group.id == target_group_id))).scalar_one_or_none()
        group_name = group.name if group else None

    now = utcnow()
    week_start = now - timedelta(days=now.weekday())
    week_start = week_start.replace(hour=0, minute=0, second=0, microsecond=0)
    week_key = f"{now.year}-W{now.isocalendar()[1]}"

    # Fetch all APPROVED students in group or globally
    students_query = (
        select(StudentProfile)
        .join(User, StudentProfile.user_id == User.id)
        .where(
            User.approval_status == ApprovalStatus.APPROVED,
            User.role == UserRole.STUDENT,
            User.is_active.is_(True),
        )
    )
    if not is_global and target_group_id:
        students_query = students_query.where(StudentProfile.group_id == target_group_id)

    students = (await db.execute(students_query)).scalars().all()

    # Published assignments for group or global
    total_assign_query = select(func.count()).select_from(Assignment).where(Assignment.status == AssignmentStatus.PUBLISHED)
    if not is_global and target_group_id:
        total_assign_query = total_assign_query.where(Assignment.group_id == target_group_id)

    total_assignments = (await db.execute(total_assign_query)).scalar_one()

    student_ids = [s.id for s in students]
    if not student_ids:
        return WeeklyLeaderboardOut(group_name=group_name, week_key=week_key, current_student_rank=None, entries=[])

    # 1. Weekly XP batch
    xp_res = await db.execute(
        select(XPTransaction.student_id, func.coalesce(func.sum(XPTransaction.amount), 0))
        .where(
            XPTransaction.student_id.in_(student_ids),
            XPTransaction.created_at >= week_start,
        )
        .group_by(XPTransaction.student_id)
    )
    weekly_xp_map = {row[0]: row[1] for row in xp_res.all()}

    # 2. Weekly Stars batch
    stars_res = await db.execute(
        select(StarTransaction.student_id, func.coalesce(func.sum(StarTransaction.amount), 0))
        .where(
            StarTransaction.student_id.in_(student_ids),
            StarTransaction.created_at >= week_start,
        )
        .group_by(StarTransaction.student_id)
    )
    weekly_stars_map = {row[0]: row[1] for row in stars_res.all()}

    # 3. Streaks batch
    streak_res = await db.execute(
        select(StudentStreak.student_id, StudentStreak.current_streak)
        .where(StudentStreak.student_id.in_(student_ids))
    )
    streak_map = {row[0]: row[1] for row in streak_res.all()}

    # 4. Completed submissions batch
    sub_res = await db.execute(
        select(Submission.student_id, func.count())
        .where(Submission.student_id.in_(student_ids))
        .group_by(Submission.student_id)
    )
    sub_map = {row[0]: row[1] for row in sub_res.all()}

    entries_data = []
    for s in students:
        w_xp = weekly_xp_map.get(s.id, 0)
        w_stars = weekly_stars_map.get(s.id, 0)
        streak_val = streak_map.get(s.id, 0)
        sub_count = sub_map.get(s.id, 0)
        comp_rate = int(round((sub_count / total_assignments) * 100)) if total_assignments > 0 else 100

        entries_data.append({
            "student_id": s.id,
            "student_name": s.full_name,
            "weekly_xp": int(w_xp),
            "weekly_stars": max(0, int(w_stars)),
            "streak": streak_val,
            "completion_rate": min(100, comp_rate),
            "is_current_user": s.id == current_student_id,
        })

    # Sort descending by weekly_xp, then weekly_stars, then streak
    entries_data.sort(key=lambda x: (x["weekly_xp"], x["weekly_stars"], x["streak"]), reverse=True)

    ranked_entries = []
    current_student_rank = None
    for idx, e in enumerate(entries_data, start=1):
        if e["is_current_user"]:
            current_student_rank = idx
        ranked_entries.append(
            LeaderboardEntry(
                rank=idx,
                student_id=e["student_id"],
                student_name=e["student_name"],
                weekly_xp=e["weekly_xp"],
                weekly_stars=e["weekly_stars"],
                streak=e["streak"],
                completion_rate=e["completion_rate"],
                is_current_user=e["is_current_user"],
            )
        )

    return WeeklyLeaderboardOut(
        group_name=group_name,
        week_key=week_key,
        current_student_rank=current_student_rank,
        entries=ranked_entries,
    )


@router.post("/vocabulary/practice")
async def record_vocab_practice(
    body: VocabPracticeSubmission,
    profile: StudentProfile = Depends(get_current_student_profile),
    db: AsyncSession = Depends(get_db),
):
    """
    Connects vocabulary quiz/practice completion to real XP and Stars.
    +10 ⭐ on high score (>= 80%)
    +15 XP for practicing vocabulary
    Enforces idempotency per assignment/day.
    """
    if body.total_words <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid word count")

    ratio = body.correct_words / body.total_words
    today_str = utcnow().strftime("%Y-%m-%d")
    ref_id = f"{body.assignment_id or 'vocab'}_{today_str}"

    # Award XP for learning
    await award_xp(
        db,
        student_id=profile.id,
        amount=15,
        activity_type="vocab_practice",
        reference_id=ref_id,
        description=f"Vocabulary practice: {body.correct_words}/{body.total_words} correct",
    )

    # Award +10 ⭐ for high accuracy
    star_awarded = False
    if ratio >= 0.8:
        star_awarded = await award_stars(
            db,
            student_id=profile.id,
            amount=10,
            reason=StarTransactionReason.VOCABULARY_ACHIEVEMENT,
            reference_id=ref_id,
            description=f"Vocabulary mastery achievement ({int(ratio*100)}% accuracy)",
        )
        if star_awarded:
            await unlock_achievement(
                db,
                student_id=profile.id,
                badge_key="vocab_master",
                title="Vocab Master",
                description="Achieved 80%+ accuracy on vocabulary practice!",
                icon="📚",
            )

    # Update streak
    await update_student_streak(db, profile.id, today_str)
    await db.commit()

    return {
        "status": "success",
        "xp_earned": 15,
        "stars_earned": 10 if star_awarded else 0,
        "accuracy": int(ratio * 100),
    }


# ================= Teacher Endpoints =================


@router.post("/teacher/override-lock", dependencies=[Depends(require_teacher)])
async def teacher_override_task_lock(
    body: TaskLockOverrideRequest,
    current_user: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db),
):
    """
    Teacher can manually override/unlock a sequential task for a student.
    """
    existing = (
        await db.execute(
            select(TaskLockOverride).where(
                TaskLockOverride.student_id == body.student_id,
                TaskLockOverride.assignment_id == body.assignment_id,
            )
        )
    ).scalar_one_or_none()

    if existing:
        existing.is_unlocked = body.is_unlocked
        existing.overridden_by = current_user.id
    else:
        override = TaskLockOverride(
            student_id=body.student_id,
            assignment_id=body.assignment_id,
            is_unlocked=body.is_unlocked,
            overridden_by=current_user.id,
        )
        db.add(override)

    await db.commit()
    return {"status": "success", "is_unlocked": body.is_unlocked}


@router.post("/teacher/student-of-the-week/{group_id}", response_model=SotwOut, dependencies=[Depends(require_teacher)])
async def confirm_student_of_the_week(
    group_id: uuid.UUID,
    body: SotwNomination,
    current_user: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db),
):
    """
    Teacher confirms Student of the Week for a group.
    Awards +50 to +100 ⭐ (configurable) and persists winner. Cannot duplicate in same week.
    """
    now = utcnow()
    week_key = f"{now.year}-W{now.isocalendar()[1]}"

    # Check if already awarded for this group and week
    existing = (
        await db.execute(
            select(StudentOfTheWeek).where(
                StudentOfTheWeek.group_id == group_id,
                StudentOfTheWeek.week_key == week_key,
            )
        )
    ).scalar_one_or_none()

    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Student of the Week for {week_key} has already been awarded in this group.",
        )

    student = (
        await db.execute(select(StudentProfile).where(StudentProfile.id == body.student_id))
    ).scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")

    sotw = StudentOfTheWeek(
        group_id=group_id,
        student_id=body.student_id,
        week_key=week_key,
        stars_awarded=body.stars_awarded,
        selected_by=current_user.id,
        reason=body.reason,
    )
    db.add(sotw)

    # Award stars to the student
    await award_stars(
        db,
        student_id=body.student_id,
        amount=body.stars_awarded,
        reason=StarTransactionReason.STUDENT_OF_THE_WEEK,
        reference_id=f"sotw_{group_id}_{week_key}",
        description=f"Student of the Week winner for {week_key}",
    )

    # Award XP and achievement
    await award_xp(
        db,
        student_id=body.student_id,
        amount=100,
        activity_type="student_of_the_week",
        reference_id=f"sotw_{group_id}_{week_key}",
        description=f"Student of the Week XP for {week_key}",
    )
    await unlock_achievement(
        db,
        student_id=body.student_id,
        badge_key=f"sotw_{week_key}",
        title="Student of the Week",
        description=f"Recognized as top student of the week ({week_key})!",
        icon="👑",
    )

    await db.commit()
    return SotwOut(
        group_id=group_id,
        student_id=body.student_id,
        student_name=student.full_name,
        week_key=week_key,
        stars_awarded=body.stars_awarded,
        reason=body.reason,
    )


@router.get("/teacher/group-report/{group_id}", dependencies=[Depends(require_teacher)])
async def get_teacher_group_report(
    group_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """
    Weekly group report:
    - completion %
    - average score
    - late submissions
    - missed tasks
    - Perfect Week students
    - top performer
    - locked students list
    """
    group = (await db.execute(select(Group).where(Group.id == group_id))).scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")

    students = (
        (await db.execute(select(StudentProfile).where(StudentProfile.group_id == group_id)))
        .scalars()
        .all()
    )

    assignments = (
        (
            await db.execute(
                select(Assignment).where(
                    Assignment.group_id == group_id,
                    Assignment.status == AssignmentStatus.PUBLISHED,
                )
            )
        )
        .scalars()
        .all()
    )

    now = utcnow()
    week_start = now - timedelta(days=now.weekday())
    week_start = week_start.replace(hour=0, minute=0, second=0, microsecond=0)
    week_key = f"{now.year}-W{now.isocalendar()[1]}"

    total_submissions = 0
    late_submissions = 0
    scores = []
    student_scores = {}
    locked_students = []

    for s in students:
        s_subs = (
            (
                await db.execute(
                    select(Submission)
                    .options(selectinload(Submission.grade))
                    .where(Submission.student_id == s.id)
                )
            )
            .scalars()
            .all()
        )
        total_submissions += len(s_subs)
        lates = sum(1 for sub in s_subs if sub.status == SubmissionStatus.LATE)
        late_submissions += lates

        for sub in s_subs:
            if sub.grade:
                scores.append(sub.grade.score)
                student_scores[s.full_name] = student_scores.get(s.full_name, 0) + sub.grade.score

        # Check if any assignment is locked for this student
        has_lock = False
        for a in assignments:
            if a.prerequisite_id:
                has_prereq_sub = any(sub.assignment_id == a.prerequisite_id for sub in s_subs)
                if not has_prereq_sub:
                    # check override
                    ovr = (
                        await db.execute(
                            select(TaskLockOverride).where(
                                TaskLockOverride.student_id == s.id,
                                TaskLockOverride.assignment_id == a.id,
                                TaskLockOverride.is_unlocked.is_(True),
                            )
                        )
                    ).scalar_one_or_none()
                    if not ovr:
                        has_lock = True
                        break
        if has_lock:
            locked_students.append({"id": str(s.id), "name": s.full_name})

    possible_submissions = len(students) * len(assignments)
    completion_rate = int(round((total_submissions / possible_submissions) * 100)) if possible_submissions > 0 else 100
    avg_score = round(sum(scores) / len(scores), 1) if scores else None
    top_performer = max(student_scores.items(), key=lambda x: x[1])[0] if student_scores else (students[0].full_name if students else None)

    # Perfect week students count
    perfect_week_count = (
        await db.execute(
            select(func.count(func.distinct(StarTransaction.student_id))).where(
                StarTransaction.reason == StarTransactionReason.PERFECT_WEEK,
                StarTransaction.reference_id == week_key,
            )
        )
    ).scalar_one()

    # Current Student of the week for this group
    sotw_winner = (
        await db.execute(
            select(StudentOfTheWeek)
            .options(selectinload(StudentOfTheWeek.student))
            .where(
                StudentOfTheWeek.group_id == group_id,
                StudentOfTheWeek.week_key == week_key,
            )
        )
    ).scalar_one_or_none()

    return {
        "group_id": group_id,
        "group_name": group.name,
        "week_key": week_key,
        "total_students": len(students),
        "total_assignments": len(assignments),
        "completion_rate": completion_rate,
        "average_score": avg_score,
        "late_submissions": late_submissions,
        "perfect_week_students": perfect_week_count,
        "top_performer": top_performer,
        "locked_students": locked_students,
        "student_of_the_week": {
            "student_id": str(sotw_winner.student_id),
            "student_name": sotw_winner.student.full_name,
            "stars_awarded": sotw_winner.stars_awarded,
            "reason": sotw_winner.reason,
        }
        if sotw_winner
        else None,
    }
