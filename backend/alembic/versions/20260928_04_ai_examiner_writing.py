"""Add tab_switch_count and AI writing examiner columns to submissions

Revision ID: 20260928_04_ai_examiner_writing
Revises: 20260928_03_parent_notification_bot
"""

from alembic import op
import sqlalchemy as sa


revision = "20260928_04_ai_examiner_writing"
down_revision = "20260928_03_parent_notification_bot"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE submissions ADD COLUMN IF NOT EXISTS tab_switch_count BIGINT NOT NULL DEFAULT 0")
    op.execute("ALTER TABLE submissions ADD COLUMN IF NOT EXISTS ai_evaluation_json TEXT")
    op.execute("ALTER TABLE submissions ADD COLUMN IF NOT EXISTS ai_grade_suggested DOUBLE PRECISION")
    op.execute("ALTER TABLE submissions ADD COLUMN IF NOT EXISTS ai_evaluated_at TIMESTAMP WITH TIME ZONE")


def downgrade() -> None:
    op.drop_column("submissions", "ai_evaluated_at")
    op.drop_column("submissions", "ai_grade_suggested")
    op.drop_column("submissions", "ai_evaluation_json")
    op.drop_column("submissions", "tab_switch_count")
