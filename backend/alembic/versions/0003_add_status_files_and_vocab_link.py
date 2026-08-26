"""add_status_files_and_vocab_link

Revision ID: 0003_status_files
Revises: af6a81ffcb42
Create Date: 2026-08-26 11:30:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = '0003_status_files'
down_revision: Union[str, None] = 'af6a81ffcb42'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

assignment_status = postgresql.ENUM('draft', 'published', name='assignment_status')


def upgrade() -> None:
    bind = op.get_bind()
    assignment_status.create(bind, checkfirst=True)

    op.add_column(
        'assignments',
        sa.Column(
            'status',
            postgresql.ENUM('draft', 'published', name='assignment_status', create_type=False),
            nullable=False,
            server_default='draft',
        ),
    )
    op.add_column('assignments', sa.Column('file_path', sa.String(length=500), nullable=True))
    op.add_column('assignments', sa.Column('file_original_name', sa.String(length=255), nullable=True))
    op.add_column('assignments', sa.Column('file_content_type', sa.String(length=100), nullable=True))
    op.add_column('assignments', sa.Column('file_size_bytes', sa.BigInteger(), nullable=True))

    op.add_column('vocabulary_assignments', sa.Column('assignment_id', sa.UUID(), nullable=True))
    op.create_foreign_key(
        'fk_vocabulary_assignments_assignment_id',
        'vocabulary_assignments',
        'assignments',
        ['assignment_id'],
        ['id'],
        ondelete='CASCADE',
    )
    op.create_index('ix_vocabulary_assignments_assignment_id', 'vocabulary_assignments', ['assignment_id'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_vocabulary_assignments_assignment_id', table_name='vocabulary_assignments')
    op.drop_constraint('fk_vocabulary_assignments_assignment_id', 'vocabulary_assignments', type_='foreignkey')
    op.drop_column('vocabulary_assignments', 'assignment_id')

    op.drop_column('assignments', 'file_size_bytes')
    op.drop_column('assignments', 'file_content_type')
    op.drop_column('assignments', 'file_original_name')
    op.drop_column('assignments', 'file_path')
    op.drop_column('assignments', 'status')

    bind = op.get_bind()
    assignment_status.drop(bind, checkfirst=True)
