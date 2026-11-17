"""
Connect to the PRODUCTION Neon database (the one Render uses).
Production teacher user.id = d94d3f72-ae37-460b-bf19-bd4ee6731b0b (from /auth/me)
Run full diagnostic then fix created_by references.
"""
import psycopg2

# Production DB (Render's DATABASE_URL) — user-provided
PROD_DB = "postgresql://neondb_owner:npg_gS1I7VwEocPj@ep-bold-sun-a5j9ueqz8-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require"
KNOWN_PROD_TEACHER_USER_ID = "d94d3f72-ae37-460b-bf19-bd4ee6731b0b"  # from /auth/me

try:
    conn = psycopg2.connect(PROD_DB)
    print("SUCCESS: connected to production DB")
except Exception as e:
    print(f"FAILED to connect: {e}")
    exit(1)

cur = conn.cursor()

print("=" * 70)
print("1) Users with role=teacher in PROD DB")
cur.execute("SELECT id, username, email, role, is_active FROM users WHERE role='teacher' ORDER BY created_at;")
for row in cur.fetchall():
    print(f"  id={row[0]} username={row[1]} email={row[2]} active={row[4]}")

print()
print("2) teacher_profiles in PROD DB")
cur.execute("SELECT id, user_id, full_name FROM teacher_profiles ORDER BY created_at;")
for row in cur.fetchall():
    print(f"  tp.id={row[0]} user_id={row[1]} full_name={row[2]}")

print()
print("3) Groups in PROD DB - distinct created_by values")
cur.execute("SELECT created_by, COUNT(*) FROM groups GROUP BY created_by ORDER BY COUNT(*) DESC;")
for row in cur.fetchall():
    print(f"  created_by={row[0]} count={row[1]}")

print()
print("4) Total counts in PROD DB")
cur.execute("SELECT COUNT(*) FROM groups;")
print(f"  groups: {cur.fetchone()[0]}")
cur.execute("SELECT COUNT(*) FROM student_profiles;")
print(f"  student_profiles: {cur.fetchone()[0]}")
cur.execute("SELECT COUNT(*) FROM groups WHERE is_active=true;")
print(f"  active groups: {cur.fetchone()[0]}")

print()
print("5) Groups with names")
cur.execute("SELECT id, name, is_active, created_by FROM groups ORDER BY name;")
for row in cur.fetchall():
    print(f"  {row[1]!r}  active={row[2]}  created_by={row[3]}")

cur.close()
conn.close()
print("=" * 70)
