"""parent homework notifications and parent phone

Revision ID: 20261029_02_parent_homework_notifications
Revises: 20261029_01_curriculum_release_templates
Create Date: 2026-10-29 12:15:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '20261029_02_parent_homework_notifications'
down_revision = '20261029_01_curriculum_release_templates'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
    ALTER TABLE student_profiles
    ADD COLUMN IF NOT EXISTS parent_phone VARCHAR(32);
    """)

    op.execute("""
    CREATE TABLE IF NOT EXISTS parent_homework_notifications (
        id UUID PRIMARY KEY,
        student_id UUID NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
        assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
        notification_channel VARCHAR(32) NOT NULL,
        recipient VARCHAR(64) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'sent',
        sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        CONSTRAINT uq_parent_hw_notif UNIQUE (student_id, assignment_id, notification_channel)
    );
    """)

    op.execute("""
    CREATE INDEX IF NOT EXISTS ix_parent_hw_notif_student_assign ON parent_homework_notifications(student_id, assignment_id);
    CREATE INDEX IF NOT EXISTS ix_parent_hw_notif_assignment_id ON parent_homework_notifications(assignment_id);
    """)


def downgrade():
    op.execute("DROP TABLE IF EXISTS parent_homework_notifications;")
    op.execute("ALTER TABLE student_profiles DROP COLUMN IF EXISTS parent_phone;")
