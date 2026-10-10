import psycopg2

conn = psycopg2.connect("postgresql://englishlife:changeme@localhost:5432/englishlife")
cur = conn.cursor()

# Student Telegram linkage used by status display and teacher detail endpoints.
cur.execute("ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS telegram_username VARCHAR(64);")
cur.execute("ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS telegram_chat_id VARCHAR(64);")
cur.execute("CREATE INDEX IF NOT EXISTS ix_student_profiles_telegram_username ON student_profiles (telegram_username);")
cur.execute("CREATE INDEX IF NOT EXISTS ix_student_profiles_telegram_chat_id ON student_profiles (telegram_chat_id);")

# Group-level Telegram sync used by teacher dashboard and notifications.
cur.execute("ALTER TABLE groups ADD COLUMN IF NOT EXISTS telegram_chat_id VARCHAR(64);")
cur.execute("ALTER TABLE groups ADD COLUMN IF NOT EXISTS telegram_chat_title VARCHAR(255);")
cur.execute("ALTER TABLE groups ADD COLUMN IF NOT EXISTS telegram_sync_enabled BOOLEAN NOT NULL DEFAULT FALSE;")
cur.execute("ALTER TABLE groups ADD COLUMN IF NOT EXISTS telegram_last_synced_at TIMESTAMPTZ;")
cur.execute("CREATE INDEX IF NOT EXISTS ix_groups_telegram_chat_id ON groups (telegram_chat_id);")

# Assignment ordering used by teacher assignment management.
cur.execute("ALTER TABLE assignments ADD COLUMN IF NOT EXISTS order_index INTEGER;")
cur.execute("CREATE INDEX IF NOT EXISTS ix_assignments_order_index ON assignments (order_index);")

conn.commit()
print('lms schema repair complete')
conn.close()
