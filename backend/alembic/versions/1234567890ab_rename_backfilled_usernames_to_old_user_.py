"""rename backfilled usernames to old_user prefix

Revision ID: 1234567890ab
Revises: b369f3c2c1a0
Create Date: 2026-09-03 16:53:55.173704

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '1234567890ab'
down_revision: Union[str, None] = 'b369f3c2c1a0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
