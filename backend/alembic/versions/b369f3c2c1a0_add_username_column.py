"""add username column

Revision ID: b369f3c2c1a0
Revises: 0004_gamification
Create Date: 2026-09-03 16:21:36.844269
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'b369f3c2c1a0'
down_revision: Union[str, None] = '0004_gamification'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    # Add nullable username column
    op.add_column('users', sa.Column('username', sa.String(255), nullable=True, index=True))
    # Backfill existing rows with a guaranteed unique placeholder
    op.execute("""
        UPDATE users
        SET username = 'user_' || replace(id::text, '-', '')
        WHERE username IS NULL;
    """)
    # Make the column non‑nullable
    op.alter_column('users', 'username', nullable=False)
    # Create case‑insensitive unique index
    op.create_index('ix_users_username_lower', 'users', [sa.text('lower(username)')], unique=True)

def downgrade() -> None:
    # Drop the unique index and the column
    op.drop_index('ix_users_username_lower', table_name='users')
    op.drop_column('users', 'username')
