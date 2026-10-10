"""telegram and task progression fields

Revision ID: 0002_telegram_progress
Revises: 0001_initial
Create Date: 2026-10-07

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002_telegram_progress"
down_revision: Union[str, None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("groups", sa.Column("telegram_chat_id", sa.String(length=64), nullable=True))
    op.add_column("groups", sa.Column("telegram_chat_title", sa.String(length=255), nullable=True))
    op.add_column("groups", sa.Column("telegram_sync_enabled", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("groups", sa.Column("telegram_last_synced_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index(op.f("ix_groups_telegram_chat_id"), "groups", ["telegram_chat_id"], unique=False)

    op.add_column("assignments", sa.Column("order_index", sa.Integer(), nullable=True))
    op.create_index(op.f("ix_assignments_order_index"), "assignments", ["order_index"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_assignments_order_index"), table_name="assignments")
    op.drop_column("assignments", "order_index")

    op.drop_index(op.f("ix_groups_telegram_chat_id"), table_name="groups")
    op.drop_column("groups", "telegram_last_synced_at")
    op.drop_column("groups", "telegram_sync_enabled")
    op.drop_column("groups", "telegram_chat_title")
    op.drop_column("groups", "telegram_chat_id")
