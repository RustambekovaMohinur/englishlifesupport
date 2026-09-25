"""Add submission_ai_feedbacks table

Revision ID: 20260925_01_ai_feedback
Revises: 20230923_01_add_is_relevant
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

# revision identifiers, used by Alembic.
revision = "20260925_01_ai_feedback"
down_revision = "20230923_01_add_is_relevant"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
    CREATE TABLE IF NOT EXISTS submission_ai_feedbacks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        submission_id UUID NOT NULL UNIQUE REFERENCES submissions(id) ON DELETE CASCADE,
        assignment_type VARCHAR(30) NOT NULL,
        band_score DOUBLE PRECISION,
        scaled_score_10 DOUBLE PRECISION,
        overall_feedback TEXT,
        criteria_scores JSONB,
        strengths JSONB,
        areas_for_improvement JSONB,
        detailed_corrections JSONB,
        transcription TEXT,
        ai_raw_response JSONB,
        status VARCHAR(30) NOT NULL DEFAULT 'pending',
        error_message TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS ix_submission_ai_feedbacks_submission_id ON submission_ai_feedbacks (submission_id);
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS submission_ai_feedbacks CASCADE;")
