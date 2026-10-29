"""premium and social profiles

Revision ID: 20261029_03_premium_and_social_profiles
Revises: 20261029_02_parent_homework_notifications
Create Date: 2026-10-29 13:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '20261029_03_premium_and_social_profiles'
down_revision = '20261029_02_parent_homework_notifications'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
    ALTER TABLE student_profiles
    ADD COLUMN IF NOT EXISTS is_premium BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS premium_plan VARCHAR(32) NOT NULL DEFAULT 'free',
    ADD COLUMN IF NOT EXISTS premium_expires_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS custom_badge VARCHAR(16),
    ADD COLUMN IF NOT EXISTS profile_bg_theme VARCHAR(64) DEFAULT 'default',
    ADD COLUMN IF NOT EXISTS can_write_notes BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS can_private_chat BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS can_create_groups BOOLEAN NOT NULL DEFAULT FALSE;
    """)

    op.execute("""
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS is_premium BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS premium_plan VARCHAR(32) NOT NULL DEFAULT 'free',
    ADD COLUMN IF NOT EXISTS premium_expires_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS custom_badge VARCHAR(16),
    ADD COLUMN IF NOT EXISTS profile_bg_theme VARCHAR(64) DEFAULT 'default',
    ADD COLUMN IF NOT EXISTS can_write_notes BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS can_private_chat BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS can_create_groups BOOLEAN NOT NULL DEFAULT FALSE;
    """)


def downgrade():
    op.execute("""
    ALTER TABLE student_profiles
    DROP COLUMN IF EXISTS is_premium,
    DROP COLUMN IF EXISTS premium_plan,
    DROP COLUMN IF EXISTS premium_expires_at,
    DROP COLUMN IF EXISTS custom_badge,
    DROP COLUMN IF EXISTS profile_bg_theme,
    DROP COLUMN IF EXISTS can_write_notes,
    DROP COLUMN IF EXISTS can_private_chat,
    DROP COLUMN IF EXISTS can_create_groups;
    """)

    op.execute("""
    ALTER TABLE users
    DROP COLUMN IF EXISTS is_premium,
    DROP COLUMN IF EXISTS premium_plan,
    DROP COLUMN IF EXISTS premium_expires_at,
    DROP COLUMN IF EXISTS custom_badge,
    DROP COLUMN IF EXISTS profile_bg_theme,
    DROP COLUMN IF EXISTS can_write_notes,
    DROP COLUMN IF EXISTS can_private_chat,
    DROP COLUMN IF EXISTS can_create_groups;
    """)
