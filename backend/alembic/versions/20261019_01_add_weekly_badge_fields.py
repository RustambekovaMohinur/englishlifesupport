'''Add weekly badge fields to student_profiles.

Revision ID: 20261019_01_add_weekly_badge_fields
Revises: ('add_telegram_group_chat_id_to_groups', '20260928_06_verification_code_tamper')
Create Date: 2026-10-19 18:30:00.000000
'''

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20261019_01_add_weekly_badge_fields"
# merge both heads
down_revision = ("add_telegram_group_chat_id_to_groups", "20260928_06_verification_code_tamper")
branch_labels = None
depends_on = None

def upgrade() -> None:
    """Add the new columns to student_profiles table."""
    try:
        op.execute("ALTER TABLE alembic_version ALTER COLUMN version_num TYPE VARCHAR(128)")
    except Exception:
        pass

    with op.batch_alter_table("student_profiles", schema=None) as batch_op:
        batch_op.add_column(sa.Column("weekly_badge", sa.String(length=16), nullable=True))
        batch_op.add_column(sa.Column("badge_expires_at", sa.DateTime(timezone=True), nullable=True))

def downgrade() -> None:
    """Remove the added columns."""
    with op.batch_alter_table("student_profiles", schema=None) as batch_op:
        batch_op.drop_column("badge_expires_at")
        batch_op.drop_column("weekly_badge")
