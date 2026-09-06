"""drop_file_data_column

Revision ID: j100a8ceadh1
Revises: i100a8ceadh0
Create Date: 2026-09-06 15:15:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "j100a8ceadh1"
down_revision: Union[str, None] = "i100a8ceadh0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Permanently remove the obsolete binary column from PostgreSQL.
    # All binary storage has migrated to private Backblaze B2 object storage.
    op.drop_column("file_blobs", "file_data")


def downgrade() -> None:
    op.add_column(
        "file_blobs",
        sa.Column("file_data", sa.LargeBinary(), nullable=True),
    )
