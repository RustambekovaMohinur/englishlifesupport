"""Compatibility stub for a previously generated migration revision.

This project's database metadata was left pointing at a revision ID that is no
longer present in the repository. Restore that revision into the migration graph
so Alembic can resolve the live database state and reach the proper head.

Revision ID: f100a8ceadbe
Revises: 0004_student_telegram_chat_id
Create Date: 2026-10-07
"""
from typing import Sequence, Union

revision: str = "f100a8ceadbe"
down_revision: Union[str, None] = "0004_student_telegram_chat_id"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """No-op compatibility migration for the restored historical revision."""
    pass


def downgrade() -> None:
    """No-op compatibility migration for the restored historical revision."""
    pass
