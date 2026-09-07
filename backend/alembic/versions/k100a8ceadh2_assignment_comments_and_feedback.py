"""assignment_comments_and_feedback

Revision ID: k100a8ceadh2
Revises: j100a8ceadh1
Create Date: 2026-09-07 17:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'k100a8ceadh2'
down_revision: Union[str, None] = 'j100a8ceadh1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add is_hard_deadline column to assignments
    op.execute("ALTER TABLE assignments ADD COLUMN IF NOT EXISTS is_hard_deadline BOOLEAN NOT NULL DEFAULT FALSE;")

    # 2. Create assignment_comments table
    op.execute("""
    CREATE TABLE IF NOT EXISTS assignment_comments (
        id UUID PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        content TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_assignment_comments_assignment_id ON assignment_comments (assignment_id);
    CREATE INDEX IF NOT EXISTS ix_assignment_comments_user_id ON assignment_comments (user_id);
    """)

    # 3. Create platform_feedbacks table
    op.execute("""
    CREATE TABLE IF NOT EXISTS platform_feedbacks (
        id UUID PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        rating SMALLINT NOT NULL,
        category VARCHAR(50) NOT NULL,
        message TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_platform_feedbacks_user_id ON platform_feedbacks (user_id);
    """)


def downgrade() -> None:
    op.execute("""
    DROP TABLE IF EXISTS platform_feedbacks CASCADE;
    DROP TABLE IF EXISTS assignment_comments CASCADE;
    ALTER TABLE assignments DROP COLUMN IF EXISTS is_hard_deadline;
    """)
