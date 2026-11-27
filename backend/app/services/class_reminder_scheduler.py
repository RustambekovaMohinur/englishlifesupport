"""
Class Reminder Scheduler (30-Minute Pre-Class Parent Notifications).
Automatically checks upcoming group class schedules and sends Telegram alerts
to linked parents exactly 30 minutes before their child's class starts,
including a real-time summary of pending and completed homework.
"""

import asyncio
from datetime import datetime, timedelta, timezone
import logging
import re
from typing import Any
import uuid

import sqlalchemy as sa
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import AsyncSessionLocal
from app.models.assignment import Assignment, AssignmentStatus
from app.models.group import Group
from app.models.student import StudentProfile
from app.models.submission import Submission, SubmissionStatus
from app.models.user import ApprovalStatus, User
from app.services.telegram_bot import send_telegram_message

logger = logging.getLogger("app.services.class_reminder_scheduler")

# Day mapping supporting English and Uzbek weekday tokens
DAY_MAP: dict[str, int] = {
    "mon": 0, "dush": 0, "monday": 0, "dushanba": 0,
    "tue": 1, "sesh": 1, "tuesday": 1, "seshanba": 1,
    "wed": 2, "chor": 2, "wednesday": 2, "chorshanba": 2,
    "thu": 3, "pay": 3, "thursday": 3, "payshanba": 3,
    "fri": 4, "jum": 4, "friday": 4, "juma": 4,
    "sat": 5, "shan": 5, "saturday": 5, "shanba": 5,
    "sun": 6, "yak": 6, "sunday": 6, "yakshanba": 6,
}

# In-memory deduplication cache: set of (dedup_key, expiry_timestamp)
_sent_reminders: set[str] = set()

# Tashkent timezone (UTC+5)
TASHKENT_TZ = timezone(timedelta(hours=5))


def parse_group_schedule(
    schedule_str: str | None,
    group_name: str = "",
    default_time: str | None = None,
) -> tuple[list[int], int, int]:
    """
    Parses a group's schedule string into (weekdays: list[int], hour: int, minute: int).
    Weekdays: 0=Monday ... 6=Sunday.
    """
    text = (schedule_str or "").lower()
    days: set[int] = set()

    if "everyday" in text or "har kuni" in text or "daily" in text:
        days = {0, 1, 2, 3, 4, 5, 6}
    else:
        for token, day_num in DAY_MAP.items():
            if re.search(r"\b" + token, text):
                days.add(day_num)

    if not days:
        # Default standard schedule: Mon/Wed/Fri
        days = {0, 2, 4}

    # Extract class time HH:MM
    time_m = re.search(r"(\d{1,2}):(\d{2})", text)
    if not time_m and group_name:
        time_m = re.search(r"(\d{1,2}):(\d{2})", group_name)
    if not time_m and default_time:
        time_m = re.search(r"(\d{1,2}):(\d{2})", default_time)

    h, m = (int(time_m.group(1)), int(time_m.group(2))) if time_m else (14, 0)
    return sorted(days), h, m


