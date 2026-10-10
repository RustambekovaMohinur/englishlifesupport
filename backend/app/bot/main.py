import logging
from datetime import timezone
from typing import Any

from sqlalchemy import or_, select

from app.core.config import settings
from app.db.session import AsyncSessionLocal
from app.models.assignment import Assignment
from app.models.student import StudentProfile
from app.services.telegram_sync import send_telegram_message

logger = logging.getLogger("english_life.bot")

try:
    from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
    from telegram.ext import Application, ApplicationBuilder, CallbackQueryHandler, CommandHandler, ContextTypes
except ImportError:  # pragma: no cover - dependency is optional until installed
    InlineKeyboardButton = None
    InlineKeyboardMarkup = None
    Update = Any
    Application = None
    ApplicationBuilder = None
    CallbackQueryHandler = None
    CommandHandler = None
    ContextTypes = None

telegram_app: Application | None = None


def get_active_app() -> Application | None:
    return telegram_app


def process_update_payload(payload: dict[str, Any]) -> bool:
    if telegram_app is None:
        return False
    try:
        from telegram import Update

        update = Update.de_json(payload, telegram_app.bot)
        if update is None:
            return False
        telegram_app.process_update(update)
        return True
    except Exception:
        logger.exception("Failed to process Telegram webhook payload.")
        return False


def _format_deadline(deadline: Any) -> str:
    if deadline is None:
        return "Muddat belgilanmagan"
    if hasattr(deadline, "astimezone"):
        try:
            deadline = deadline.astimezone(timezone.utc)
        except Exception:
            pass
    return deadline.strftime("%d.%m.%Y %H:%M")


async def _get_student_profile_by_chat_id(chat_id: str | int | None, username: str | None = None) -> StudentProfile | None:
    normalized_chat_id = str(chat_id or "").strip()
    normalized_username = (username or "").strip().lstrip("@")

    if not normalized_chat_id and not normalized_username:
        return None

    filters = []
    if normalized_chat_id:
        filters.append(StudentProfile.telegram_chat_id == normalized_chat_id)
    if normalized_username:
        filters.append(StudentProfile.telegram_username == normalized_username)

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(StudentProfile).where(or_(*filters)))
        return result.scalar_one_or_none()


async def _get_student_assignments(group_id: Any) -> list[Assignment]:
    if group_id is None:
        return []

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Assignment).where(Assignment.group_id == group_id).order_by(Assignment.deadline.asc())
        )
        return list(result.scalars().all())


async def start_command(update: "Update", context: "ContextTypes.DEFAULT_TYPE") -> None:
    if InlineKeyboardButton is None or InlineKeyboardMarkup is None:
        return

    keyboard = [[InlineKeyboardButton("Mening vazifalarim", callback_data="my_assignments")]]
    await update.message.reply_text(
        "Assalomu alaykum! English Life botga xush kelibsiz.\n\nMening vazifalarim tugmasini bosing.",
        reply_markup=InlineKeyboardMarkup(keyboard),
    )


async def handle_callback(update: "Update", context: "ContextTypes.DEFAULT_TYPE") -> None:
    query = update.callback_query
    if query is None:
        return

    await query.answer("Yuklanmoqda...", show_alert=False)
    if query.data == "my_assignments":
        student = await _get_student_profile_by_chat_id(query.from_user.id, query.from_user.username)
        if student is None or student.group_id is None:
            await query.edit_message_text(
                "Sizning Telegram akkauntingiz LMS profili bilan bog'lanmagan.\n\n"
                "LMSdagi profilga kiring va Telegramni bog'lash bo'limini yakunlang.",
                parse_mode="HTML",
            )
            return

        assignments = await _get_student_assignments(student.group_id)
        if not assignments:
            await query.edit_message_text("Sizda hozircha vazifa yo'q.", parse_mode="HTML")
            return

        lines = ["<b>Mening vazifalarim</b>"]
        for index, assignment in enumerate(assignments, 1):
            lines.append(f"{index}. <b>{assignment.title}</b>\n   Muddat: {_format_deadline(assignment.deadline)}")

        await query.edit_message_text("\n\n".join(lines), parse_mode="HTML")
        return

    await query.edit_message_text("Bu buyruq qo‘llab-quvvatlanmayapti.", parse_mode="HTML")


