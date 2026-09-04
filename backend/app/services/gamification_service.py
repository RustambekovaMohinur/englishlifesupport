import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

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
from app.models.grade import Grade
from app.models.student import StudentProfile
from app.models.submission import Submission, SubmissionStatus
from app.models.vocabulary import VocabularyAttempt
from app.utils.datetimes import as_utc, utcnow

# Level thresholds:
# 1 Beginner: 0–100 XP
# 2 Learner: 101–300 XP
# 3 Achiever: 301–600 XP
# 4 Pro: 601–1000 XP
# 5 English Master: 1001+ XP
LEVEL_THRESHOLDS = [
    (1, 0, 100, "Beginner"),
    (2, 101, 300, "Learner"),
    (3, 301, 600, "Achiever"),
    (4, 601, 1000, "Pro"),
    (5, 1001, 999999, "English Master"),
]


def calculate_level(total_xp: int) -> tuple[int, str]:
    for lvl, min_xp, max_xp, title in LEVEL_THRESHOLDS:
        if min_xp <= total_xp <= max_xp:
            return lvl, title
    return 5, "English Master"


async def award_stars(
    db: AsyncSession,
    student_id: uuid.UUID,
    amount: int,
    reason: StarTransactionReason,
    reference_id: str | None = None,
    description: str | None = None,
) -> bool:
    """
    Idempotent star award/penalty. Returns True if transaction was recorded, False if already exists.
    Enforces total_stars >= 0.
    """
    if reference_id:
        existing = await db.execute(
            select(StarTransaction).where(
                StarTransaction.student_id == student_id,
                StarTransaction.reason == reason,
                StarTransaction.reference_id == reference_id,
            )
        )
        if existing.scalar_one_or_none() is not None:
            return False

    tx = StarTransaction(
        student_id=student_id,
        amount=amount,
        reason=reason,
        reference_id=reference_id,
        description=description,
    )
    db.add(tx)
    await db.flush()

    # Recompute student's total_stars safely so it never drops below 0
    total = (
        await db.execute(
            select(func.coalesce(func.sum(StarTransaction.amount), 0)).where(
                StarTransaction.student_id == student_id
            )
        )
    ).scalar_one()

    total_stars = max(0, int(total))
    student = (
        await db.execute(select(StudentProfile).where(StudentProfile.id == student_id))
    ).scalar_one()
    student.total_stars = total_stars
    await db.flush()
    return True


async def award_xp(
    db: AsyncSession,
    student_id: uuid.UUID,
    amount: int,
    activity_type: str,
    reference_id: str | None = None,
    description: str | None = None,
) -> bool:
    """
    Idempotent XP award. Updates student_xp total and level.
    """
    if reference_id:
        existing = await db.execute(
            select(XPTransaction).where(
                XPTransaction.student_id == student_id,
                XPTransaction.activity_type == activity_type,
                XPTransaction.reference_id == reference_id,
            )
        )
        if existing.scalar_one_or_none() is not None:
            return False

    tx = XPTransaction(
        student_id=student_id,
        amount=amount,
        activity_type=activity_type,
        reference_id=reference_id,
        description=description,
    )
    db.add(tx)
    await db.flush()

    total_xp = (
        await db.execute(
            select(func.coalesce(func.sum(XPTransaction.amount), 0)).where(
                XPTransaction.student_id == student_id
            )
        )
    ).scalar_one()

    lvl, _ = calculate_level(int(total_xp))

    xp_row = (
        await db.execute(select(StudentXP).where(StudentXP.student_id == student_id))
    ).scalar_one_or_none()

    if xp_row is None:
        xp_row = StudentXP(student_id=student_id, total_xp=int(total_xp), level=lvl)
        db.add(xp_row)
    else:
        xp_row.total_xp = int(total_xp)
        xp_row.level = lvl

    await db.flush()
    return True


async def award_lightning(
    db: AsyncSession,
    student_id: uuid.UUID,
    assignment_id: uuid.UUID,
) -> bool:
    """
    Idempotently awards exactly 1 ⚡ lightning when a student reaches 100% completion on an assignment.
    Records an Achievement with badge_key 'lightning_<assignment_id>' to guarantee idempotency across re-submissions, refreshes, or retries.
    """
    badge_key = f"lightning_{assignment_id}"
    existing = await db.execute(
        select(Achievement).where(
            Achievement.student_id == student_id,
            Achievement.badge_key == badge_key,
        )
    )
    if existing.scalar_one_or_none() is not None:
        return False

    ach = Achievement(
        student_id=student_id,
        badge_key=badge_key,
        title="Lightning Strike",
        description=f"Completed assignment 100%!",
        icon="⚡",
        unlocked_at=utcnow(),
    )
    db.add(ach)

    # Increment student's total_lightning count
    student = (await db.execute(select(StudentProfile).where(StudentProfile.id == student_id))).scalar_one()
    student.total_lightning = (getattr(student, "total_lightning", 0) or 0) + 1
    await db.flush()
    return True