async def check_and_send_class_reminders(db: AsyncSession) -> int:
    """
    Scans all active groups. For each group having a class starting in 20-35 minutes,
    dispatches a 30-minute reminder to linked parents with child's homework summary.
    """
    now_tashkent = datetime.now(TASHKENT_TZ)
    today_weekday = now_tashkent.weekday()
    today_str = now_tashkent.strftime("%Y-%m-%d")

    # Fetch active groups with enrolled students
    stmt = (
        select(Group)
        .options(
            selectinload(Group.students).selectinload(StudentProfile.user),
            selectinload(Group.assignments),
        )
        .where(Group.is_active == True)  # noqa: E712
    )
    result = await db.execute(stmt)
    groups = result.scalars().all()

    total_sent = 0

    for group in groups:
        if not group.students:
            continue

        days, h, m = parse_group_schedule(
            schedule_str=group.schedule,
            group_name=group.name,
            default_time=group.default_homework_time,
        )

        if today_weekday not in days:
            continue

        # Target class time today
        class_time_today = now_tashkent.replace(hour=h, minute=m, second=0, microsecond=0)
        diff_seconds = (class_time_today - now_tashkent).total_seconds()
        diff_minutes = diff_seconds / 60.0

        # Check if class starts in approximately 30 minutes (15 to 40 minute window)
        if not (15.0 <= diff_minutes <= 40.0):
            continue

        class_time_str = f"{h:02d}:{m:02d}"
        dedup_key = f"{group.id}_{today_str}_{class_time_str}"
        if dedup_key in _sent_reminders:
            continue

        _sent_reminders.add(dedup_key)
        logger.info(
            "[CLASS REMINDER] Group '%s' starts in %.1f minutes at %s. Sending alerts...",
            group.name,
            diff_minutes,
            class_time_str,
        )

        # Get published assignments for this group
        published_assignments = [
            a for a in group.assignments if a.status == AssignmentStatus.PUBLISHED
        ]
        published_ids = [a.id for a in published_assignments]

        # Pre-fetch all submissions for enrolled students in a single batched query
        # to eliminate N+1 DB roundtrips, reduce Neon connection pressure, and prevent deadlocks
        subs_by_student_id: dict[uuid.UUID, set[uuid.UUID]] = {}
        if published_ids:
            student_profile_ids = [s.id for s in group.students]
            sub_res = await db.execute(
                select(Submission.student_id, Submission.assignment_id)
                .where(
                    Submission.assignment_id.in_(published_ids),
                    Submission.student_id.in_(student_profile_ids),
                    Submission.is_archived == False,  # noqa: E712
                )
            )
            for sub_st_id, sub_asgn_id in sub_res.all():
                subs_by_student_id.setdefault(sub_st_id, set()).add(sub_asgn_id)

        for student in group.students:
            # Only alert students with verified linked parents
            if not student.parent_telegram_chat_id:
                continue

            # Student must be active and approved
            if student.user and (not student.user.is_active or student.user.approval_status != ApprovalStatus.APPROVED):
                continue

            # Calculate homework status for this student from pre-fetched map
            submitted_assign_ids = subs_by_student_id.get(student.id, set())
            completed_count = len(submitted_assign_ids)
            pending_titles = [
                asgn.title for asgn in published_assignments if asgn.id not in submitted_assign_ids
            ]

            parent_name = student.parent_name or "Hurmatli ota-ona"
            student_name = student.full_name or "Farzandingiz"

            if not pending_titles:
                pending_text = "✅ <b>Barcha vazifalar topshirilgan! Barakalla!</b>"
            else:
                p_items = [f"   • {t}" for t in pending_titles[:3]]
                if len(pending_titles) > 3:
                    p_items.append(f"   <i>...va yana {len(pending_titles) - 3} ta</i>")
                pending_text = f"❌ <b>Topshirilmagan ({len(pending_titles)} ta):</b>\n" + "\n".join(p_items)

            message_text = (
                f"⏰ <b>DARSNING BOSHLANISHIGA 30 DAQIQA QOLDI!</b>\n\n"
                f"Hurmatli <b>{parent_name}</b>,\n"
                f"Farzandingiz <b>{student_name}</b> ning <b>\"{group.name}\"</b> guruhidagi "
                f"darsi 30 daqiqadan so'ng (soat <b>{class_time_str}</b> da) boshlanadi!\n\n"
                f"📊 <b>Uyga vazifalar holati:</b>\n"
                f"• Topshirilgan vazifalar: ✅ <b>{completed_count} ta</b>\n"
                f"• Kutilayotgan vazifalar: {pending_text}\n\n"
                f"<i>Farzandingiz darsga o'z vaqtida va vazifalar bilan tayyorlanishini nazorat qilishingizni so'raymiz! ✨</i>"
            )

            try:
                sent = await send_telegram_message(
                    chat_id=student.parent_telegram_chat_id,
                    text=message_text,
                )
                if sent:
                    total_sent += 1
                    logger.info(
                        "[CLASS REMINDER] Sent 30-min reminder to parent of %s (chat %s)",
                        student_name,
                        student.parent_telegram_chat_id,
                    )
            except Exception as ex:
                logger.warning(
                    "[CLASS REMINDER] Failed to send reminder to chat %s: %s",
                    student.parent_telegram_chat_id,
                    ex,
                )

    return total_sent


def is_active_class_hours() -> bool:
    """Return True if current Tashkent time is between 07:30 and 21:00."""
    now_tashkent = datetime.now(TASHKENT_TZ)
    hour_float = now_tashkent.hour + now_tashkent.minute / 60.0
    return 7.5 <= hour_float <= 21.0


async def start_class_reminder_loop() -> None:
    """
    Background worker loop that checks upcoming class schedules every 10 minutes during daytime (07:30–21:00 Tashkent).
    Pauses without database activity during night hours so Neon serverless auto-suspends.
    """
    logger.info("Starting 30-minute pre-class reminder scheduler loop (10m daytime sweep, idle night)...")
    await asyncio.sleep(15.0)  # Initial grace delay after startup
    consecutive_errors = 0
    while True:
        try:
            if not is_active_class_hours():
                logger.debug("Class reminder loop: outside class schedule hours; sleeping 30m.")
                await asyncio.sleep(1800)
                continue

            async with AsyncSessionLocal() as db:
                await check_and_send_class_reminders(db)
            consecutive_errors = 0
            await asyncio.sleep(600.0)  # 10 minutes between sweeps during active class hours
        except asyncio.CancelledError:
            logger.info("Class reminder scheduler loop stopped.")
            break
        except Exception as exc:
            consecutive_errors += 1
            backoff_delay = min(120 * (2 ** min(consecutive_errors - 1, 4)), 1800)
            logger.warning("Error in class reminder loop iteration (backoff %ds): %s", backoff_delay, exc)
            await asyncio.sleep(backoff_delay)
