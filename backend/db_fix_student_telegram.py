import psycopg2

conn = psycopg2.connect("postgresql://englishlife:changeme@localhost:5432/englishlife")
cur = conn.cursor()

cur.execute("ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS telegram_username VARCHAR(64);")
cur.execute("ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS telegram_chat_id VARCHAR(64);")
cur.execute("CREATE INDEX IF NOT EXISTS ix_student_profiles_telegram_username ON student_profiles (telegram_username);")
cur.execute("CREATE INDEX IF NOT EXISTS ix_student_profiles_telegram_chat_id ON student_profiles (telegram_chat_id);")
conn.commit()
print('student_profiles telegram columns ensured')
conn.close()
