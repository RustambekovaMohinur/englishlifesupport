"""
Diagnostic: show the exact UUIDs for teacher user/profile rows and
what created_by values exist in groups / related tables.
"""
import os, sys
os.environ.setdefault("DATABASE_URL",
    "postgresql+psycopg2://neondb_owner:npg_GWLjlk0x8Viy@ep-gentle-bonus-aycqd131-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require")

import psycopg2

RAW_DB = "postgresql://neondb_owner:npg_GWLjlk0x8Viy@ep-gentle-bonus-aycqd131-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require"

conn = psycopg2.connect(RAW_DB)
cur = conn.cursor()

print("=" * 70)
print("1) ALL USERS with role=teacher")
cur.execute("SELECT id, username, email, role FROM users WHERE role='teacher' ORDER BY created_at;")
teachers = cur.fetchall()
for row in teachers:
    print(f"  user.id={row[0]}  username={row[1]}  email={row[2]}")

print()
print("2) ALL teacher_profiles")
cur.execute("SELECT id, user_id, full_name FROM teacher_profiles ORDER BY created_at;")
tprofiles = cur.fetchall()
for row in tprofiles:
    print(f"  tp.id={row[0]}  tp.user_id={row[1]}  full_name={row[2]}")

print()
print("3) DISTINCT created_by values in groups + group count per value")
cur.execute("""
    SELECT created_by, COUNT(*) as cnt
    FROM groups
    GROUP BY created_by
    ORDER BY cnt DESC;
""")
for row in cur.fetchall():
    print(f"  created_by={row[0]}  groups={row[1]}")

print()
print("4) Total groups / active groups / total student_profiles")
cur.execute("SELECT COUNT(*) FROM groups;")
print(f"  total groups: {cur.fetchone()[0]}")
cur.execute("SELECT COUNT(*) FROM groups WHERE is_active=true;")
print(f"  active groups: {cur.fetchone()[0]}")
cur.execute("SELECT COUNT(*) FROM student_profiles;")
print(f"  total student_profiles: {cur.fetchone()[0]}")

print()
print("5) student_profiles grouped by group_id (top 15)")
cur.execute("""
    SELECT g.name, g.id, g.created_by, COUNT(sp.id) as students
    FROM groups g
    LEFT JOIN student_profiles sp ON sp.group_id = g.id
    GROUP BY g.id, g.name, g.created_by
    ORDER BY students DESC
    LIMIT 15;
""")
for row in cur.fetchall():
    print(f"  group={row[1]} name={row[2]!r} created_by={row[2]} students={row[3]}")

print()
print("6) assignments — distinct created_by / teacher_id values")
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='assignments' ORDER BY ordinal_position;")
cols = [r[0] for r in cur.fetchall()]
print(f"  assignments columns: {cols}")

if 'teacher_id' in cols:
    cur.execute("SELECT teacher_id, COUNT(*) FROM assignments GROUP BY teacher_id;")
    for row in cur.fetchall():
        print(f"  assignments.teacher_id={row[0]}  count={row[1]}")
elif 'created_by' in cols:
    cur.execute("SELECT created_by, COUNT(*) FROM assignments GROUP BY created_by;")
    for row in cur.fetchall():
        print(f"  assignments.created_by={row[0]}  count={row[1]}")

cur.close()
conn.close()
print("=" * 70)
