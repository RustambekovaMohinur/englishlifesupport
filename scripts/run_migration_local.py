"""
Run the teacher linkage migration on the LOCAL Neon DB (the one with actual data).
This is idempotent - safe to run multiple times.
"""
import psycopg2

RAW_DB = "postgresql://neondb_owner:npg_GWLjlk0x8Viy@ep-gentle-bonus-aycqd131-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require"
conn = psycopg2.connect(RAW_DB)
cur = conn.cursor()

print("=" * 70)
print("Finding bootstrap teacher in local DB...")
cur.execute("SELECT id, username, email FROM users WHERE email='teacher@englishlife.uz' LIMIT 1;")
teacher = cur.fetchone()
if not teacher:
    print("ERROR: teacher@englishlife.uz not found!")
    cur.close(); conn.close(); exit(1)

teacher_user_id = teacher[0]
print(f"  teacher user.id = {teacher_user_id}  username={teacher[1]}")

print()
print("Checking groups that need re-linking...")
cur.execute("""
    SELECT COUNT(*) FROM groups
    WHERE created_by IS NULL
       OR created_by NOT IN (SELECT id FROM users);
""")
print(f"  Groups needing fix: {cur.fetchone()[0]}")

print("Checking assignments that need re-linking...")
cur.execute("""
    SELECT COUNT(*) FROM assignments
    WHERE created_by IS NULL
       OR created_by NOT IN (SELECT id FROM users);
""")
print(f"  Assignments needing fix: {cur.fetchone()[0]}")

print()
print("Running migration...")
cur.execute("""
    UPDATE groups
    SET created_by = %s
    WHERE created_by IS NULL
       OR created_by NOT IN (SELECT id FROM users);
""", (teacher_user_id,))
groups_fixed = cur.rowcount
print(f"  Groups updated: {groups_fixed}")

cur.execute("""
    UPDATE assignments
    SET created_by = %s
    WHERE created_by IS NULL
       OR created_by NOT IN (SELECT id FROM users);
""", (teacher_user_id,))
assignments_fixed = cur.rowcount
print(f"  Assignments updated: {assignments_fixed}")

conn.commit()
print()
print("Verification after migration:")
cur.execute("""
    SELECT
        (SELECT COUNT(*) FROM groups) as total_groups,
        (SELECT COUNT(*) FROM groups WHERE is_active = true) as active_groups,
        (SELECT COUNT(*) FROM student_profiles) as total_students,
        (SELECT COUNT(*) FROM assignments) as total_assignments;
""")
row = cur.fetchone()
print(f"  total_groups={row[0]}  active_groups={row[1]}  total_students={row[2]}  total_assignments={row[3]}")

cur.execute("SELECT DISTINCT created_by FROM groups;")
print("  Distinct groups.created_by values after fix:")
for row in cur.fetchall():
    print(f"    {row[0]}")

cur.close()
conn.close()
print("=" * 70)
print("Migration complete.")
