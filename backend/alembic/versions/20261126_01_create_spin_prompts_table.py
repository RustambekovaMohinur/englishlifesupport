"""create spin_prompts table

Revision ID: 20261126_01_create_spin_prompts_table
Revises: 20261029_06_secure_payment_transactions
Create Date: 2026-11-26 07:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '20261126_01_create_spin_prompts_table'
down_revision = '20261029_06_secure_payment_transactions'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
    CREATE TABLE IF NOT EXISTS spin_prompts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        prompt_type VARCHAR(20) NOT NULL,
        text TEXT NOT NULL,
        category VARCHAR(100),
        group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
        assignment_id UUID REFERENCES assignments(id) ON DELETE CASCADE,
        created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        order_index INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS ix_spin_prompts_prompt_type ON spin_prompts(prompt_type);
    CREATE INDEX IF NOT EXISTS ix_spin_prompts_group_id ON spin_prompts(group_id);
    CREATE INDEX IF NOT EXISTS ix_spin_prompts_assignment_id ON spin_prompts(assignment_id);
    CREATE INDEX IF NOT EXISTS ix_spin_prompts_is_active ON spin_prompts(is_active);
    CREATE INDEX IF NOT EXISTS ix_spin_prompts_created_by ON spin_prompts(created_by);
    """)


def downgrade():
    op.execute("""
    DROP TABLE IF EXISTS spin_prompts;
    """)
