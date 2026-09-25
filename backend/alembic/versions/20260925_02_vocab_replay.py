"""Add attempt_count and best_percentage to vocabulary_attempts

Revision ID: 20260925_02_vocab_replay
Revises: 20260925_01_ai_feedback
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260925_02_vocab_replay"
down_revision = "20260925_01_ai_feedback"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE vocabulary_attempts ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 1")
    op.execute("ALTER TABLE vocabulary_attempts ADD COLUMN IF NOT EXISTS best_percentage DOUBLE PRECISION NOT NULL DEFAULT 0.0")


def downgrade() -> None:
    op.drop_column("vocabulary_attempts", "best_percentage")
    op.drop_column("vocabulary_attempts", "attempt_count")
