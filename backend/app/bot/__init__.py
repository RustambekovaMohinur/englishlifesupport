"""Telegram bot integration for the LMS."""

from app.bot.main import notify_assignment_update_to_students, start_bot, stop_bot

__all__ = ["start_bot", "stop_bot", "notify_assignment_update_to_students"]
