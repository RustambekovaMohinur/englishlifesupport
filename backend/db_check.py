import psycopg2

conn = psycopg2.connect("postgresql://englishlife:changeme@localhost:5432/englishlife")
cur = conn.cursor()
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'student_profiles' ORDER BY ordinal_position;")
print(cur.fetchall())
conn.close()
