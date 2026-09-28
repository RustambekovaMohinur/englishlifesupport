"""
Parent Notification Reporter Engine.
Checks post-deadline assignments, generates emotional tiered digests,
and dispatches them automatically to parents via Telegram Bot.
"""

import asyncio
import logging
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import AsyncSessionLocal
from app.models.assignment import Assignment, AssignmentStatus
from app.models.group import Group
from app.models.student import StudentProfile
from app.models.submission import Submission, SubmissionStatus
from app.models.vocabulary import VocabularyAssignment, VocabularyAttempt
from app.services.telegram_bot import send_telegram_message
from app.utils.datetimes import as_utc, utcnow

logger = logging.getLogger(__name__)


def format_parent_digest(
    student: StudentProfile,
    assignment: Assignment,
    submission: Submission | None,
    vocab_assign: VocabularyAssignment | None = None,
    vocab_attempt: VocabularyAttempt | None = None,
) -> tuple[str, int]:
    """
    Constructs an emotionally tailored Uzbek progress digest for a parent.
    Returns (formatted_html_message, tier_level).
    Tier 1: 100% Completed (Praise)
    Tier 2: Partial Completion (Constructive Warning)
    Tier 3: 0% / Not Submitted (Urgent Alert)
    """
    parent_name = student.parent_name or "Hurmatli ota-ona"
    student_name = student.full_name
    assignment_title = assignment.title
    deadline_str = assignment.deadline.strftime("%d.%m.%Y, %H:%M")

    has_vocab = bool(vocab_assign is not None)
    vocab_done = bool(vocab_attempt and (vocab_attempt.score or 0) >= 60)
    vocab_score = vocab_attempt.score if vocab_attempt else None

    has_sub = submission is not None
    is_graded = has_sub and (submission.grade is not None or submission.status == SubmissionStatus.GRADED)
    is_late = has_sub and submission.status == SubmissionStatus.LATE
    score_val = submission.grade.score if (submission and submission.grade) else None

    # Determine Tier
    if has_sub and (not has_vocab or vocab_done):
        tier = 1  # 100% Done
    elif has_sub or vocab_done:
        tier = 2  # Partial
    else:
        tier = 3  # Zero submission

    if tier == 1:
        # Tier 1: 🌟 100% Completed Praise
        stars_added = (score_val or 10) if is_graded else 10
        vocab_status_text = f"✅ O'zlashtirildi ({vocab_score}%)" if has_vocab else "—"
        task_text = f"✅ Bajarildi (Baho: {score_val}/10)" if is_graded else "✅ Topshirildi (Tekshirilmoqda)"
        if is_late:
            task_text += " (Kechikib topshirilgan)"

        msg = (
            f"🌟 <b>A'LO NATIJA! Dars hisoboti</b>\n\n"
            f"Hurmatli <b>{parent_name}</b>,\n"
            f"Farzandingiz <b>{student_name}</b> bugungi \"<b>{assignment_title}</b>\" "
            f"topshirig'ini muvaffaqiyatli bajardi! 👏\n\n"
            f"📊 <b>Natijalar ko'rsatkichi:</b>\n"
            f"• Asosiy vazifa: {task_text}\n"
        )
        if has_vocab:
            msg += f"• Yangi so'zlar (Vocabulary): {vocab_status_text}\n"
        msg += (
            f"• To'plangan Yulduzlar: ⭐ <b>{student.total_stars}</b> | ⚡ <b>{student.total_lightning}</b>\n\n"
            f"Farzandingizning bu intilishi va sizning berayotgan e'tiboringiz tahsinga loyiq. "
            f"O'qishida bundanda ulkan zafarlar tilaymiz! ✨"
        )
        return msg, 1

    elif tier == 2:
        # Tier 2: ⚠️ Partial Completion Warning
        task_status_text = "✅ Topshirildi" if has_sub else "❌ Bajarilmadi"
        vocab_status_text = f"✅ {vocab_score}%" if vocab_done else ("❌ Topshirilmadi" if has_vocab else "—")
        missing_items = []
        if not has_sub:
            missing_items.append("Asosiy yozma/og'zaki vazifa topshirilmagan")
        if has_vocab and not vocab_done:
            missing_items.append("Yangi so'zlar (Vocabulary) testi yechilmagan")

        missing_details = "; ".join(missing_items) if missing_items else "Qayta ishlash tavsiya etiladi"

        msg = (
            f"⚠️ <b>DIQQAT: Qisman bajarilgan topshiriq</b>\n\n"
            f"Hurmatli <b>{parent_name}</b>,\n"
            f"Farzandingiz <b>{student_name}</b> \"<b>{assignment_title}</b>\" darsi bo'yicha "
            f"vazifalarni to'liq yakunlamadi:\n\n"
            f"📋 <b>Topshiriq holati:</b>\n"
            f"• Asosiy vazifa: {task_status_text}\n"
        )
        if has_vocab:
            msg += f"• Yangi so'zlar: {vocab_status_text}\n"
        msg += (
            f"• <b>Qoldirilgan qism:</b> <i>{missing_details}</i>\n"
            f"• Jami Yulduzlar: ⭐ {student.total_stars}\n\n"
            f"Iltimos, farzandingiz darslarni to'liq o'zlashtirishi va orqada qolmasligi uchun "
            f"qoldirilgan qismlarni yakunlab qo'yishini nazorat qilishingizni so'raymiz."
        )
        return msg, 2

    else:
        # Tier 3: 🚨 Urgent Alert (0% submission)
        msg = (
            f"🚨 <b>SHOSHILINCH: Uyga vazifa topshirilmadi!</b>\n\n"
            f"Hurmatli <b>{parent_name}</b>,\n"
            f"Farzandingiz <b>{student_name}</b> \"<b>{assignment_title}</b>\" topshirig'ini "
            f"belgilangan muddat (<b>{deadline_str}</b>)gacha topshirmadi! ❌\n\n"
            f"📉 <b>Kechikkan vazifalar:</b>\n"
            f"• Asosiy vazifa: ❌ Topshirilmadi\n"
        )
        if has_vocab:
            msg += f"• Yangi so'zlar (Vocabulary): ❌ Yechilmadi\n"
        msg += (
            f"• Jami Yulduzlar: ⭐ {student.total_stars}\n\n"
            f"O'quv dasturidan orqada qolib ketmaslik uchun, iltimos, farzandingiz bilan "
            f"zudlik bilan bog'lanib, vazifani darhol bajarishini ta'minlashingizni so'raymiz."
        )
        return msg, 3


