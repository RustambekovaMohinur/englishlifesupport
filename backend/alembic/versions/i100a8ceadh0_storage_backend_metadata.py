"""storage_backend_metadata

Revision ID: i100a8ceadh0
Revises: h100a8ceadbg
Create Date: 2026-09-06 14:05:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "i100a8ceadh0"
down_revision: Union[str, None] = "h100a8ceadbg"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Make file_data nullable so binaries are no longer stored in PostgreSQL
    op.alter_column("file_blobs", "file_data", existing_type=sa.LargeBinary(), nullable=True)

    # 2. Add storage_backend (default 'b2')
    op.add_column(
        "file_blobs",
        sa.Column("storage_backend", sa.String(length=32), server_default="b2", nullable=False),
    )

    # 3. Add storage_key (object key in object storage)
    op.add_column(
        "file_blobs",
        sa.Column("storage_key", sa.String(length=500), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("file_blobs", "storage_key")
    op.drop_column("file_blobs", "storage_backend")
    op.alter_column("file_blobs", "file_data", existing_type=sa.LargeBinary(), nullable=False)
