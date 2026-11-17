"""
Live API test: login as teacher and call dashboard + groups endpoints.
Shows what the backend actually returns in production.
"""
import requests
import json

BASE = "https://englishlifesupport-4ojx.onrender.com/api/v1"

print("=" * 70)
print("1) Login as teacher")
resp = requests.post(f"{BASE}/auth/login", json={"username": "teacher", "password": "ChangeMe123!"}, timeout=30)
print(f"  status: {resp.status_code}")
if resp.status_code != 200:
    print(f"  error: {resp.text[:300]}")
    exit(1)
data = resp.json()
token = data.get("access_token") or data.get("token")
print(f"  token: {token[:40]}..." if token else "  NO TOKEN")
headers = {"Authorization": f"Bearer {token}"}

print()
print("2) GET /groups (all cohorts for teacher)")
resp = requests.get(f"{BASE}/groups", headers=headers, timeout=30)
print(f"  status: {resp.status_code}")
if resp.status_code == 200:
    groups = resp.json()
    print(f"  group count: {len(groups)}")
    for g in groups:
        print(f"    {g.get('name')!r}: students={g.get('student_count')} id={g.get('id')}")
else:
    print(f"  error: {resp.text[:400]}")

print()
print("3) GET /dashboard (no group_id — all cohorts)")
resp = requests.get(f"{BASE}/dashboard", headers=headers, timeout=30)
print(f"  status: {resp.status_code}")
if resp.status_code == 200:
    d = resp.json()
    print(f"  total_students: {d.get('total_students')}")
    print(f"  active_students: {d.get('active_students')}")
    print(f"  total_groups: {d.get('total_groups')}")
    print(f"  total_assignments: {d.get('total_assignments')}")
    print(f"  total_submissions: {d.get('total_submissions')}")
    cohorts = d.get("cohorts") or d.get("groups") or []
    print(f"  cohorts in response: {len(cohorts)}")
    for c in cohorts:
        print(f"    {c.get('name')!r}: students={c.get('student_count', c.get('students'))}")
else:
    print(f"  error: {resp.text[:600]}")

print()
print("4) GET /auth/me")
resp = requests.get(f"{BASE}/auth/me", headers=headers, timeout=30)
print(f"  status: {resp.status_code}")
if resp.status_code == 200:
    me = resp.json()
    print(f"  id={me.get('id')} username={me.get('username')} role={me.get('role')}")
else:
    print(f"  error: {resp.text[:300]}")
print("=" * 70)
