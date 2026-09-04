import uuid
import time
import requests

BASE_URL = "http://127.0.0.1:8000"

def test_full_upgrade_requirements():
    # 1. Teacher login (existing teacher)
    res = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"username": "teacher@englishlife.uz", "password": "ChangeMe123!"},
    )
    assert res.status_code == 200, f"Teacher login failed: {res.text}"
    teacher_token = res.json()["access_token"]
    teacher_headers = {"Authorization": f"Bearer {teacher_token}"}

    # 2. Create two groups with distinct English levels
    beg_group_res = requests.post(
        f"{BASE_URL}/api/groups",
        headers=teacher_headers,
        json={"name": f"Beginner Group {uuid.uuid4().hex[:4]}", "english_level": "beginner", "schedule": "Mon/Wed"},
    )
    assert beg_group_res.status_code == 201
    beg_group = beg_group_res.json()
    beg_group_id = beg_group["id"]

    ui_group_res = requests.post(
        f"{BASE_URL}/api/groups",
        headers=teacher_headers,
        json={"name": f"Upper-Intermediate Group {uuid.uuid4().hex[:4]}", "english_level": "upper_intermediate", "schedule": "Tue/Thu"},
    )
    assert ui_group_res.status_code == 201
    ui_group = ui_group_res.json()
    ui_group_id = ui_group["id"]

    # 3. Student registers for Beginner group (pending)
    stud_beg_username = f"stud_{uuid.uuid4().hex[:6]}"
    reg_beg = requests.post(
        f"{BASE_URL}/api/auth/register",
        json={
            "username": stud_beg_username,
            "password": "StudPass!123",
            "first_name": "Ali",
            "last_name": "Valiyev",
            "telegram_username": "@ali_valiyev",
            "group_id": beg_group_id,
        },
    )
    assert reg_beg.status_code == 201
    assert reg_beg.json()["status"] == "pending"

    # 4. Pending student cannot log in
    login_attempt = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"username": stud_beg_username, "password": "StudPass!123"},
    )
    assert login_attempt.status_code == 403

    # 5. Register student for Upper-Intermediate group (pending)
    stud_ui_username = f"stud_{uuid.uuid4().hex[:6]}"
    reg_ui = requests.post(
        f"{BASE_URL}/api/auth/register",
        json={
            "username": stud_ui_username,
            "password": "StudPass!123",
            "first_name": "Hasan",
            "last_name": "Husanov",
            "telegram_username": "@hasan_h",
            "group_id": ui_group_id,
        },
    )
    assert reg_ui.status_code == 201
    assert reg_ui.json()["status"] == "pending"

    # 6. Duplicate username (case-insensitive) should be rejected
    dup_res = requests.post(
        f"{BASE_URL}/api/auth/register",
        json={
            "username": stud_beg_username.upper(),
            "password": "StudPass!123",
            "first_name": "Dup",
            "last_name": "User",
            "telegram_username": "@dup_user",
            "group_id": beg_group_id,
        },
    )
    assert dup_res.status_code == 409

    # 7. Teacher fetch pending approvals and approve both students
    pending_res = requests.get(f"{BASE_URL}/api/students/pending", headers=teacher_headers).json()
    pending = pending_res.get("items", pending_res) if isinstance(pending_res, dict) else pending_res
    assert any(p["username"] == stud_beg_username for p in pending)
    assert any(p["username"] == stud_ui_username for p in pending)
    beg_pending = next(p for p in pending if p["username"] == stud_beg_username)
    appr_beg = requests.post(
        f"{BASE_URL}/api/students/{beg_pending['id']}/approval",
        headers=teacher_headers,
        json={"action": "approve"},
    )
    assert appr_beg.status_code == 200
    ui_pending = next(p for p in pending if p["username"] == stud_ui_username)
    appr_ui = requests.post(
        f"{BASE_URL}/api/students/{ui_pending['id']}/approval",
        headers=teacher_headers,
        json={"action": "approve"},
    )
    assert appr_ui.status_code == 200

    # 8. Approved student can log in and profile level matches group
    login_beg = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"username": stud_beg_username, "password": "StudPass!123"},
    )
    assert login_beg.status_code == 200
    beg_token = login_beg.json()["access_token"]
    beg_headers = {"Authorization": f"Bearer {beg_token}"}
    prof = requests.get(f"{BASE_URL}/api/profile/me", headers=beg_headers).json()
    assert prof["english_level"] == "beginner"
    assert prof["approval_status"] == "approved"

    # 10. Group detail returns only its students
    beg_detail = requests.get(f"{BASE_URL}/api/groups/{beg_group_id}/detail", headers=teacher_headers).json()
    assert any(s["username"] == stud_beg_username for s in beg_detail["students"])
    assert not any(s["username"] == stud_ui_username for s in beg_detail["students"])

    # 11. New assignment starts at 0% for all students in group
    asg_res = requests.post(
        f"{BASE_URL}/api/assignments",
        headers=teacher_headers,
        data={
            "group_id": beg_group_id,
            "title": "Reading Assignment 1",
            "description": "Read chapter 1",
            "deadline": "2027-12-31T23:59:59Z",
            "status": "published",
        },
    )
    assert asg_res.status_code == 201
    asg_id = asg_res.json()["id"]
    detail_after = requests.get(f"{BASE_URL}/api/groups/{beg_group_id}/detail", headers=teacher_headers).json()
    student_entry = next(s for s in detail_after["students"] if s["username"] == stud_beg_username)
    asg_entry = next(a for a in student_entry["assignments"] if a["assignment_id"] == asg_id)
    assert asg_entry["completion_percentage"] == 0
    assert asg_entry["has_submission"] is False

    # 12. Student completes assignment (100%) -> exactly 1 lightning awarded, idempotent
    init_lightning = student_entry.get("total_lightning", 0)
    sub_res = requests.post(
        f"{BASE_URL}/api/submissions",
        headers=beg_headers,
        data={"assignment_id": asg_id, "text_answer": "My answers"},
    )
    assert sub_res.status_code in (200, 201)
    prof_after = requests.get(f"{BASE_URL}/api/profile/me", headers=beg_headers).json()
    assert prof_after["total_lightning"] == init_lightning + 1
    sub_res2 = requests.post(
        f"{BASE_URL}/api/submissions",
        headers=beg_headers,
        data={"assignment_id": asg_id, "text_answer": "Updated answer"},
    )
    assert sub_res2.status_code in (200, 201)
    prof_after2 = requests.get(f"{BASE_URL}/api/profile/me", headers=beg_headers).json()
    assert prof_after2["total_lightning"] == init_lightning + 1

    # 13. New assignment does not affect history of previous assignment
    asg2_res = requests.post(
        f"{BASE_URL}/api/assignments",
        headers=teacher_headers,
        data={
            "group_id": beg_group_id,
            "title": "Listening Assignment 2",
            "description": "Listen to audio",
            "deadline": "2027-12-31T23:59:59Z",
            "status": "published",
        },
    )
    assert asg2_res.status_code == 201
    asg2_id = asg2_res.json()["id"]
    hist_res = requests.get(f"{BASE_URL}/api/students/{student_entry['id']}/history", headers=teacher_headers).json()
    assert any(h["assignment_id"] == asg_id for h in hist_res["history"])
    assert any(h["assignment_id"] == asg2_id for h in hist_res["history"])

    # 14. Student isolation: cannot view other group's assignments
    login_ui = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"username": stud_ui_username, "password": "StudPass!123"},
    )
    assert login_ui.status_code == 200
    ui_token = login_ui.json()["access_token"]
    ui_headers = {"Authorization": f"Bearer {ui_token}"}
    ui_asgs = requests.get(f"{BASE_URL}/api/assignments/mine", headers=ui_headers).json()
    assert all(a["group_id"] == ui_group_id for a in ui_asgs)

    # 15. Group leaderboard contains only its students
    lb_res = requests.get(f"{BASE_URL}/api/gamification/leaderboard?group_id={beg_group_id}", headers=teacher_headers).json()
    assert any(e["student_id"] == student_entry["id"] for e in lb_res["entries"])
    ui_student = next((s for s in detail_after["students"] if s["username"] == stud_ui_username), None)
    if ui_student:
        assert not any(e["student_id"] == ui_student["id"] for e in lb_res["entries"])