async def dispatch_due_assignment_digests(db: AsyncSession) -> int:
    """
    Finds published assignments where deadline has passed and parent_digest_sent is False.
    Constructs and sends tiered Telegram reports to all enrolled students with linked parents.
    Returns total digests successfully dispatched.
    """
    now = utcnow()
    # Find due assignments
    stmt = (
        select(Assignment)
        .options(
            selectinload(Assignment.group).selectinload(Group.students),
            selectinload(Assignment.vocabulary_assignment),
        )
        .where(
            Assignment.status == AssignmentStatus.PUBLISHED,
            Assignment.deadline <= now,
            Assignment.parent_digest_sent == False,  # noqa: E712
        )
    )
    result = await db.execute(stmt)
    due_assignments = result.scalars().all()

    if not due_assignments:
        return 0

    total_dispatched = 0

    for assignment in due_assignments:
        group = assignment.group
        if not group or not group.students:
            assignment.parent_digest_sent = True
            await db.commit()
            continue

        vocab_assign = assignment.vocabulary_assignment

        for student in group.students:
            # Skip students without linked parent
            if not student.parent_telegram_chat_id:
                continue

            # Load student submission for this assignment
            sub_res = await db.execute(
                select(Submission)
                .options(selectinload(Submission.grade))
                .where(
                    Submission.assignment_id == assignment.id,
                    Submission.student_id == student.id,
                )
            )
            submission = sub_res.scalar_one_or_none()

            # Load vocabulary attempt if vocabulary assignment exists
            vocab_attempt = None
            if vocab_assign:
                va_res = await db.execute(
                    select(VocabularyAttempt)
                    .where(
                        VocabularyAttempt.vocabulary_assignment_id == vocab_assign.id,
                        VocabularyAttempt.student_id == student.id,
                    )
                    .order_by(VocabularyAttempt.score.desc())
                )
                vocab_attempt = va_res.scalar_one_or_none()

            # Build message
            message_text, _tier = format_parent_digest(
                student=student,
                assignment=assignment,
                submission=submission,
                vocab_assign=vocab_assign,
                vocab_attempt=vocab_attempt,
            )

            # Send Telegram message
            sent = await send_telegram_message(
                chat_id=student.parent_telegram_chat_id,
                text=message_text,
            )
            if sent:
                student.last_parent_digest_sent_at = now
                total_dispatched += 1

        # Mark assignment as digest sent
        assignment.parent_digest_sent = True
        await db.commit()

    return total_dispatched


