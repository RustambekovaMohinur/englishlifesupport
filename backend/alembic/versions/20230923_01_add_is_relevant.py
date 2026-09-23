"""Add is_relevant column to submissions table

Revision ID: 20230923_01_add_is_relevant
Revises: k100a8ceadh2
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20230923_01_add_is_relevant"
down_revision = "k100a8ceadh2"
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.execute("ALTER TABLE submissions ADD COLUMN IF NOT EXISTS is_relevant BOOLEAN NOT NULL DEFAULT TRUE;")

def downgrade() -> None:
    op.execute("ALTER TABLE submissions DROP COLUMN IF EXISTS is_relevant;")
