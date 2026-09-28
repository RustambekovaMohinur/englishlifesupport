"""Add verification_code, verification_code_matched, tampering_detected to submissions

Revision ID: 20260928_06_verification_code_tamper
Revises: 20260928_05_ai_speaking_examiner
"""

from alembic import op
import sqlalchemy as sa


revision = "20260928_06_verification_code_tamper"
down_revision = "20260928_05_ai_speaking_examiner"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE submissions ADD COLUMN IF NOT EXISTS verification_code VARCHAR(32)")
    op.execute("ALTER TABLE submissions ADD COLUMN IF NOT EXISTS verification_code_matched BOOLEAN")
    op.execute("ALTER TABLE submissions ADD COLUMN IF NOT EXISTS tampering_detected BOOLEAN NOT NULL DEFAULT FALSE")


def downgrade() -> None:
    op.drop_column("submissions", "tampering_detected")
    op.drop_column("submissions", "verification_code_matched")
    op.drop_column("submissions", "verification_code")
