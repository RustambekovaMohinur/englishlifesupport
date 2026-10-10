import json
import logging
from datetime import datetime, timezone
from urllib import error, request

from app.core.config import settings

logger = logging.getLogger(__name__)


def _telegram_request(method: str, payload: dict) -> dict | None:
    token = (settings.TELEGRAM_BOT_TOKEN or "").strip()
    if not token:
        logger.warning("Telegram notification skipped: TELEGRAM_BOT_TOKEN is not configured.")
        return None

    url = f"https://api.telegram.org/bot{token}/{method}"
    data = json.dumps(payload).encode("utf-8")
    req = request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST")

    try:
        with request.urlopen(req, timeout=10) as response:
            body = response.read().decode("utf-8")
            return json.loads(body)
    except error.URLError as exc:
        logger.error("Telegram API request failed for %s: %s", method, exc)
        return None
    except Exception as exc:  # pragma: no cover - defensive guard for unexpected transport failures
        logger.exception("Unexpected Telegram error while calling %s: %s", method, exc)
        return None


def send_telegram_message(chat_id: str | None, text: str) -> bool:
    normalized_chat_id = (chat_id or "").strip()
    if not normalized_chat_id:
        logger.warning("Telegram notification skipped: chat_id is missing.")
        return False

    response = _telegram_request(
        "sendMessage",
        {
            "chat_id": normalized_chat_id,
            "text": text,
            "parse_mode": "HTML",
            "disable_web_page_preview": True,
        },
    )
    if not response or not response.get("ok"):
        description = response.get("description") if isinstance(response, dict) else "unknown Telegram API response"
        logger.error("Telegram message failed to send to chat_id %s: %s", normalized_chat_id, description)
        return False
    return True


def send_assignment_notification(group_name: str, assignment_title: str, chat_id: str | None) -> bool:
    normalized_chat_id = (chat_id or "").strip()
    if not normalized_chat_id:
        logger.warning("Telegram assignment notification skipped: group '%s' has no telegram_chat_id.", group_name)
        return False

    raw_chat = normalized_chat_id.lstrip("-")
    if not raw_chat.isdigit():
        logger.warning(
            "Telegram assignment notification skipped for group '%s': telegram_chat_id '%s' is invalid. "
            "Expected a Telegram numeric chat ID like -1001234567890.",
            group_name,
            normalized_chat_id,
        )
        return False

    token = (settings.TELEGRAM_BOT_TOKEN or "").strip()
    if not token:
        logger.warning("Telegram assignment notification failed: TELEGRAM_BOT_TOKEN is missing for group '%s'.", group_name)
        return False

    message = (
        "<b>New assignment published</b>\n"
        f"<b>Group:</b> {group_name}\n"
        f"<b>Assignment:</b> {assignment_title}\n"
        "Please open the LMS and complete it before the deadline."
    )
    return send_telegram_message(normalized_chat_id, message)


def notify_group_task_drop(group_name: str, assignment_title: str, chat_id: str | None) -> bool:
    return send_assignment_notification(group_name, assignment_title, chat_id)


def notify_first_submission_spotlight(student_name: str, assignment_title: str, chat_id: str | None) -> bool:
    if not chat_id:
        return False
    message = (
        f"<b>First submission spotlight</b>\n"
        f"{student_name} submitted the first answer for <b>{assignment_title}</b>.\n"
        "Great work — keep the momentum going!"
    )
    return send_telegram_message(chat_id, message)


def notify_accountability_reminder(group_name: str, student_name: str, missing_count: int, chat_id: str | None) -> bool:
    if not chat_id:
        return False
    message = (
        f"<b>Accountability check</b>\n"
        f"Group: {group_name}\n"
        f"Student: {student_name}\n"
        f"Pending work: {missing_count} task(s) not completed or approved yet.\n"
        "Please open the LMS and catch up before the next session."
    )
    return send_telegram_message(chat_id, message)


def build_group_status_snapshot(group_name: str, total_students: int, active_students: int, pending_tasks: int) -> str:
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    return (
        f"<b>{group_name} sync snapshot</b>\n"
        f"Students: {active_students}/{total_students}\n"
        f"Pending tasks: {pending_tasks}\n"
        f"Updated: {timestamp}"
    )
