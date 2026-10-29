"""private chat and ai companion

Revision ID: 20261029_05_private_chat_and_ai_companion
Revises: 20261029_04_public_notes_and_study_groups
Create Date: 2026-10-29 13:50:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '20261029_05_private_chat_and_ai_companion'
down_revision = '20261029_04_public_notes_and_study_groups'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
    CREATE TABLE IF NOT EXISTS private_messages (
        id UUID PRIMARY KEY,
        sender_id UUID NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
        recipient_id UUID NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        is_read BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS ix_private_messages_sender_id ON private_messages(sender_id);
    CREATE INDEX IF NOT EXISTS ix_private_messages_recipient_id ON private_messages(recipient_id);
    CREATE INDEX IF NOT EXISTS ix_private_messages_created_at ON private_messages(created_at);

    CREATE TABLE IF NOT EXISTS ai_chat_messages (
        id UUID PRIMARY KEY,
        student_id UUID NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
        role VARCHAR(16) NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS ix_ai_chat_messages_student_id ON ai_chat_messages(student_id);
    CREATE INDEX IF NOT EXISTS ix_ai_chat_messages_created_at ON ai_chat_messages(created_at);
    """)


def downgrade():
    op.execute("""
    DROP TABLE IF EXISTS ai_chat_messages;
    DROP TABLE IF EXISTS private_messages;
    """)
