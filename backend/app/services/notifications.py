"""
Parent SMS and Direct Telegram Notification System for Missing/Incomplete Homework.
Features:
1. Automated periodic scheduler checking upcoming active lessons and deadlines.
2. Direct parent alerts via Telegram (@EnglishLife_edu_bot) and SMS.
3. Strict deduplication tracking in parent_homework_notifications table.
"""

import asyncio
from datetime import datetime, timedelta
import logging
from typing import Any
import uuid

import httpx
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.db.session import AsyncSessionLocal
from app.models.assignment import Assignment, AssignmentStatus
from app.models.group import Group
from app.models.notification import ParentHomeworkNotification
from app.models.student import StudentProfile
from app.models.submission import Submission, SubmissionStatus
from app.models.user import ApprovalStatus, User
from app.services.telegram_bot import send_telegram_message
from app.utils.datetimes import as_utc, ensure_utc, utcnow

logger = logging.getLogger("app.services.notifications")


async def send_parent_sms(phone: str, text: str) -> bool:
    """
    Dispatches SMS to parent's phone number.
    Supports integration with Uzbek SMS providers (e.g. Eskiz / PlayMobile / SMS Gateway)
    via SMS_GATEWAY_URL or logs payload when running in standard environment.
    """
    clean_phone = phone.strip().replace(" ", "").replace("-", "")
    if not clean_phone:
        return False

    sms_gateway_url = getattr(settings, "SMS_GATEWAY_URL", None)
    sms_api_key = getattr(settings, "SMS_API_KEY", None)

    if sms_gateway_url:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                headers = {"Authorization": f"Bearer {sms_api_key}"} if sms_api_key else {}
                resp = await client.post(
                    sms_gateway_url,
                    json={"phone": clean_phone, "message": text},
                    headers=headers,
                )
                if resp.status_code in (200, 201, 202):
                    logger.info("[SMS DISPATCH] Sent to %s successfully: %s", clean_phone, text)
                    return True
                else:
                    logger.warning("[SMS DISPATCH] Gateway returned %d: %s", resp.status_code, resp.text)
                    return False
        except Exception as exc:
            logger.error("[SMS DISPATCH ERROR] Failed to send SMS to %s: %s", clean_phone, exc)
            return False

    # Standalone / default webhook logging
    logger.info("[SMS MOCK DISPATCH] Recipient: %s | Message: %s", clean_phone, text)
    return True


