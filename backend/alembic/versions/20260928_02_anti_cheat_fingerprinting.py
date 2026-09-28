"""Add anti-cheat perceptual image hashing and duplicate detection columns

Revision ID: 20260928_02_anti_cheat_fingerprinting
Revises: 20260928_01_task_lock_exemption
"""

from alembic import op
import sqlalchemy as sa


revision = "20260928_02_anti_cheat_fingerprinting"
down_revision = "20260928_01_task_lock_exemption"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Submissions table
    op.execute("ALTER TABLE submissions ADD COLUMN IF NOT EXISTS image_hash VARCHAR(64)")
    op.execute("ALTER TABLE submissions ADD COLUMN IF NOT EXISTS file_sha256 VARCHAR(64)")
    op.execute("ALTER TABLE submissions ADD COLUMN IF NOT EXISTS is_suspicious BOOLEAN NOT NULL DEFAULT FALSE")
    op.execute("ALTER TABLE submissions ADD COLUMN IF NOT EXISTS similarity_score DOUBLE PRECISION")
    op.execute("ALTER TABLE submissions ADD COLUMN IF NOT EXISTS duplicate_of_submission_id UUID REFERENCES submissions(id) ON DELETE SET NULL")
    op.execute("ALTER TABLE submissions ADD COLUMN IF NOT EXISTS flag_reason VARCHAR(500)")

    # Submission images table
    op.execute("ALTER TABLE submission_images ADD COLUMN IF NOT EXISTS image_hash VARCHAR(64)")
    op.execute("ALTER TABLE submission_images ADD COLUMN IF NOT EXISTS file_sha256 VARCHAR(64)")


def downgrade() -> None:
    op.drop_column("submission_images", "file_sha256")
    op.drop_column("submission_images", "image_hash")
    op.drop_column("submissions", "flag_reason")
    op.drop_column("submissions", "duplicate_of_submission_id")
    op.drop_column("submissions", "similarity_score")
    op.drop_column("submissions", "is_suspicious")
    op.drop_column("submissions", "file_sha256")
    op.drop_column("submissions", "image_hash")