async def notify_assignment_update_to_students(
    group_id: str | Any,
    assignment_title: str,
    change_reason: str = "yangilandi",
) -> int:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(StudentProfile.telegram_chat_id)
            .where(StudentProfile.group_id == group_id)
            .where(StudentProfile.telegram_chat_id.is_not(None))
        )

    chat_ids = sorted(
        {str(row[0]).strip() for row in result.all() if row and str(row[0]).strip()},
        key=lambda value: value,
    )

    sent_count = 0
    for chat_id in chat_ids:
        message = (
            "<b>Vazifa yangilandi</b>\n"
            f"<b>Vazifa:</b> {assignment_title}\n"
            f"<b>Holat:</b> {change_reason}\n"
            "LMSdagi ma'lumotni tekshiring."
        )
        if send_telegram_message(chat_id, message):
            sent_count += 1

    return sent_count


async def notify_group_assignment_update(group_name: str, assignment_title: str, group_chat_id: str | None) -> bool:
    if not group_chat_id:
        return False
    message = (
        "<b>Vazifa yangilandi</b>\n"
        f"<b>Guruh:</b> {group_name}\n"
        f"<b>Vazifa:</b> {assignment_title}\n"
        "Yangi talablarga qarab LMSni tekshiring."
    )
    return send_telegram_message(group_chat_id, message)


async def start_bot() -> None:
    global telegram_app

    token = (settings.TELEGRAM_BOT_TOKEN or "").strip()
    if not token:
        logger.warning("Telegram bot not started: TELEGRAM_BOT_TOKEN is not configured.")
        return

    if InlineKeyboardButton is None or ApplicationBuilder is None or CommandHandler is None or CallbackQueryHandler is None:
        logger.warning("Telegram bot dependency is missing. Install python-telegram-bot and restart the app.")
        return

    if telegram_app is not None:
        return

    use_polling = bool(getattr(settings, "TELEGRAM_USE_POLLING", False))
    telemetry = "polling" if use_polling else "webhook"

    telegram_app = ApplicationBuilder().token(token).build()
    telegram_app.add_handler(CommandHandler("start", start_command))
    telegram_app.add_handler(CallbackQueryHandler(handle_callback))

    await telegram_app.initialize()

    if use_polling:
        await telegram_app.start()
        if getattr(telegram_app, "updater", None) is not None:
            telegram_app.updater.start_polling(drop_pending_updates=True)
        logger.info("Telegram bot started in polling mode.")
    else:
        webhook_url = (getattr(settings, "TELEGRAM_WEBHOOK_URL", None) or "").strip()
        if not webhook_url:
            logger.warning("No Telegram webhook URL configured; falling back to polling disabled state.")
            return
        await telegram_app.bot.set_webhook(url=webhook_url)
        await telegram_app.start()
        logger.info("Telegram webhook registered successfully: %s", webhook_url)

    logger.info("Telegram bot lifecycle ready (%s).", telemetry)


async def stop_bot() -> None:
    global telegram_app

    if telegram_app is None:
        return

    try:
        if getattr(telegram_app, "updater", None) is not None and getattr(telegram_app.updater, "running", False):
            telegram_app.updater.stop()
    except Exception:
        logger.exception("Telegram updater stop raised an exception.")

    try:
        await telegram_app.stop()
    except Exception:
        logger.exception("Telegram application stop raised an exception.")

    try:
        await telegram_app.shutdown()
    except Exception:
        logger.exception("Telegram application shutdown raised an exception.")

    telegram_app = None
    logger.info("Telegram bot stopped cleanly.")