async def unlock_achievement(
    db: AsyncSession,
    student_id: uuid.UUID,
    badge_key: str,
    title: str,
    description: str,
    icon: str = "🏆",
) -> bool:
    """
    Idempotently unlocks an achievement for a student.
    """
    existing = await db.execute(
        select(Achievement).where(
            Achievement.student_id == student_id,
            Achievement.badge_key == badge_key,
        )
    )
    if existing.scalar_one_or_none() is not None:
        return False

    ach = Achievement(
        student_id=student_id,
        badge_key=badge_key,
        title=title,
        description=description,
        icon=icon,
        unlocked_at=utcnow(),
    )
    db.add(ach)
    await db.flush()
    return True


async def update_student_streak(
    db: AsyncSession,
    student_id: uuid.UUID,
    activity_date_str: str | None = None,
) -> int:
    """
    Recalculates or updates streak based on learning completion date (YYYY-MM-DD).
    Handles multiple activities on same day and consecutive days.
    """
    today_str = activity_date_str or utcnow().strftime("%Y-%m-%d")
    today = datetime.strptime(today_str, "%Y-%m-%d").date()

    streak_row = (
        await db.execute(select(StudentStreak).where(StudentStreak.student_id == student_id))
    ).scalar_one_or_none()

    if streak_row is None:
        streak_row = StudentStreak(
            student_id=student_id,
            current_streak=1,
            longest_streak=1,
            last_activity_date=today_str,
        )
        db.add(streak_row)
        await db.flush()
        return 1

    if streak_row.last_activity_date == today_str:
        return streak_row.current_streak

    if streak_row.last_activity_date:
        last_date = datetime.strptime(streak_row.last_activity_date, "%Y-%m-%d").date()
        diff = (today - last_date).days
        if diff == 1:
            streak_row.current_streak += 1
        elif diff > 1:
            streak_row.current_streak = 1
        # if diff <= 0, past activity, don't break current
    else:
        streak_row.current_streak = 1

    streak_row.last_activity_date = today_str
    if streak_row.current_streak > streak_row.longest_streak:
        streak_row.longest_streak = streak_row.current_streak

    await db.flush()

    # Check streak achievements
    cur = streak_row.current_streak
    if cur >= 1:
        await unlock_achievement(db, student_id, "streak_1", "First Spark", "Completed your first learning day!", "⚡")
    if cur >= 7:
        await unlock_achievement(db, student_id, "streak_7", "Weekly Storm", "7-day learning streak!", "⚡")
    if cur >= 14:
        await unlock_achievement(db, student_id, "streak_14", "Fortnight Focus", "14-day learning streak!", "⚡")
    if cur >= 30:
        await unlock_achievement(db, student_id, "streak_30", "Thunder Legend", "30-day continuous learning streak!", "⚡")

    return streak_row.current_streak


async def is_assignment_locked_for_student(
    db: AsyncSession,
    assignment_id: uuid.UUID,
    student_id: uuid.UUID,
) -> tuple[bool, str | None]:
    """
    Returns (is_locked: bool, reason: str | None).
    Enforces sequential prerequisite task completion:
    If Task A is prerequisite for Task B, and student hasn't completed Task A, Task B is locked.
    Teacher/Admin override takes precedence.
    """
    # 1. Check if teacher granted explicit override
    override = (
        await db.execute(
            select(TaskLockOverride).where(
                TaskLockOverride.student_id == student_id,
                TaskLockOverride.assignment_id == assignment_id,
            )
        )
    ).scalar_one_or_none()
    if override and override.is_unlocked:
        return False, None

    # 2. Check assignment's prerequisite
    assignment = (
        await db.execute(select(Assignment).where(Assignment.id == assignment_id))
    ).scalar_one_or_none()
    if not assignment or not assignment.prerequisite_id:
        return False, None

    # 3. Check if student has submitted prerequisite assignment
    prereq_sub = (
        await db.execute(
            select(Submission).where(
                Submission.assignment_id == assignment.prerequisite_id,
                Submission.student_id == student_id,
            )
        )
    ).scalar_one_or_none()

    if prereq_sub is None:
        prereq = (
            await db.execute(select(Assignment).where(Assignment.id == assignment.prerequisite_id))
        ).scalar_one_or_none()
        prereq_title = prereq.title if prereq else "previous task"
        return True, f"Prerequisite '{prereq_title}' must be completed first."

    return False, None


