"""Add parent notification telegram bot columns to student_profiles and assignments

Revision ID: 20260928_03_parent_notification_bot
Revises: 20260928_02_anti_cheat_fingerprinting
"""

from alembic import op
import sqlalchemy as sa


revision = "20260928_03_parent_notification_bot"
down_revision = "20260928_02_anti_cheat_fingerprinting"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # student_profiles table
    op.execute("ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS parent_telegram_chat_id VARCHAR(64)")
    op.execute("ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS parent_telegram_username VARCHAR(255)")
    op.execute("ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS parent_name VARCHAR(255)")
    op.execute("ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS parent_linked_at TIMESTAMP WITH TIME ZONE")
    op.execute("ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS last_parent_digest_sent_at TIMESTAMP WITH TIME ZONE")

    # assignments table
    op.execute("ALTER TABLE assignments ADD COLUMN IF NOT EXISTS parent_digest_sent BOOLEAN NOT NULL DEFAULT FALSE")


def downgrade() -> None:
    op.drop_column("assignments", "parent_digest_sent")
    op.drop_column("student_profiles", "last_parent_digest_sent_at")
    op.drop_column("student_profiles", "parent_linked_at")
    op.drop_column("student_profiles", "parent_name")
    op.drop_column("student_profiles", "parent_telegram_username")
    op.drop_column("student_profiles", "parent_telegram_chat_id")
