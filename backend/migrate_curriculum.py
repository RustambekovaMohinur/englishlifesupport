import os
import sys
from pathlib import Path
from dotenv import load_dotenv
import psycopg2

backend_dir = Path(__file__).resolve().parent
load_dotenv(backend_dir / ".env")

db_url = os.getenv("DATABASE_URL")
if not db_url:
    print("ERROR: DATABASE_URL not set in environment or .env")
    sys.exit(1)

connect_url = db_url.replace("postgresql+psycopg2://", "postgresql://")

try:
    conn = psycopg2.connect(connect_url)
    conn.autocommit = True
    cursor = conn.cursor()

    print("Creating curriculum_templates table...")
    cursor.execute("""
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

    print("Creating curriculum_items table...")
    cursor.execute("""
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

    print("Altering groups table...")
    cursor.execute("ALTER TABLE groups ADD COLUMN IF NOT EXISTS start_date TIMESTAMP WITH TIME ZONE;")
    cursor.execute("ALTER TABLE groups ADD COLUMN IF NOT EXISTS curriculum_template_id UUID REFERENCES curriculum_templates(id) ON DELETE SET NULL;")

    print("Altering assignments table...")
    cursor.execute("ALTER TABLE assignments ADD COLUMN IF NOT EXISTS unlock_at TIMESTAMP WITH TIME ZONE;")
    cursor.execute("ALTER TABLE assignments ADD COLUMN IF NOT EXISTS day_offset INTEGER;")
    cursor.execute("ALTER TABLE assignments ADD COLUMN IF NOT EXISTS curriculum_item_id UUID REFERENCES curriculum_items(id) ON DELETE SET NULL;")
    cursor.execute("CREATE INDEX IF NOT EXISTS ix_assignments_unlock_at ON assignments(unlock_at);")

    print("SUCCESS: Curriculum tables and columns created/verified successfully!")

    cursor.close()
    conn.close()
except Exception as e:
    print("Migration error:", e)
    sys.exit(1)
