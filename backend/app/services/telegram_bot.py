"""
Telegram Bot service for Parent Notifications and Automated Reporting.
Zero-cost, lightweight integration using standard async HTTP requests.
"""

import logging
import os
import uuid
from datetime import datetime
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.models.assignment import Assignment, AssignmentStatus
from app.models.student import StudentProfile
from app.models.submission import Submission, SubmissionStatus
from app.models.teacher import TeacherProfile
from app.models.user import User, UserRole
from app.models.group import Group
import sqlalchemy as sa
from app.models.grade import Grade
from app.utils.datetimes import utcnow

logger = logging.getLogger(__name__)

# Cached bot username
_CACHED_BOT_USERNAME: str | None = None

# Persistent ReplyKeyboardMarkup for parents
PARENT_KEYBOARD: dict[str, Any] = {
    "keyboard": [
        [{"text": "📊 Farzandim ko'rsatkichlari"}],
        [{"text": "ℹ️ Yordam"}],
    ],
    "resize_keyboard": True,
    "is_persistent": True,
}

# Persistent ReplyKeyboardMarkup for students
STUDENT_KEYBOARD: dict[str, Any] = {
    "keyboard": [
        [{"text": "📊 Ko'rsatkichlarim"}],
        [{"text": "ℹ️ Yordam"}],
    ],
    "resize_keyboard": True,
    "is_persistent": True,
}

HELP_ONLY_KEYBOARD: dict[str, Any] = {
    "keyboard": [
        [{"text": "ℹ️ Yordam"}],
    ],
    "resize_keyboard": True,
}

REMOVE_KEYBOARD: dict[str, Any] = {
    "remove_keyboard": True,
}


def get_telegram_bot_token() -> str:
    """Returns the Telegram Bot Token configured in settings or environment."""
    token = settings.TELEGRAM_BOT_TOKEN or os.getenv("TELEGRAM_BOT_TOKEN", "")
    return token.strip()


async def get_bot_username() -> str:
    """Returns the cached or fetched bot username, or configured default."""
    global _CACHED_BOT_USERNAME
    if _CACHED_BOT_USERNAME:
        return _CACHED_BOT_USERNAME

    configured = (settings.TELEGRAM_BOT_USERNAME or os.getenv("TELEGRAM_BOT_USERNAME", "")).strip()
    token = get_telegram_bot_token()
    if not token:
        _CACHED_BOT_USERNAME = configured or "EnglishLifeParentBot"
        return _CACHED_BOT_USERNAME

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"https://api.telegram.org/bot{token}/getMe")
            if resp.status_code == 200:
                data = resp.json()
                username = data.get("result", {}).get("username")
                if username:
                    _CACHED_BOT_USERNAME = username
                    return username
    except Exception as ex:
        logger.debug("Could not fetch bot username from Telegram API: %s", ex)

    _CACHED_BOT_USERNAME = configured or "EnglishLifeParentBot"
    return _CACHED_BOT_USERNAME


async def send_telegram_message(
    chat_id: str | int,
    text: str,
    parse_mode: str = "HTML",
    disable_web_page_preview: bool = True,
    reply_markup: dict[str, Any] | None = None,
) -> bool:
    """
    Sends an async message to a specified Telegram chat.
    Returns True on success, False on failure.
    """
    token = get_telegram_bot_token()
    if not token:
        logger.warning(
            "TELEGRAM_BOT_TOKEN is not configured. Telegram message skipped for chat_id=%s",
            chat_id,
        )
        return False

    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload: dict[str, Any] = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": parse_mode,
        "disable_web_page_preview": disable_web_page_preview,
    }
    if reply_markup is not None:
        payload["reply_markup"] = reply_markup

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, json=payload)
            if resp.status_code == 200:
                return True
            else:
                logger.error(
                    "Telegram API error (%s): %s",
                    resp.status_code,
                    resp.text,
                )
                return False
    except Exception as ex:
        logger.exception("Failed to send Telegram message to chat_id=%s: %s", chat_id, ex)
        return False


def build_parent_deep_link(bot_username: str, student_id: uuid.UUID | str) -> str:
    """Builds the one-click Telegram deep link for parent linking."""
    clean_bot = bot_username.replace("@", "").strip()
    return f"https://t.me/{clean_bot}?start=parent_{student_id}"

