"""curriculum release templates

Revision ID: 20261029_01_curriculum_release_templates
Revises: 20261019_01_add_weekly_badge_fields
Create Date: 2026-10-29 11:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '20261029_01_curriculum_release_templates'
down_revision = '20261019_01_add_weekly_badge_fields'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
    CREATE TABLE IF NOT EXISTS curriculum_templates (
        id UUID PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        english_level VARCHAR(50),
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    """)

    op.execute("""
    CREATE TABLE IF NOT EXISTS curriculum_items (
        id UUID PRIMARY KEY,
        template_id UUID NOT NULL REFERENCES curriculum_templates(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        day_offset INTEGER NOT NULL DEFAULT 1,
        order_index INTEGER NOT NULL DEFAULT 0,
        deadline_offset_days INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS ix_curriculum_items_template_id ON curriculum_items(template_id);
    CREATE INDEX IF NOT EXISTS ix_curriculum_items_day_offset ON curriculum_items(day_offset);
    """)

    op.execute("ALTER TABLE groups ADD COLUMN IF NOT EXISTS start_date TIMESTAMP WITH TIME ZONE;")
    op.execute("ALTER TABLE groups ADD COLUMN IF NOT EXISTS curriculum_template_id UUID REFERENCES curriculum_templates(id) ON DELETE SET NULL;")

    op.execute("ALTER TABLE assignments ADD COLUMN IF NOT EXISTS unlock_at TIMESTAMP WITH TIME ZONE;")
    op.execute("ALTER TABLE assignments ADD COLUMN IF NOT EXISTS day_offset INTEGER;")
    op.execute("ALTER TABLE assignments ADD COLUMN IF NOT EXISTS curriculum_item_id UUID REFERENCES curriculum_items(id) ON DELETE SET NULL;")
    op.execute("CREATE INDEX IF NOT EXISTS ix_assignments_unlock_at ON assignments(unlock_at);")


def downgrade():
    op.execute("DROP INDEX IF EXISTS ix_assignments_unlock_at;")
    op.execute("ALTER TABLE assignments DROP COLUMN IF EXISTS curriculum_item_id;")
    op.execute("ALTER TABLE assignments DROP COLUMN IF EXISTS day_offset;")
    op.execute("ALTER TABLE assignments DROP COLUMN IF EXISTS unlock_at;")
    op.execute("ALTER TABLE groups DROP COLUMN IF EXISTS curriculum_template_id;")
    op.execute("ALTER TABLE groups DROP COLUMN IF EXISTS start_date;")
    op.execute("DROP TABLE IF EXISTS curriculum_items CASCADE;")
    op.execute("DROP TABLE IF EXISTS curriculum_templates CASCADE;")