async def send_manual_parent_digest(student_id: uuid.UUID, db: AsyncSession) -> dict[str, Any]:
    """
    On-demand progress digest triggered by teacher for a specific student.
    Compiles recent activity and sends via Telegram Bot.
    """
    stmt = (
        select(StudentProfile)
        .options(selectinload(StudentProfile.group))
        .where(StudentProfile.id == student_id)
    )
    res = await db.execute(stmt)
    student = res.scalar_one_or_none()
    if not student:
        raise ValueError("Talaba topilmadi.")

    if not student.parent_telegram_chat_id:
        raise ValueError("Ushbu talabaga ota-ona Telegram boti ulanmagan.")

    # Find the most recent published assignment for this student's group
    latest_assign = None
    submission = None
    vocab_assign = None
    vocab_attempt = None

    if student.group_id:
        assign_res = await db.execute(
            select(Assignment)
            .options(selectinload(Assignment.vocabulary_assignment))
            .where(
                Assignment.group_id == student.group_id,
                Assignment.status == AssignmentStatus.PUBLISHED,
            )
            .order_by(Assignment.deadline.desc())
            .limit(1)
        )
        latest_assign = assign_res.scalar_one_or_none()

    if latest_assign:
        sub_res = await db.execute(
            select(Submission)
            .options(selectinload(Submission.grade))
            .where(
                Submission.assignment_id == latest_assign.id,
                Submission.student_id == student.id,
            )
        )
        submission = sub_res.scalar_one_or_none()
        vocab_assign = latest_assign.vocabulary_assignment
        if vocab_assign:
            va_res = await db.execute(
                select(VocabularyAttempt)
                .where(
                    VocabularyAttempt.vocabulary_assignment_id == vocab_assign.id,
                    VocabularyAttempt.student_id == student.id,
                )
                .order_by(VocabularyAttempt.score.desc())
            )
            vocab_attempt = va_res.scalar_one_or_none()

        message_text, _ = format_parent_digest(
            student=student,
            assignment=latest_assign,
            submission=submission,
            vocab_assign=vocab_assign,
            vocab_attempt=vocab_attempt,
        )
    else:
        # General progress overview if no assignment exists
        parent_name = student.parent_name or "Hurmatli ota-ona"
        message_text = (
            f"📊 <b>TALABA O'QUV HISOBOTI</b>\n\n"
            f"Hurmatli <b>{parent_name}</b>,\n"
            f"Farzandingiz <b>{student.full_name}</b>ning ayni paytdagi natijalari:\n\n"
            f"• ⭐ To'plangan Yulduzlar: <b>{student.total_stars}</b>\n"
            f"• ⚡ Faollik (Lightning): <b>{student.total_lightning}</b>\n"
            f"• Guruh: {student.group.name if student.group else 'Biriktirilmagan'}\n\n"
            f"O'qituvchi tomonidan maxsus hisobot yuborildi."
        )

    sent = await send_telegram_message(
        chat_id=student.parent_telegram_chat_id,
        text=message_text,
    )
    if not sent:
        raise RuntimeError("Telegram orqali xabar yuborishda xatolik yuz berdi. Bot tokeni to'g'ri sozlanganligini tekshiring.")

    student.last_parent_digest_sent_at = utcnow()
    await db.commit()

    return {
        "success": True,
        "message": "Ota-onaga Telegram orqali muvaffaqiyatli hisobot yuborildi.",
        "recipient_chat_id": student.parent_telegram_chat_id,
        "digest_preview": message_text,
    }


async def start_parent_reporter_loop():
    """
    Background worker that runs every 60 seconds and dispatches
    digests for newly expired assignments.
    """
    logger.info("Parent Notification Reporter background loop initialized.")
    while True:
        try:
            async with AsyncSessionLocal() as db:
                dispatched = await dispatch_due_assignment_digests(db)
                if dispatched > 0:
                    logger.info("Dispatched %d automated parent Telegram digests.", dispatched)
        except asyncio.CancelledError:
            logger.info("Parent Notification Reporter loop cancelled.")
            break
        except Exception as exc:
            logger.warning("Error in parent notification background loop: %s", exc)

        await asyncio.sleep(60)
