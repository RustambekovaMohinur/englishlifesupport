"""add_file_blobs_storage

Revision ID: f100a8ceadbe
Revises: e200a7bebdde
Create Date: 2026-09-04 14:35:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "f100a8ceadbe"
down_revision: Union[str, None] = "e200a7bebdde"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "file_blobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("file_path", sa.String(length=500), nullable=False, unique=True),
        sa.Column("file_data", sa.LargeBinary(), nullable=False),
        sa.Column("content_type", sa.String(length=100), nullable=True),
        sa.Column("file_name", sa.String(length=255), nullable=True),
        sa.Column("file_size", sa.BigInteger(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_file_blobs_file_path", "file_blobs", ["file_path"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_file_blobs_file_path", table_name="file_blobs")
    op.drop_table("file_blobs")
