"""
Telegram Bot endpoints for parent linking, webhooks, and status queries.
"""

import logging
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_student_profile, get_current_user
from app.db.session import get_db
from app.models.student import StudentProfile
from app.models.user import User
from app.schemas.student import ParentLinkInfo
from app.services.telegram_bot import (
    build_parent_deep_link,
    get_bot_username,
    get_telegram_bot_token,
    handle_telegram_update,
)
from app.utils.datetimes import utcnow

router = APIRouter(prefix="/api/telegram", tags=["telegram"])
logger = logging.getLogger(__name__)


@router.post("/webhook")
async def telegram_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Receives incoming webhook updates from Telegram Bot API.
    Processes commands like /start parent_<student_id>, /status, /unlink.
    """
    try:
        update_data = await request.json()
    except Exception:
        return {"ok": False, "error": "Invalid JSON"}

    try:
        result = await handle_telegram_update(update_data, db)
        return result
    except Exception as ex:
        logger.exception("Error handling Telegram update: %s", ex)
        return {"ok": True, "error_handled": str(ex)}


@router.get("/bot-info")
async def get_bot_info():
    """Returns the bot username and configuration status."""
    token = get_telegram_bot_token()
    bot_user = await get_bot_username()
    return {
        "bot_username": bot_user,
        "is_configured": bool(token),
    }


@router.get("/parent-link-info", response_model=ParentLinkInfo)
async def get_parent_link_info(
    profile: StudentProfile = Depends(get_current_student_profile),
):
    """
    Returns the one-click Telegram deep link and current parent connection status
    for the authenticated student.
    """
    bot_user = await get_bot_username()
    link = build_parent_deep_link(bot_user, profile.id)

    return ParentLinkInfo(
        student_id=profile.id,
        bot_username=bot_user,
        telegram_link=link,
        is_parent_linked=bool(profile.parent_telegram_chat_id),
        parent_telegram_username=profile.parent_telegram_username,
        parent_name=profile.parent_name,
        parent_linked_at=profile.parent_linked_at,
        last_parent_digest_sent_at=profile.last_parent_digest_sent_at,
    )


@router.post("/unlink-parent")
async def unlink_parent(
    profile: StudentProfile = Depends(get_current_student_profile),
    db: AsyncSession = Depends(get_db),
):
    """Unlinks the parent Telegram account from the student profile."""
    profile.parent_telegram_chat_id = None
    profile.parent_telegram_username = None
    profile.parent_name = None
    profile.parent_linked_at = None
    await db.commit()
    return {"success": True, "message": "Ota-ona Telegram boti muvaffaqiyatli uzildi."}


@router.post("/test-mock-link")
async def test_mock_link(
    student_id: uuid.UUID,
    chat_id: str = "12345678",
    parent_name: str = "Test Ota-ona",
    username: str | None = "test_parent",
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Convenience test endpoint for development: links a mock parent chat ID to a student.
    """
    res = await db.execute(select(StudentProfile).where(StudentProfile.id == student_id))
    student = res.scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    student.parent_telegram_chat_id = chat_id
    student.parent_telegram_username = username
    student.parent_name = parent_name
    student.parent_linked_at = utcnow()
    await db.commit()

    return {
        "success": True,
        "message": f"Mock parent successfully linked to student {student.full_name}",
        "parent_telegram_chat_id": chat_id,
    }
