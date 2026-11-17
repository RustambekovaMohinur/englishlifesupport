"""
Deep diagnostic to understand why groups/students might not show:
- Check approval_status filtering in backend
- Check user is_active state  
- Verify group name vs ID mismatch (query showed name='29f81167...' which looks wrong)
- Check assignments table created_by alignment
"""
import psycopg2

RAW_DB = "postgresql://neondb_owner:npg_GWLjlk0x8Viy@ep-gentle-bonus-aycqd131-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require"
conn = psycopg2.connect(RAW_DB)
cur = conn.cursor()

print("=" * 70)
print("1) Users table - full details for teachers")
cur.execute("""
    SELECT id, username, email, role, is_active, approval_status, created_at
    FROM users WHERE role='teacher' ORDER BY created_at;
""")
for row in cur.fetchall():
    print(f"  id={row[0]}")
    print(f"    username={row[1]} email={row[2]} role={row[3]}")
    print(f"    is_active={row[4]} approval_status={row[5]} created_at={row[6]}")

print()
print("2) Groups table - all 9 groups with names")
cur.execute("""
    SELECT id, name, english_level, is_active, created_by, created_at
    FROM groups ORDER BY created_at;
""")
groups = cur.fetchall()
for row in groups:
    print(f"  id={row[0]} name={row[1]!r} level={row[2]} active={row[3]} created_by={row[4]}")

print()
print("3) Student approval_status distribution")
cur.execute("""
    SELECT u.approval_status, u.is_active, COUNT(*) as cnt
    FROM users u
    JOIN student_profiles sp ON sp.user_id = u.id
    GROUP BY u.approval_status, u.is_active
    ORDER BY cnt DESC;
""")
for row in cur.fetchall():
    print(f"  approval_status={row[0]} is_active={row[1]} count={row[2]}")

print()
print("4) Student profiles with no group_id (orphaned)")
cur.execute("SELECT COUNT(*) FROM student_profiles WHERE group_id IS NULL;")
print(f"  orphaned student_profiles (no group): {cur.fetchone()[0]}")

print()
print("5) Assignments breakdown by group and creator")
cur.execute("""
    SELECT g.name, a.created_by, COUNT(*) as cnt
    FROM assignments a
    JOIN groups g ON g.id = a.group_id
    GROUP BY g.name, a.created_by
    ORDER BY g.name;
""")
for row in cur.fetchall():
    print(f"  group={row[0]!r} created_by={row[1]} assignments={row[2]}")

print()
print("6) Submissions count per group")
cur.execute("""
    SELECT g.name, COUNT(s.id) as cnt
    FROM submissions s
    JOIN assignments a ON a.id = s.assignment_id
    JOIN groups g ON g.id = a.group_id
    GROUP BY g.name
    ORDER BY cnt DESC;
""")
for row in cur.fetchall():
    print(f"  group={row[0]!r} submissions={row[1]}")

print()
print("7) Feedback count")
cur.execute("SELECT COUNT(*) FROM submissions WHERE audio_feedback_path IS NOT NULL OR text_feedback IS NOT NULL;")
print(f"  submissions with feedback: {cur.fetchone()[0]}")

print()
print("8) Check if groups.created_by matches users.id or teacher_profiles.id")
cur.execute("""
    SELECT 
        g.id as group_id,
        g.name,
        g.created_by,
        u.username as matched_user,
        tp.id as matched_tp_id
    FROM groups g
    LEFT JOIN users u ON u.id = g.created_by
    LEFT JOIN teacher_profiles tp ON tp.id = g.created_by
    ORDER BY g.name;
""")
for row in cur.fetchall():
    print(f"  group={row[1]!r} created_by={row[2]} -> user={row[3]} tp_match={row[4]}")

cur.close()
conn.close()
print("=" * 70)
