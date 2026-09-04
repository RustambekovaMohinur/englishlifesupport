"""add_corrections_and_comments

Revision ID: e200a7bebdde
Revises: c190a6ceadcb
Create Date: 2026-09-04 14:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "e200a7bebdde"
down_revision: Union[str, None] = "c190a6ceadcb"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create submission_corrections table
    op.create_table(
        "submission_corrections",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("submission_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("submissions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("teacher_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("selected_text", sa.Text(), nullable=False),
        sa.Column("correction", sa.Text(), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("error_type", sa.String(length=50), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_submission_corrections_submission_id", "submission_corrections", ["submission_id"])
    op.create_index("ix_submission_corrections_teacher_id", "submission_corrections", ["teacher_id"])

    # 2. Create submission_comments table
    op.create_table(
        "submission_comments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("submission_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("submissions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("teacher_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("comment", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_submission_comments_submission_id", "submission_comments", ["submission_id"])
    op.create_index("ix_submission_comments_teacher_id", "submission_comments", ["teacher_id"])

    # 3. Relax check constraint on grades to allow 0-100 stars
    op.drop_constraint("ck_grade_stars_range", "grades", type_="check")
    op.create_check_constraint("ck_grade_stars_range", "grades", "stars >= 0 AND stars <= 100")

    # 4. Performance indexes for approval status and group owner
    op.create_index("ix_users_approval_status", "users", ["approval_status"])
    op.create_index("ix_groups_created_by", "groups", ["created_by"])


def downgrade() -> None:
    op.drop_index("ix_groups_created_by", table_name="groups")
    op.drop_index("ix_users_approval_status", table_name="users")
    op.drop_constraint("ck_grade_stars_range", "grades", type_="check")
    op.create_check_constraint("ck_grade_stars_range", "grades", "stars >= 2 AND stars <= 5")
    op.drop_table("submission_comments")
    op.drop_table("submission_corrections")
