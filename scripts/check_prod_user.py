"""
CRITICAL: The production API returned user.id=d94d3f72... for 'teacher'
but our local DB has id=29f81167... for 'teacher'.
This means Render is connected to a different DB, OR there is a newer user row.

Let me query our Neon DB for ANY user with id=d94d3f72...
and check what DATABASE_URL Render uses vs what we have locally.
"""
import psycopg2

RAW_DB = "postgresql://neondb_owner:npg_GWLjlk0x8Viy@ep-gentle-bonus-aycqd131-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require"
conn = psycopg2.connect(RAW_DB)
cur = conn.cursor()

print("=" * 70)
print("Searching for user id=d94d3f72-ae37-460b-bf19-bd4ee6731b0b in local DB...")
cur.execute("SELECT id, username, email, role, is_active, approval_status FROM users WHERE id='d94d3f72-ae37-460b-bf19-bd4ee6731b0b';")
row = cur.fetchone()
if row:
    print(f"  FOUND: {row}")
else:
    print("  NOT FOUND in this database.")

print()
print("All users in this DB:")
cur.execute("SELECT id, username, email, role, is_active FROM users ORDER BY created_at;")
for row in cur.fetchall():
    print(f"  {row[0]} | {row[1]} | {row[2]} | {row[3]} | active={row[4]}")

cur.close()
conn.close()
print("=" * 70)
