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

from app.core.config import settings
from app.models.student import StudentProfile
from app.utils.datetimes import utcnow

logger = logging.getLogger(__name__)

# Cached bot username
_CACHED_BOT_USERNAME: str | None = None


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
    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": parse_mode,
        "disable_web_page_preview": disable_web_page_preview,
    }

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


async def handle_telegram_update(update: dict[str, Any], db: AsyncSession) -> dict[str, Any]:
    """
    Processes incoming Telegram Webhook / Update object.
    Handles /start parent_<student_id>, /status, /unlink, /help.
    """
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

    # 1. Handle /start parent_<student_id>
    if text.startswith("/start parent_"):
        raw_id = text.replace("/start parent_", "").strip()
        try:
            student_uuid = uuid.UUID(raw_id)
        except Exception:
            await send_telegram_message(
                chat_id=chat_id,
                text=(
                    "⚠️ <b>Noto'g'ri havola</b>\n\n"
                    "Talaba identifikatori noto'g'ri ko'rinadi. Iltimos, o'quv markazidan yoki "
                    "farzandingiz profilidan to'g'ri havolani oling."
                ),
            )
            return {"ok": True}

        # Look up student profile
        res = await db.execute(
            select(StudentProfile).where(StudentProfile.id == student_uuid)
        )
        student = res.scalar_one_or_none()
        if not student:
            await send_telegram_message(
                chat_id=chat_id,
                text=(
                    "⚠️ <b>Talaba topilmadi</b>\n\n"
                    "Ushbu havola bo'yicha talaba tizimdan topilmadi. Iltimos, o'qituvchingiz "
                    "yoki farzandingizdan qaytadan havola oling."
                ),
            )
            return {"ok": True}

        # Link parent
        student.parent_telegram_chat_id = str(chat_id)
        student.parent_telegram_username = username
        student.parent_name = parent_name
        student.parent_linked_at = utcnow()
        await db.commit()

        welcome_text = (
            f"Assalomu alaykum, <b>{parent_name}</b>! 🎉\n\n"
            f"Siz muvaffaqiyatli tarzda <b>{student.full_name}</b>ning dars hisobotlariga ulandingiz.\n\n"
            "📌 <b>Nimalar yuboriladi?</b>\n"
            "• Har bir topshiriq muddati (deadline) tugashi bilan dars hisoboti\n"
            "• Bajarilgan va qolib ketgan vazifalar ro'yxati\n"
            "• Yangi yodlangan so'zlar (Vocabulary) natijasi\n"
            f"• To'plangan Yulduzlar: ⭐ <b>{student.total_stars}</b> | ⚡ <b>{student.total_lightning}</b>\n\n"
            "Farzandingizning bilim olishini birgalikda qo'llab-quvvatlayotganingiz uchun tashakkur! 🚀"
        )
        await send_telegram_message(chat_id=chat_id, text=welcome_text)
        return {"ok": True, "action": "parent_linked", "student_id": str(student.id)}

    # 2. Handle /status
    if text == "/status":
        res = await db.execute(
            select(StudentProfile).where(StudentProfile.parent_telegram_chat_id == str(chat_id))
        )
        linked_students = res.scalars().all()
        if not linked_students:
            await send_telegram_message(
                chat_id=chat_id,
                text=(
                    "ℹ️ <b>Siz hali birorta talabaga ulanmagansiz.</b>\n\n"
                    "Farzandingiz profilidagi 'Telegram Botga Ulash' havolasi orqali kirishingiz mumkin."
                ),
            )
            return {"ok": True}

        lines = ["📊 <b>Sizga biriktirilgan talabalar holati:</b>\n"]
        for s in linked_students:
            lines.append(
                f"👤 <b>{s.full_name}</b>\n"
                f"• ⭐ Yulduzlar: <b>{s.total_stars}</b>\n"
                f"• ⚡ Faollik (Lightning): <b>{s.total_lightning}</b>\n"
                f"• 🕒 Ulanilgan sana: {s.parent_linked_at.strftime('%Y-%m-%d %H:%M') if s.parent_linked_at else 'Noma`lum'}\n"
            )
        lines.append("Har bir topshiriq muddati tugaganda batafsil hisobot shu yerga yuboriladi.")
        await send_telegram_message(chat_id=chat_id, text="\n".join(lines))
        return {"ok": True, "action": "status_sent"}

    # 3. Handle /unlink
    if text == "/unlink":
        res = await db.execute(
            select(StudentProfile).where(StudentProfile.parent_telegram_chat_id == str(chat_id))
        )
        linked_students = res.scalars().all()
        if not linked_students:
            await send_telegram_message(
                chat_id=chat_id,
                text="Siz birorta ham talabaga ulanmagansiz.",
            )
            return {"ok": True}

        for s in linked_students:
            s.parent_telegram_chat_id = None
            s.parent_telegram_username = None
        await db.commit()

        await send_telegram_message(
            chat_id=chat_id,
            text=(
                "✅ <b>Bildirishnomalar to'xtatildi.</b>\n\n"
                "Siz talaba hisobotlaridan muvaffaqiyatli uzildingiz. Xohlagan vaqtingizda "
                "qaytadan ulanishingiz mumkin."
            ),
        )
        return {"ok": True, "action": "unlinked"}

    # 4. Default /start or /help
    bot_name = await get_bot_username()
    help_text = (
        f"Assalomu alaykum, <b>{parent_name}</b>!\n\n"
        f"Bu <b>English Life LMS</b> ota-onalar xabarnoma boti (@{bot_name}).\n\n"
        "Farzandingiz dars natijalarini kuzatish uchun platformadagi QR kodni skanerlang yoki "
        "maxsus ulanish havolasini bosing.\n\n"
        "📌 <b>Buyruqlar:</b>\n"
        "• /status - Biriktirilgan farzandingiz ko'rsatkichlari\n"
        "• /unlink - Bildirishnomalardan chiqish\n"
        "• /help - Yordam"
    )
    await send_telegram_message(chat_id=chat_id, text=help_text)
    return {"ok": True}