# Notification helper functions for assignment events
async def notify_student_assignment(chat_id: int | str, assignment_title: str, due_date: datetime, is_update: bool = False) -> bool:
    """Send a Telegram message to a student about a new or updated assignment."""
    action = "Yangilangan" if is_update else "Yangi"
    emoji = "✏️" if not is_update else "🔄"
    text = f"{emoji} {action} topshiriq 📚:\n<b>{assignment_title}</b>\n⏰ Muddati: {due_date.strftime('%d.%m.%Y')}"
    return await send_telegram_message(chat_id=chat_id, text=text)

async def notify_parent_assignment(chat_id: int | str, student_name: str, assignment_title: str, due_date: datetime, is_update: bool = False) -> bool:
    """Notify a parent about a student's assignment."""
    action = "Yangilangan" if is_update else "Yangi"
    emoji = "✏️" if not is_update else "🔄"
    text = f"{emoji} {action} topshiriq 📚 oʻquvchiga {student_name}:\n<b>{assignment_title}</b>\n⏰ Muddati: {due_date.strftime('%d.%m.%Y')}"
    return await send_telegram_message(chat_id=chat_id, text=text)

async def notify_group_assignment(chat_id: int | str, assignment_title: str, due_date: datetime, is_update: bool = False) -> bool:
    """Send group notification for a new assignment only, with exact required format and no keyboard."""
    if is_update:
        return False
    text = (
        "📌 Yangi vazifa joylandi!\n\n"
        f"📚 Vazifa: {assignment_title}\n"
        f"📅 Oxirgi muddat: {due_date.strftime('%d.%m.%Y')}\n\n"
        "🔗 Vazifani bajarish uchun platformaga o'ting:\n"
        "https://englishlifesupport.vercel.app"
    )
    return await send_telegram_message(chat_id=chat_id, text=text, reply_markup=REMOVE_KEYBOARD)


async def handle_telegram_update(update: dict[str, Any], db: AsyncSession) -> dict[str, Any]:
    """
    Processes incoming Telegram Webhook / Update object.
    Handles:
    - /start <token_or_student_id> (Deep linking with confirmation)
    - /status or "📊 Farzandim ko'rsatkichlari" (Summary of grades, attendance, stars)
    - /unlink (Detaches parent chat_id)
    - /help or "ℹ️ Yordam" or plain /start (Instructions + ReplyKeyboardMarkup)
    """
