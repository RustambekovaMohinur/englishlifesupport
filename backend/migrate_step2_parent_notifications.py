import os
import sys
from pathlib import Path
import psycopg2
from dotenv import load_dotenv

# Load backend/.env
env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(env_path)

db_url = os.getenv("DATABASE_URL")
if not db_url:
    print("No DATABASE_URL found.")
    sys.exit(1)

# Clean dialect for psycopg2 if necessary
if db_url.startswith("postgresql+psycopg2://"):
    raw_url = db_url.replace("postgresql+psycopg2://", "postgresql://")
else:
    raw_url = db_url

print(f"Connecting to Postgres...")
conn = psycopg2.connect(raw_url)
conn.autocommit = True
cur = conn.cursor()

print("Applying migrations for Step 2: Parent SMS & Direct Telegram Notification System...")

# 1. Add parent_phone to student_profiles
cur.execute("""
ALTER TABLE student_profiles
ADD COLUMN IF NOT EXISTS parent_phone VARCHAR(32);
""")
print("Added parent_phone to student_profiles.")

# 2. Create parent_homework_notifications table
cur.execute("""
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
print("Created table parent_homework_notifications.")

cur.execute("""
CREATE INDEX IF NOT EXISTS ix_parent_hw_notif_student_assign ON parent_homework_notifications(student_id, assignment_id);
CREATE INDEX IF NOT EXISTS ix_parent_hw_notif_assignment_id ON parent_homework_notifications(assignment_id);
""")
print("Created indexes.")

cur.close()
conn.close()
print("Migration completed successfully!")
