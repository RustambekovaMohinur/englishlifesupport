"""Add audio_transcript, speaking_metrics_json, ai_speaking_evaluation_json to submissions

Revision ID: 20260928_05_ai_speaking_examiner
Revises: 20260928_04_ai_examiner_writing
"""

from alembic import op
import sqlalchemy as sa


revision = "20260928_05_ai_speaking_examiner"
down_revision = "20260928_04_ai_examiner_writing"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE submissions ADD COLUMN IF NOT EXISTS audio_transcript TEXT")
    op.execute("ALTER TABLE submissions ADD COLUMN IF NOT EXISTS speaking_metrics_json TEXT")
    op.execute("ALTER TABLE submissions ADD COLUMN IF NOT EXISTS ai_speaking_evaluation_json TEXT")


def downgrade() -> None:
    op.drop_column("submissions", "ai_speaking_evaluation_json")
    op.drop_column("submissions", "speaking_metrics_json")
    op.drop_column("submissions", "audio_transcript")