async def check_and_send_missing_homework_alerts(
    db: AsyncSession,
    assignment_id: uuid.UUID | None = None,
) -> dict[str, Any]:
    """
    Identifies students who have not submitted or have incomplete homework for
    active assignments (approaching deadline or recently passed).
    Dispatches Telegram (@EnglishLife_edu_bot) and SMS notifications with strict deduplication.
    """
    now = ensure_utc(utcnow())
    assignments_to_check: list[Assignment] = []

    if assignment_id:
        query = (
            select(Assignment)
            .options(selectinload(Assignment.group))
            .where(Assignment.id == assignment_id)
        )
        res = await db.execute(query)
        asgn = res.scalar_one_or_none()
        if asgn:
            assignments_to_check.append(asgn)
    else:
        # Check active published assignments where deadline is within 6 hours or recently passed (up to 48 hours ago)
        approaching_threshold = now + timedelta(hours=6)
        recent_past_threshold = now - timedelta(hours=48)

        query = (
            select(Assignment)
            .options(selectinload(Assignment.group))
            .where(
                Assignment.status == AssignmentStatus.PUBLISHED,
                Assignment.deadline <= approaching_threshold,
                Assignment.deadline >= recent_past_threshold,
            )
            .order_by(Assignment.deadline.asc())
        )
        res = await db.execute(query)
        assignments_to_check = list(res.scalars().all())

    total_telegram_sent = 0
    total_sms_sent = 0
    total_students_alerted = 0
    checked_count = len(assignments_to_check)

    for assignment in assignments_to_check:
        if not assignment.group_id:
            continue

        group_name = assignment.group.name if assignment.group else "Guruh"
        deadline_utc = ensure_utc(assignment.deadline)
        formatted_deadline = deadline_utc.strftime("%d.%m.%Y %H:%M")

        # Fetch enrolled active and approved students in this group
        st_query = (
            select(StudentProfile)
            .join(User, StudentProfile.user_id == User.id)
            .where(
                StudentProfile.group_id == assignment.group_id,
                User.is_active == True,
                User.approval_status == ApprovalStatus.APPROVED,
            )
        )
        st_res = await db.execute(st_query)
        students = list(st_res.scalars().all())
        if not students:
            continue

        student_ids = [s.id for s in students]

        # Fetch existing submissions for this assignment
        sub_query = select(Submission).where(
            Submission.assignment_id == assignment.id,
            Submission.student_id.in_(student_ids),
            Submission.is_archived == False,
        )
        sub_res = await db.execute(sub_query)
        submissions = list(sub_res.scalars().all())
        submissions_by_student: dict[uuid.UUID, Submission] = {
            s.student_id: s for s in submissions
        }

        # Fetch existing notifications sent for this assignment to guarantee deduplication
        notif_query = select(ParentHomeworkNotification).where(
            ParentHomeworkNotification.assignment_id == assignment.id,
            ParentHomeworkNotification.student_id.in_(student_ids),
        )
        notif_res = await db.execute(notif_query)
        existing_notifs = list(notif_res.scalars().all())
        # Set of (student_id, channel)
        already_notified = {
            (n.student_id, n.notification_channel) for n in existing_notifs
        }

        for student in students:
            sub = submissions_by_student.get(student.id)

            # Check if student completed homework
            if sub and sub.status in (
                SubmissionStatus.SUBMITTED,
                SubmissionStatus.GRADED,
                SubmissionStatus.LATE,
            ):
                # Homework submitted successfully, no alert needed
                continue

            # Determine missing or incomplete status
            if sub is None:
                status_desc = "Topshirilmagan (Missing)"
                status_phrase = "topshirilmagan"
            else:
                status_desc = "Chala / Qayta ko'rib chiqish talab etiladi (Incomplete)"
                status_phrase = "chala topshirilgan"

            parent_name = student.parent_name or "Hurmatli ota-ona"
            alerted_this_student = False

            # 1. Telegram Alert via @EnglishLife_edu_bot
            tg_recipient = student.parent_telegram_chat_id
            if tg_recipient and (student.id, "telegram") not in already_notified:
                # Do not send parent templates to group chat IDs (IDs starting with -)
                if not str(tg_recipient).startswith("-"):
                    tg_message = (
                        f"⚠️ <b>Diqqat! English Life LMS xabarnomasi</b>\n\n"
                        f"Hurmatli <b>{parent_name}</b>!\n"
                        f"Farzandingiz <b>{student.full_name}</b>ning uy vazifasi {status_phrase}:\n\n"
                        f"📚 <b>Guruh:</b> {group_name}\n"
                        f"📝 <b>Topshiriq:</b> {assignment.title}\n"
                        f"⏳ <b>Topshirish muddati:</b> {formatted_deadline}\n"
                        f"📊 <b>Holati:</b> ❌ {status_desc}\n\n"
                        f"Iltimos, farzandingiz darsga o'z vaqtida va to'liq tayyorlanishini nazorat qiling! 🚀\n"
                        f"👉 Platforma: https://englishlife.uz"
                    )

                    try:
                        sent = await send_telegram_message(
                            chat_id=tg_recipient,
                            text=tg_message,
                        )
                        if sent:
                            notif_row = ParentHomeworkNotification(
                                id=uuid.uuid4(),
                                student_id=student.id,
                                assignment_id=assignment.id,
                                notification_channel="telegram",
                                recipient=str(tg_recipient),
                                status="sent",
                                sent_at=now,
                            )
                            db.add(notif_row)
                            already_notified.add((student.id, "telegram"))
                            total_telegram_sent += 1
                            alerted_this_student = True
                    except Exception as err:
                        logger.error(
                            "Failed to dispatch Telegram parent alert to %s: %s",
                            tg_recipient,
                            err,
                        )

            # 2. SMS Alert via parent_phone
            sms_phone = getattr(student, "parent_phone", None)
            if sms_phone and (student.id, "sms") not in already_notified:
                sms_text = (
                    f"English Life: Hurmatli ota-ona, {student.full_name}ning "
                    f"\"{assignment.title}\" vazifasi topshirilmadi. Muddat: {formatted_deadline}. "
                    f"Iltimos, nazorat qiling."
                )
                try:
                    sent = await send_parent_sms(phone=sms_phone, text=sms_text)
                    if sent:
                        notif_row = ParentHomeworkNotification(
                            id=uuid.uuid4(),
                            student_id=student.id,
                            assignment_id=assignment.id,
                            notification_channel="sms",
                            recipient=str(sms_phone),
                            status="sent",
                            sent_at=now,
                        )
                        db.add(notif_row)
                        already_notified.add((student.id, "sms"))
                        total_sms_sent += 1
                        alerted_this_student = True
                except Exception as err:
                    logger.error("Failed to dispatch SMS parent alert to %s: %s", sms_phone, err)

            if alerted_this_student:
                total_students_alerted += 1

        await db.commit()

    return {
        "success": True,
        "assignments_checked": checked_count,
        "students_alerted": total_students_alerted,
        "telegram_notifications_sent": total_telegram_sent,
        "sms_notifications_sent": total_sms_sent,
        "total_alerts_sent": total_telegram_sent + total_sms_sent,
    }


async def start_missing_homework_notification_loop():
    """
    Background worker loop that runs periodically (every 5 minutes)
    to check upcoming active assignments and dispatch deduplicated alerts to parents.
    """
    logger.info("Missing Homework Notification scheduler loop initialized.")
    while True:
        try:
            async with AsyncSessionLocal() as db:
                result = await check_and_send_missing_homework_alerts(db)
                if result.get("total_alerts_sent", 0) > 0:
                    logger.info(
                        "Dispatched %d missing homework alerts to parents (%d TG, %d SMS).",
                        result["total_alerts_sent"],
                        result["telegram_notifications_sent"],
                        result["sms_notifications_sent"],
                    )
        except asyncio.CancelledError:
            logger.info("Missing Homework Notification scheduler loop cancelled.")
            break
        except Exception as exc:
            logger.warning("Error in missing homework notification scheduler loop: %s", exc)

        # Wait 5 minutes between scheduled sweeps
        await asyncio.sleep(300)
