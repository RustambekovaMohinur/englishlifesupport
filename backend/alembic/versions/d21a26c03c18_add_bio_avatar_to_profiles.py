"""add_bio_avatar_to_profiles

Revision ID: d21a26c03c18
Revises: 1234567890ab
Create Date: 2026-09-03 17:23:45.185685

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd21a26c03c18'
down_revision: Union[str, None] = '1234567890ab'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("student_profiles", sa.Column("bio", sa.Text(), nullable=True))
    op.add_column("student_profiles", sa.Column("avatar_url", sa.String(length=512), nullable=True))
    op.add_column("teacher_profiles", sa.Column("bio", sa.Text(), nullable=True))
    op.add_column("teacher_profiles", sa.Column("avatar_url", sa.String(length=512), nullable=True))


def downgrade() -> None:
    op.drop_column("teacher_profiles", "avatar_url")
    op.drop_column("teacher_profiles", "bio")
    op.drop_column("student_profiles", "avatar_url")
    op.drop_column("student_profiles", "bio")
