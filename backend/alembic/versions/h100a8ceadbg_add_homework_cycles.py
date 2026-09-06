"""add_homework_cycles

Revision ID: h100a8ceadbg
Revises: g100a8ceadbf
Create Date: 2026-09-06 04:15:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "h100a8ceadbg"
down_revision: Union[str, None] = "g100a8ceadbf"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add current_cycle to groups
    op.add_column(
        "groups",
        sa.Column("current_cycle", sa.Integer(), server_default="1", nullable=False),
    )

    # 2. Add cycle_number to assignments
    op.add_column(
        "assignments",
        sa.Column("cycle_number", sa.Integer(), server_default="1", nullable=False),
    )

    # 3. Add 'archived' to assignment_status enum if not present
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("ALTER TYPE assignment_status ADD VALUE IF NOT EXISTS 'archived';")


def downgrade() -> None:
    op.drop_column("assignments", "cycle_number")
    op.drop_column("groups", "current_cycle")
