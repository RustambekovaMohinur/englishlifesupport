"""Ensure the student Telegram linkage columns exist in live databases.

Revision ID: 0005_student_telegram_fix
Revises: f100a8ceadbe
Create Date: 2026-10-07
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "0005_student_telegram_fix"
down_revision: Union[str, None] = "f100a8ceadbe"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    existing_columns = {col["name"] for col in inspector.get_columns("student_profiles")}

    if "telegram_username" not in existing_columns:
        op.add_column("student_profiles", sa.Column("telegram_username", sa.String(length=64), nullable=True))
        op.create_index(op.f("ix_student_profiles_telegram_username"), "student_profiles", ["telegram_username"], unique=False)

    if "telegram_chat_id" not in existing_columns:
        op.add_column("student_profiles", sa.Column("telegram_chat_id", sa.String(length=64), nullable=True))
        op.create_index(op.f("ix_student_profiles_telegram_chat_id"), "student_profiles", ["telegram_chat_id"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    existing_columns = {col["name"] for col in inspector.get_columns("student_profiles")}

    if "telegram_chat_id" in existing_columns:
        op.drop_index(op.f("ix_student_profiles_telegram_chat_id"), table_name="student_profiles")
        op.drop_column("student_profiles", "telegram_chat_id")

    if "telegram_username" in existing_columns:
        op.drop_index(op.f("ix_student_profiles_telegram_username"), table_name="student_profiles")
        op.drop_column("student_profiles", "telegram_username")