# 0. Handle my_chat_member updates for bot being added/promoted in a group
    my_chat_member = update.get("my_chat_member")
    if my_chat_member:
        chat = my_chat_member.get("chat", {})
        chat_id = chat.get("id")
        chat_title = chat.get("title") or chat.get("username")
        new_status = my_chat_member.get("new_chat_member", {}).get("status")
        if new_status in ("member", "administrator") and chat_title:
            # Find Group by matching name
            group_res = await db.execute(select(Group).where(Group.name == chat_title))
            group_obj = group_res.scalar_one_or_none()
            if group_obj:
                group_obj.telegram_group_chat_id = chat_id
                await db.commit()
                logger.info("Bound Telegram group chat ID %s to Group %s via my_chat_member", chat_id, group_obj.name)
        return {"ok": True, "note": "my_chat_member processed"}

    message = update.get("message")
    if not message:
        return {"ok": True, "note": "No message in update"}

    chat = message.get("chat", {})
    chat_id = chat.get("id")
    if not chat_id:
        return {"ok": True, "note": "No chat id"}

    text = (message.get("text") or "").strip()
    user_info = message.get("from", {})
    username = user_info.get("username")
    first_name = (user_info.get("first_name") or "").strip()
    last_name = (user_info.get("last_name") or "").strip()
    parent_name = f"{first_name} {last_name}".strip() or first_name or (f"@{username}" if username else "Hurmatli ota-ona")

    # 1. /bind_group command to manually bind a group by name
    if text.startswith("/bind_group"):
        parts = text.split(maxsplit=1)
        if len(parts) > 1:
            group_name = parts[1].strip()
            group_res = await db.execute(select(Group).where(Group.name == group_name))
            group_obj = group_res.scalar_one_or_none()
            if group_obj:
                group_obj.telegram_group_chat_id = chat_id
                await db.commit()
                await send_telegram_message(chat_id=chat_id, text=f"✅ Group '{group_name}' bound to this chat.", reply_markup=REMOVE_KEYBOARD)
                return {"ok": True}
            else:
                await send_telegram_message(chat_id=chat_id, text=f"❌ Group '{group_name}' not found.", reply_markup=REMOVE_KEYBOARD)
                return {"ok": True}
        # fall through if no group name provided

    chat_type = chat.get("type", "private")
    # In group chats, ignore interactive parent menus or commands to avoid spamming
    if chat_type != "private":
        return {"ok": True, "note": "Group chat message ignored for interactive commands"}

    # 1. Handle /start <token_or_student_id> (Deep Linking)
    if text.startswith("/start"):
        parts = text.split(maxsplit=1)
        if len(parts) > 1 and parts[1].strip():
            raw_token = parts[1].strip()
            # Clean token: remove "parent_" or "parent-" prefix if present
            clean_token = raw_token
            if clean_token.lower().startswith("parent_"):
                clean_token = clean_token[7:].strip()
            elif clean_token.lower().startswith("parent-"):
                clean_token = clean_token[7:].strip()

            student: StudentProfile | None = None
            # A. Try parsing as UUID
            try:
                student_uuid = uuid.UUID(clean_token)
                res = await db.execute(
                    select(StudentProfile)
                    .options(selectinload(StudentProfile.group))
                    .where(StudentProfile.id == student_uuid)
                )
                student = res.scalar_one_or_none()
            except ValueError:
                pass

            # B. Try matching phone or username if UUID didn't match
            if not student:
                res = await db.execute(
                    select(StudentProfile)
                    .options(selectinload(StudentProfile.group))
                    .join(User, StudentProfile.user_id == User.id)
                    .where(
                        (StudentProfile.phone == clean_token)
                        | (StudentProfile.phone == f"+{clean_token}")
                        | (User.username == clean_token)
                    )
                )
                student = res.scalar_one_or_none()

            if not student:
                await send_telegram_message(
                    chat_id=chat_id,
                    text=(
                        "⚠️ <b>Talaba topilmadi</b>\n\n"
                        "Ushbu havola bo'yicha talaba tizimdan topilmadi. Iltimos, o'quv markazidan "
                        "yoki farzandingiz profilidagi 'Telegram Botga Ulash' havolasini qaytadan oling."
                    ),
                    reply_markup=REMOVE_KEYBOARD,
                )
                return {"ok": True}

            # Match and bind the parent's chat_id to the student in the database
            student.parent_telegram_chat_id = str(chat_id)
            student.parent_telegram_username = username
            student.parent_name = parent_name
            student.parent_linked_at = utcnow()
            await db.commit()

            group_name = student.group.name if student.group else "Biriktirilmagan"
            confirmation_msg = (
                f"Farzandingiz <b>{student.full_name}</b> muvaffaqiyatli biriktirildi! "
                "Endi davomat va baholar sizga avtomatik yuboriladi.\n\n"
                f"• Guruh: <b>{group_name}</b>\n"
                f"• To'plangan Yulduzlar: ⭐ <b>{student.total_stars}</b> | ⚡ <b>{student.total_lightning}</b>\n\n"
                "Quyidagi <b>📊 Farzandim ko'rsatkichlari</b> tugmasi orqali istalgan paytda "
                "baholar va topshiriqlarni tekshirishingiz mumkin."
            )
            await send_telegram_message(
                chat_id=chat_id,
                text=confirmation_msg,
                reply_markup=PARENT_KEYBOARD,
            )
            return {"ok": True, "action": "parent_linked", "student_id": str(student.id)}

    # Check role and linked identity in database
    # 1) Check if user is linked as Parent
    res_parent = await db.execute(
        select(StudentProfile)
        .options(selectinload(StudentProfile.group))
        .where(StudentProfile.parent_telegram_chat_id == str(chat_id))
    )
    linked_students = res_parent.scalars().all()

    # 2) Check if user is linked as Student (via student profile phone or matching username/chat_id)
    student_record: StudentProfile | None = None
    res_student = await db.execute(
        select(StudentProfile)
        .options(selectinload(StudentProfile.group))
        .where(
            (StudentProfile.phone == str(chat_id))
            | (StudentProfile.phone == f"+{chat_id}")
            | (StudentProfile.phone == (username or "___none___"))
            | (StudentProfile.phone == f"@{username}" if username else False)
        )
    )
    student_record = res_student.scalars().first()

    # 3) Check if user is linked as Teacher (via teacher profile phone or matching username/chat_id)
    teacher_record: TeacherProfile | None = None
    res_teacher = await db.execute(
        select(TeacherProfile)
        .where(
            (TeacherProfile.phone == str(chat_id))
            | (TeacherProfile.phone == f"+{chat_id}")
            | (TeacherProfile.phone == (username or "___none___"))
            | (TeacherProfile.phone == f"@{username}" if username else False)
        )
    )
    teacher_record = res_teacher.scalars().first()

    # Determine user role
    user_role: str = "unregistered"
    display_name: str = parent_name
    if linked_students:
        user_role = "parent"
    elif student_record:
        user_role = "student"
        display_name = student_record.full_name or parent_name
    elif teacher_record:
        user_role = "teacher"
        display_name = teacher_record.full_name or parent_name

    user_is_linked = user_role in ("parent", "student", "teacher")

    # 2. Handle /status or button "📊 Farzandim ko'rsatkichlari" / "📊 Ko'rsatkichlarim"
    is_status_cmd = (
        text == "/status"
        or text == "📊 Farzandim ko'rsatkichlari"
        or text == "📊 Ko'rsatkichlarim"
        or "farzandim" in text.lower()
        or "ko'rsatkich" in text.lower()
    )
    if is_status_cmd:
        if user_role == "student" and student_record:
            # Student's own report
            group_str = f"{student_record.group.name} ({student_record.group.english_level})" if student_record.group else "Guruh belgilanmagan"
            # Compute aggregated stars for the student
            stars_stmt = select(sa.func.coalesce(sa.func.sum(Grade.stars), 0)).select_from(Grade).join(Submission).where(Submission.student_id == student_record.id)
            stars_res = await db.execute(stars_stmt)
            aggregated_stars = stars_res.scalar_one()
            lines = [
                f"📊 <b>{student_record.full_name} — Shaxsiy ko'rsatkichlar</b>",
                f"👥 Guruh: <b>{group_str}</b>",
                f"⭐ To'plangan yulduzlar: <b>{aggregated_stars}</b> | ⚡ Faollik: <b>{student_record.total_lightning}</b>\n",
            ]
            sub_stmt = (
                select(Submission)
                .options(
                    selectinload(Submission.assignment),
                    selectinload(Submission.grade),
                )
                .where(Submission.student_id == student_record.id)
                .order_by(Submission.submitted_at.desc())
                .limit(5)
            )
            sub_res = await db.execute(sub_stmt)
            recent_subs = sub_res.scalars().all()
            if recent_subs:
                lines.append("📝 <b>So'nggi vazifalaringiz:</b>")
                for sub in recent_subs:
                    as_title = sub.assignment.title if sub.assignment else "Vazifa"
                    sub_time = sub.submitted_at.strftime("%d.%m.%Y")
                    if sub.grade:
                        lines.append(f"• {as_title}: ✅ <b>{sub.grade.score}/10</b> ({sub_time})")
                    else:
                        lines.append(f"• {as_title}: ⏳ <b>Tekshirilmoqda</b> ({sub_time})")
            else:
                lines.append("📝 Hozircha topshirilgan vazifalar mavjud emas.")

            await send_telegram_message(
                chat_id=chat_id,
                text="\n".join(lines),
                reply_markup=STUDENT_KEYBOARD,
            )
            return {"ok": True, "action": "student_status_sent"}

        if user_role == "parent" and linked_students:
            for s in linked_students:
                group_str = f"{s.group.name} ({s.group.english_level})" if s.group else "Guruh belgilanmagan"
            # Compute aggregated stars for the student
            stars_stmt = select(sa.func.coalesce(sa.func.sum(Grade.stars), 0)).select_from(Grade).join(Submission).where(Submission.student_id == s.id)
            stars_res = await db.execute(stars_stmt)
            aggregated_stars = stars_res.scalar_one()
            lines = [
                f"📊 <b>{s.full_name} — O'qish ko'rsatkichlari</b>",
                f"👥 Guruh: <b>{group_str}</b>",
                f"⭐ To'plangan yulduzlar: <b>{aggregated_stars}</b> | ⚡ Faollik: <b>{s.total_lightning}</b>\n",
            ]

                # Query recent 5 submissions with assignment and grade
                sub_stmt = (
                    select(Submission)
                    .options(
                        selectinload(Submission.assignment),
                        selectinload(Submission.grade),
                    )
                    .where(Submission.student_id == s.id)
                    .order_by(Submission.submitted_at.desc())
                    .limit(5)
                )
                sub_res = await db.execute(sub_stmt)
                recent_subs = sub_res.scalars().all()

                if recent_subs:
                    lines.append("📝 <b>So'nggi vazifalar va baholar:</b>")
                    for sub in recent_subs:
                        as_title = sub.assignment.title if sub.assignment else "Vazifa"
                        sub_time = sub.submitted_at.strftime("%d.%m.%Y")
                        if sub.grade:
                            grade_icon = "🌟" if sub.grade.score >= 8 else "✅"
                            lines.append(f"• {as_title}: {grade_icon} <b>{sub.grade.score}/10</b> ({sub_time})")
                            if sub.grade.feedback and len(sub.grade.feedback) < 80:
                                lines.append(f"   <i>Izoh: {sub.grade.feedback}</i>")
                        elif sub.status == SubmissionStatus.LATE:
                            lines.append(f"• {as_title}: ⚠️ <b>Kechikib topshirilgan</b> ({sub_time})")
                        else:
                            lines.append(f"• {as_title}: ⏳ <b>Topshirildi (Tekshirilmoqda)</b> ({sub_time})")
                else:
                    lines.append("📝 Hozircha topshirilgan vazifalar mavjud emas.")

                # Check missed assignments
                if s.group_id:
                    missed_stmt = (
                        select(Assignment)
                        .where(
                            Assignment.group_id == s.group_id,
                            Assignment.status == AssignmentStatus.PUBLISHED,
                            Assignment.deadline < utcnow(),
                            ~Assignment.id.in_(
                                select(Submission.assignment_id).where(Submission.student_id == s.id)
                            ),
                        )
                        .order_by(Assignment.deadline.desc())
                        .limit(3)
                    )
                    missed_res = await db.execute(missed_stmt)
                    missed_assignments = missed_res.scalars().all()
                    if missed_assignments:
                        lines.append("\n⚠️ <b>Topshirilmagan vazifalar (Davomat/Qarzdorlik):</b>")
                        for ma in missed_assignments:
                            d_str = ma.deadline.strftime("%d.%m.%Y")
                            lines.append(f"• ❌ {ma.title} (Muddati: {d_str})")

                lines.append("\nℹ️ <i>Har bir yangi dars topshirig'i baholanganda, natija sizga avtomatik yuboriladi.</i>")
                await send_telegram_message(
                    chat_id=chat_id,
                    text="\n".join(lines),
                    reply_markup=PARENT_KEYBOARD,
                )
            return {"ok": True, "action": "parent_status_sent"}

        await send_telegram_message(
            chat_id=chat_id,
            text=(
                "ℹ️ <b>Siz hali birorta ham akkauntga ulanmagansiz.</b>\n\n"
                "Platformadagi profilingiz orqali Telegram botga ulanish havolasini oching."
            ),
            reply_markup=REMOVE_KEYBOARD,
        )
        return {"ok": True}

    # 3. Handle /unlink
    if text == "/unlink" or "uzish" in text.lower():
        if not user_is_linked:
            await send_telegram_message(
                chat_id=chat_id,
                text="Siz birorta ham talabaga yoki profilga ulanmagansiz.",
                reply_markup=REMOVE_KEYBOARD,
            )
            return {"ok": True}

        if linked_students:
            for s in linked_students:
                s.parent_telegram_chat_id = None
                s.parent_telegram_username = None
                s.parent_name = None
                s.parent_linked_at = None
            await db.commit()

        if student_record and (student_record.phone == str(chat_id) or student_record.phone == f"+{chat_id}"):
            student_record.phone = None
            await db.commit()

        if teacher_record and (teacher_record.phone == str(chat_id) or teacher_record.phone == f"+{chat_id}"):
            teacher_record.phone = None
            await db.commit()

        await send_telegram_message(
            chat_id=chat_id,
            text=(
                "✅ <b>Bildirishnomalar to'xtatildi.</b>\n\n"
                "Siz hisobotlardan muvaffaqiyatli uzildingiz. Xohlagan vaqtingizda "
                "qaytadan ulanishingiz mumkin."
            ),
            reply_markup=REMOVE_KEYBOARD,
        )
        return {"ok": True, "action": "unlinked"}

    # 4. Default /start, /help, or "ℹ️ Yordam" (Role-based dynamic welcome message)
    bot_name = await get_bot_username()

    if user_role == "student":
        welcome_text = (
            f"Assalomu alaykum, {display_name}! 👋\n\n"
            "Bu English Life LMS o'quvchi yordamchi boti.\n\n"
            "📌 <b>Sizning imkoniyatlaringiz:</b>\n"
            "• 📊 Shaxsiy baholar va oylik ko'rsatkichlarni kuzatish\n"
            "• 🔔 Uy vazifalari va dars jadvali haqida bildirishnomalar\n"
            "• ⚙️ /unlink — Akkauntni uzish\n"
            "• ℹ️ Yordam — Botdan foydalanish yo'riqnomasi"
        )
        keyboard = STUDENT_KEYBOARD
    elif user_role == "parent":
        welcome_text = (
            f"Assalomu alaykum, {display_name}! 👋\n\n"
            "Bu English Life LMS ota-onalar xabarnoma boti.\n\n"
            "📌 <b>Imkoniyatlar:</b>\n"
            "• 📊 Farzandingiz dars natijalari va davomatini kuzatish\n"
            "• 🔔 Vazifalar bajarilishi bo'yicha tezkor xabarlar\n"
            "• ⚙️ /unlink — Akkauntni uzish\n"
            "• ℹ️ Yordam"
        )
        keyboard = PARENT_KEYBOARD
    else:
        # Teacher or Unregistered / Not linked yet
        welcome_text = (
            "Assalomu alaykum! 👋\n\n"
            f"Bu English Life LMS rasmiy yordamchi boti (@{bot_name}).\n\n"
            "🔗 Iltimos, platformadagi profilingizni Telegram bilan ulash uchun shaxsiy kabinetingizdagi QR-kodni skanerlang.\n\n"
            "📌 <b>Buyruqlar:</b>\n"
            "• /unlink — Akkauntni uzish\n"
            "• ℹ️ Yordam"
        )
        keyboard = REMOVE_KEYBOARD

    await send_telegram_message(chat_id=chat_id, text=welcome_text, reply_markup=keyboard)
    return {"ok": True}


