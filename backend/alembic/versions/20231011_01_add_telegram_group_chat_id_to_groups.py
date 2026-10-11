"""Alembic migration to add telegram_group_chat_id column to groups table.

Revision ID: add_telegram_group_chat_id_to_groups
Revises: None
Create Date: 2026-10-11 10:52:00.000000
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "add_telegram_group_chat_id_to_groups"
# You may set "down_revision" to the last migration identifier if known, else None
down_revision = None
branch_labels = None
depends_on = None

def upgrade():
    op.add_column(
        "groups",
        sa.Column("telegram_group_chat_id", sa.String(length=32), nullable=True),
    )

def downgrade():
    op.drop_column("groups", "telegram_group_chat_id")
