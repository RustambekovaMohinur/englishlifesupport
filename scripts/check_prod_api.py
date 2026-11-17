"""
The prod API /auth/me returned user.id=d94d3f72-ae37-460b-bf19-bd4ee6731b0b for 'teacher'.
The prod /groups returned 0 results.

Since we can't connect to the prod DB directly (password unknown),
we'll use the production API to understand the state,
then push a backend migration endpoint or fix via known-good DB.

Let's check: does the /groups endpoint have any issue with the teacher's User role or approval_status?
Also test /dashboard/teacher endpoint.
Also check if Render might be using a different DB by checking /api/v1/health or similar.
"""
import requests

BASE = "https://englishlifesupport-4ojx.onrender.com/api/v1"

print("=" * 70)
print("1) Login")
resp = requests.post(f"{BASE}/auth/login", json={"username": "teacher", "password": "ChangeMe123!"}, timeout=30)
data = resp.json()
token = data.get("access_token") or data.get("token")
headers = {"Authorization": f"Bearer {token}"}
me_id = None

print("2) /auth/me full response")
resp = requests.get(f"{BASE}/auth/me", headers=headers, timeout=30)
me = resp.json()
me_id = me.get("id")
print(f"  {me}")

print()
print("3) /groups with include_archived=true")
resp = requests.get(f"{BASE}/groups?include_archived=true", headers=headers, timeout=30)
print(f"  status={resp.status_code}  count={len(resp.json()) if resp.status_code==200 else 'N/A'}")
print(f"  body={resp.text[:500]}")

print()
print("4) /groups/public (no auth)")
resp = requests.get(f"{BASE}/auth/groups/public", timeout=30)
print(f"  status={resp.status_code}  count={len(resp.json()) if resp.status_code==200 else 'N/A'}")
if resp.status_code == 200:
    for g in resp.json():
        print(f"    {g.get('name')!r} id={g.get('id')} teacher_id={g.get('teacher_id')}")

print()
print("5) /students?page=1&per_page=5")
resp = requests.get(f"{BASE}/students?page=1&per_page=5", headers=headers, timeout=30)
print(f"  status={resp.status_code}")
if resp.status_code == 200:
    body = resp.json()
    if isinstance(body, list):
        print(f"  list count={len(body)}")
    elif isinstance(body, dict):
        print(f"  total={body.get('total')} items={len(body.get('items',[]))}")
else:
    print(f"  error={resp.text[:300]}")

print()
print("6) Try /teachers/me")
resp = requests.get(f"{BASE}/teachers/me", headers=headers, timeout=30)
print(f"  status={resp.status_code}  body={resp.text[:300]}")

print()
print("7) Try /dashboard/stats or /dashboard")
for path in ["/dashboard", "/dashboard/stats", "/teacher/dashboard", "/teachers/dashboard"]:
    resp = requests.get(f"{BASE}{path}", headers=headers, timeout=15)
    print(f"  {path} -> {resp.status_code}: {resp.text[:200]}")

print("=" * 70)