async def set_telegram_webhook(url: str | None = None) -> dict[str, Any]:
    """
    Sets the Telegram Bot webhook to the given URL, or automatically resolves
    it from RENDER_EXTERNAL_URL / TELEGRAM_WEBHOOK_URL / default Render domain.
    """
    token = get_telegram_bot_token()
    if not token:
        logger.warning("Cannot set Telegram webhook: TELEGRAM_BOT_TOKEN is not configured.")
        return {"ok": False, "error": "TELEGRAM_BOT_TOKEN is not configured."}

    target_url = url
    if not target_url:
        base_url = (
            os.getenv("RENDER_EXTERNAL_URL")
            or settings.TELEGRAM_WEBHOOK_URL
            or "https://englishlifesupport-kot4.onrender.com"
        ).strip().rstrip("/")
        target_url = f"{base_url}/api/telegram/webhook"

    api_url = f"https://api.telegram.org/bot{token}/setWebhook"
    payload = {
        "url": target_url,
        "drop_pending_updates": False,
        "allowed_updates": ["message", "callback_query"],
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(api_url, json=payload)
            data = resp.json()
            logger.info("Telegram setWebhook response for %s: %s", target_url, data)
            return {
                "ok": resp.status_code == 200 and data.get("ok", False),
                "webhook_url": target_url,
                "telegram_response": data,
            }
    except Exception as ex:
        logger.exception("Failed to call setWebhook for %s: %s", target_url, ex)
        return {"ok": False, "webhook_url": target_url, "error": str(ex)}


async def get_telegram_webhook_info() -> dict[str, Any]:
    """Queries Telegram getWebhookInfo to inspect current webhook status."""
    token = get_telegram_bot_token()
    if not token:
        return {"ok": False, "error": "TELEGRAM_BOT_TOKEN is not configured."}

    api_url = f"https://api.telegram.org/bot{token}/getWebhookInfo"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(api_url)
            return resp.json()
    except Exception as ex:
        logger.exception("Failed to query getWebhookInfo: %s", ex)
        return {"ok": False, "error": str(ex)}


async def delete_telegram_webhook(drop_pending_updates: bool = False) -> dict[str, Any]:
    """Deletes the current Telegram webhook (useful if switching to polling)."""
    token = get_telegram_bot_token()
    if not token:
        return {"ok": False, "error": "TELEGRAM_BOT_TOKEN is not configured."}

    api_url = f"https://api.telegram.org/bot{token}/deleteWebhook"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(api_url, json={"drop_pending_updates": drop_pending_updates})
            return resp.json()
    except Exception as ex:
        logger.exception("Failed to delete webhook: %s", ex)
        return {"ok": False, "error": str(ex)}
