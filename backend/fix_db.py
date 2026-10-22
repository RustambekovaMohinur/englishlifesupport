import os
import sys
from pathlib import Path
from dotenv import load_dotenv
import psycopg2

# Load environment variables
backend_dir = Path(__file__).resolve().parent
load_dotenv(backend_dir / ".env")

db_url = os.getenv("DATABASE_URL")
if not db_url:
    print("ERROR: DATABASE_URL not set in environment or .env")
    sys.exit(1)

# If db_url starts with postgresql+psycopg2://, psycopg2 prefers postgresql://
connect_url = db_url.replace("postgresql+psycopg2://", "postgresql://")
print(f"Connecting to database (masked): {connect_url.split('@')[-1] if '@' in connect_url else 'unknown'}")

try:
    conn = psycopg2.connect(connect_url)
    conn.autocommit = True
    cursor = conn.cursor()

    print("Checking alembic_version table...")
    try:
        cursor.execute("SELECT version_num FROM alembic_version;")
        versions = cursor.fetchall()
        print("Current alembic version(s):", versions)
    except Exception as e:
        print("Could not query alembic_version:", e)

    print("Applying ALTER TABLE statements to student_profiles...")
    cursor.execute("ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS weekly_badge VARCHAR(128);")
    cursor.execute("ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS badge_expires_at TIMESTAMP WITH TIME ZONE;")
    print("Columns added/verified successfully!")

    print("Verifying student_profiles columns:")
    cursor.execute("""
        SELECT column_name, data_type, character_maximum_length 
        FROM information_schema.columns 
        WHERE table_name = 'student_profiles' AND column_name IN ('weekly_badge', 'badge_expires_at');
    """)
    for row in cursor.fetchall():
        print(" -", row)

    cursor.close()
    conn.close()
    print("SUCCESS: Database migration completed directly!")
except Exception as exc:
    print(f"ERROR: {exc}")
    sys.exit(1)