async def get_or_create_monthly_free_pass(
    db: AsyncSession,
    student_id: uuid.UUID,
    month_key: str | None = None,
) -> FreePass:
    """
    Ensures student has a FreePass record for the given month (e.g. '2026-09').
    """
    month_key = month_key or utcnow().strftime("%Y-%m")
    fp = (
        await db.execute(
            select(FreePass).where(
                FreePass.student_id == student_id,
                FreePass.month_key == month_key,
            )
        )
    ).scalar_one_or_none()

    if fp is None:
        fp = FreePass(
            student_id=student_id,
            month_key=month_key,
            is_used=False,
        )
        db.add(fp)
        await db.flush()

    return fp


async def use_free_pass(
    db: AsyncSession,
    student_id: uuid.UUID,
    assignment_id: uuid.UUID,
) -> tuple[bool, str]:
    """
    Uses the 1 Free Pass of the current month on an assignment.
    Prevents/refunds star penalty (-20 ⭐) and unlocks the assignment progression.
    """
    month_key = utcnow().strftime("%Y-%m")
    fp = await get_or_create_monthly_free_pass(db, student_id, month_key)
    if fp.is_used:
        return False, f"You have already used your Free Pass for {month_key}."

    fp.is_used = True
    fp.used_at = utcnow()
    fp.used_for_assignment_id = assignment_id

    # If late penalty was already deducted for this assignment, refund it
    refunded = await award_stars(
        db,
        student_id=student_id,
        amount=20,
        reason=StarTransactionReason.FREE_PASS_REFUND,
        reference_id=str(assignment_id),
        description=f"Free Pass applied for assignment penalty refund",
    )

    # Automatically unlock task override for student on this assignment
    existing_ovr = (
        await db.execute(
            select(TaskLockOverride).where(
                TaskLockOverride.student_id == student_id,
                TaskLockOverride.assignment_id == assignment_id,
            )
        )
    ).scalar_one_or_none()
    student = (
        await db.execute(select(StudentProfile).where(StudentProfile.id == student_id))
    ).scalar_one()

    if existing_ovr is None:
        db.add(
            TaskLockOverride(
                student_id=student_id,
                assignment_id=assignment_id,
                is_unlocked=True,
                overridden_by=student.user_id,
            )
        )
    else:
        existing_ovr.is_unlocked = True

    await db.flush()
    return True, "Free Pass successfully applied! Penalty protected and progression unlocked."


async def check_and_award_perfect_week(
    db: AsyncSession,
    student_id: uuid.UUID,
    group_id: uuid.UUID,
) -> bool:
    """
    Checks if student completed ALL published assignments due this week on time.
    Awards +30 ⭐ and Perfect Week achievement.
    """
    now = utcnow()
    week_start = now - timedelta(days=now.weekday())  # Monday 00:00
    week_start = week_start.replace(hour=0, minute=0, second=0, microsecond=0)
    week_end = week_start + timedelta(days=7)
    week_key = f"{now.year}-W{now.isocalendar()[1]}"

    # Get all assignments published for this group due this week
    assignments = (
        await db.execute(
            select(Assignment).where(
                Assignment.group_id == group_id,
                Assignment.status == AssignmentStatus.PUBLISHED,
                Assignment.deadline >= week_start,
                Assignment.deadline < week_end,
            )
        )
    ).scalars().all()

    if not assignments:
        return False

    # Check each has an on-time submission
    for a in assignments:
        sub = (
            await db.execute(
                select(Submission).where(
                    Submission.assignment_id == a.id,
                    Submission.student_id == student_id,
                )
            )
        ).scalar_one_or_none()

        if not sub:
            return False
        # If submitted after deadline, not perfect
        if as_utc(sub.submitted_at) > as_utc(a.deadline):
            return False

    # Award +30 stars
    awarded = await award_stars(
        db,
        student_id=student_id,
        amount=30,
        reason=StarTransactionReason.PERFECT_WEEK,
        reference_id=week_key,
        description=f"Perfect Week completion for {week_key}",
    )
    if awarded:
        await award_xp(
            db,
            student_id=student_id,
            amount=50,
            activity_type="perfect_week",
            reference_id=week_key,
            description=f"XP for Perfect Week {week_key}",
        )
        await unlock_achievement(
            db,
            student_id=student_id,
            badge_key=f"perfect_week_{week_key}",
            title="Perfect Week",
            description=f"Completed all group assignments on time during {week_key}!",
            icon="🏆",
        )
        return True
    return False


async def check_comeback_achievement(
    db: AsyncSession,
    student_id: uuid.UUID,
    assignment_id: uuid.UUID,
) -> None:
    """
    If a student had missed/late on a previous task but later completed it, award Comeback.
    """
    sub = (
        await db.execute(
            select(Submission).where(
                Submission.student_id == student_id,
                Submission.assignment_id == assignment_id,
            )
        )
    ).scalar_one_or_none()
    if sub and sub.status == SubmissionStatus.LATE:
        await unlock_achievement(
            db,
            student_id=student_id,
            badge_key="comeback_achiever",
            title="Comeback",
            description="Returned and finished missed homework to resume progression!",
            icon="🔥",
        )
