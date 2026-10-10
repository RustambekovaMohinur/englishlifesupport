"""add student telegram username

Revision ID: 0003_student_telegram_username
Revises: 0002_telegram_progress
Create Date: 2026-10-07

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003_student_telegram_username"
down_revision: Union[str, None] = "0002_telegram_progress"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("student_profiles", sa.Column("telegram_username", sa.String(length=64), nullable=True))
    op.create_index(op.f("ix_student_profiles_telegram_username"), "student_profiles", ["telegram_username"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_student_profiles_telegram_username"), table_name="student_profiles")
    op.drop_column("student_profiles", "telegram_username")
