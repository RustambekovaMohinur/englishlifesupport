"""Add is_exempted to task_lock_overrides

Revision ID: 20260928_01_task_lock_exemption
Revises: 20260925_02_vocab_replay
"""

from alembic import op
import sqlalchemy as sa


revision = "20260928_01_task_lock_exemption"
down_revision = "20260925_02_vocab_replay"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE task_lock_overrides ADD COLUMN IF NOT EXISTS is_exempted BOOLEAN NOT NULL DEFAULT FALSE")


def downgrade() -> None:
    op.drop_column("task_lock_overrides", "is_exempted")
