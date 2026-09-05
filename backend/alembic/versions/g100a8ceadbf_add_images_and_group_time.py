"""add_images_and_group_time

Revision ID: g100a8ceadbf
Revises: f100a8ceadbe
Create Date: 2026-09-05 07:23:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "g100a8ceadbf"
down_revision: Union[str, None] = "f100a8ceadbe"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add default_homework_time to groups table
    op.add_column(
        "groups",
        sa.Column("default_homework_time", sa.String(length=10), server_default="20:00", nullable=True),
    )

    # 2. Create assignment_images table
    op.create_table(
        "assignment_images",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("assignment_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("assignments.id", ondelete="CASCADE"), nullable=False),
        sa.Column("file_path", sa.String(length=500), nullable=False),
        sa.Column("file_original_name", sa.String(length=255), nullable=False),
        sa.Column("file_content_type", sa.String(length=100), nullable=False),
        sa.Column("file_size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("order_index", sa.BigInteger(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_assignment_images_assignment_id", "assignment_images", ["assignment_id"])

    # 3. Create submission_images table
    op.create_table(
        "submission_images",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("submission_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("submissions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("file_path", sa.String(length=500), nullable=False),
        sa.Column("file_original_name", sa.String(length=255), nullable=False),
        sa.Column("file_content_type", sa.String(length=100), nullable=False),
        sa.Column("file_size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("order_index", sa.BigInteger(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_submission_images_submission_id", "submission_images", ["submission_id"])


def downgrade() -> None:
    op.drop_index("ix_submission_images_submission_id", table_name="submission_images")
    op.drop_table("submission_images")

    op.drop_index("ix_assignment_images_assignment_id", table_name="assignment_images")
    op.drop_table("assignment_images")

    op.drop_column("groups", "default_homework_time")
