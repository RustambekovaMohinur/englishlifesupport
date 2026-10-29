"""secure payment transactions

Revision ID: 20261029_06_secure_payment_transactions
Revises: 20261029_05_private_chat_and_ai_companion
Create Date: 2026-10-29 14:30:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '20261029_06_secure_payment_transactions'
down_revision = '20261029_05_private_chat_and_ai_companion'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
    CREATE TABLE IF NOT EXISTS payment_transactions (
        id UUID PRIMARY KEY,
        student_id UUID NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
        provider VARCHAR(32) NOT NULL DEFAULT 'mock',
        provider_transaction_id VARCHAR(128) NOT NULL UNIQUE,
        plan VARCHAR(32) NOT NULL,
        amount_uzs INTEGER NOT NULL,
        currency VARCHAR(8) NOT NULL DEFAULT 'UZS',
        status VARCHAR(32) NOT NULL DEFAULT 'pending',
        metadata_json TEXT,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMP WITH TIME ZONE
    );
    CREATE INDEX IF NOT EXISTS ix_payment_transactions_student_id ON payment_transactions(student_id);
    CREATE INDEX IF NOT EXISTS ix_payment_transactions_provider_id ON payment_transactions(provider_transaction_id);
    CREATE INDEX IF NOT EXISTS ix_payment_transactions_status ON payment_transactions(status);
    """)


def downgrade():
    op.execute("""
    DROP TABLE IF EXISTS payment_transactions;
    """)
