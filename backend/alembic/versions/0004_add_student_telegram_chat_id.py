"""add student telegram chat id

Revision ID: 0004_student_telegram_chat_id
Revises: 0003_student_telegram_username
Create Date: 2026-10-07

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004_student_telegram_chat_id"
down_revision: Union[str, None] = "0003_student_telegram_username"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("student_profiles", sa.Column("telegram_chat_id", sa.String(length=64), nullable=True))
    op.create_index(op.f("ix_student_profiles_telegram_chat_id"), "student_profiles", ["telegram_chat_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_student_profiles_telegram_chat_id"), table_name="student_profiles")
    op.drop_column("student_profiles", "telegram_chat_id")
