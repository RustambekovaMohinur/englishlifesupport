import io
import uuid
import pytest
import requests

BASE_URL = "http://127.0.0.1:8000"


def _create_teacher_and_login(email_prefix: str):
    # Teacher login helper
    res = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"username": "teacher@englishlife.uz", "password": "ChangeMe123!"},
    )
    assert res.status_code == 200
    token = res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_approval_workflow_full_suite():
    # 1. Login Teacher A
    t1_headers = _create_teacher_and_login("t1")

    # Create Group 1 owned by Teacher A
    g1_name = f"Group Approval 1 {uuid.uuid4().hex[:6]}"
    g1_res = requests.post(
        f"{BASE_URL}/api/groups",
        headers=t1_headers,
        json={"name": g1_name, "english_level": "intermediate", "schedule": "Mon 10:00"},
    )
    assert g1_res.status_code == 201
    g1_id = g1_res.json()["id"]

    # Register 3 students for Group 1
    students_g1 = []
    for i in range(3):
        u_name = f"u_g1_{i}_{uuid.uuid4().hex[:6]}"
        reg_res = requests.post(
            f"{BASE_URL}/api/auth/register",
            json={
                "username": u_name,
                "password": "Password123!",
                "first_name": f"First{i}",
                "last_name": f"Last{i}",
                "telegram_username": f"@user_g1_{i}",
                "group_id": g1_id,
            },
        )
        assert reg_res.status_code == 201
        students_g1.append(u_name)

    # --- 1. PAGINATION TESTS ---
    # Default page/page_size
    p_def = requests.get(f"{BASE_URL}/api/students/pending", headers=t1_headers)
    assert p_def.status_code == 200
    p_def_data = p_def.json()
    assert "items" in p_def_data
    assert p_def_data["page"] == 1
    assert p_def_data["page_size"] == 20
    assert p_def_data["total"] >= 3
    assert p_def_data["total_pages"] >= 1

    # Specific page and page_size
    p_p1 = requests.get(f"{BASE_URL}/api/students/pending?page=1&page_size=2", headers=t1_headers)
    assert p_p1.status_code == 200
    p1_data = p_p1.json()
    assert len(p1_data["items"]) == 2
    assert p1_data["page"] == 1
    assert p1_data["page_size"] == 2
    assert p1_data["total_pages"] == (p1_data["total"] + 1) // 2

    # Page 2
    p_p2 = requests.get(f"{BASE_URL}/api/students/pending?page=2&page_size=2", headers=t1_headers)
    assert p_p2.status_code == 200
    p2_data = p_p2.json()
    assert p2_data["page"] == 2

    # Page size = 50 and 100
    p_50 = requests.get(f"{BASE_URL}/api/students/pending?page=1&page_size=50", headers=t1_headers)
    assert p_50.status_code == 200
    assert p_50.json()["page_size"] == 50

    p_100 = requests.get(f"{BASE_URL}/api/students/pending?page=1&page_size=100", headers=t1_headers)
    assert p_100.status_code == 200
    assert p_100.json()["page_size"] == 100

    # Validation errors (HTTP 422)
    assert requests.get(f"{BASE_URL}/api/students/pending?page=0", headers=t1_headers).status_code == 422
    assert requests.get(f"{BASE_URL}/api/students/pending?page=-1", headers=t1_headers).status_code == 422
    assert requests.get(f"{BASE_URL}/api/students/pending?page_size=0", headers=t1_headers).status_code == 422
    assert requests.get(f"{BASE_URL}/api/students/pending?page_size=101", headers=t1_headers).status_code == 422
    assert requests.get(f"{BASE_URL}/api/students/pending?page=abc", headers=t1_headers).status_code == 422
    assert requests.get(f"{BASE_URL}/api/students/pending?page_size=xyz", headers=t1_headers).status_code == 422

    # Page beyond final page
    p_beyond = requests.get(f"{BASE_URL}/api/students/pending?page=9999&page_size=20", headers=t1_headers)
    assert p_beyond.status_code == 200
    assert p_beyond.json()["items"] == []
    assert p_beyond.json()["page"] == 9999

    # --- 2. AUTHENTICATION & ROLE CHECKS ---
    # Unauthenticated request -> 401
    no_auth = requests.get(f"{BASE_URL}/api/students/pending")
    assert no_auth.status_code == 401
    assert no_auth.json()["error"]["code"] == "AUTHENTICATION_REQUIRED"

    # Pending student attempting teacher route -> 403
    # First student login attempt -> 403 ACCOUNT_PENDING_APPROVAL
    s_login = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"username": students_g1[0], "password": "Password123!"},
    )
    assert s_login.status_code == 403
    assert s_login.json()["error"]["code"] == "ACCOUNT_PENDING_APPROVAL"

    # --- 3. APPROVAL FLOW (PENDING -> APPROVED) ---
    pending_list = requests.get(f"{BASE_URL}/api/students/pending?page=1&page_size=100", headers=t1_headers).json()["items"]
    target_student_1 = next(s for s in pending_list if s["username"] == students_g1[0])
    target_student_2 = next(s for s in pending_list if s["username"] == students_g1[1])
    target_student_3 = next(s for s in pending_list if s["username"] == students_g1[2])

    # Approve target 1 (POST bodyless)
    appr_res = requests.post(f"{BASE_URL}/api/students/{target_student_1['id']}/approve", headers=t1_headers)
    assert appr_res.status_code == 200
    appr_data = appr_res.json()
    assert appr_data["success"] is True
    assert appr_data["student"]["approval_status"] == "APPROVED"
    assert appr_data["student"]["is_active"] is True

    # Duplicate approve -> 409 ALREADY_APPROVED
    dup_appr = requests.post(f"{BASE_URL}/api/students/{target_student_1['id']}/approve", headers=t1_headers)
    assert dup_appr.status_code == 409
    assert dup_appr.json()["error"]["code"] == "ALREADY_APPROVED"

    # Invalid state transition: APPROVED -> REJECTED -> 409
    inv_rej = requests.post(f"{BASE_URL}/api/students/{target_student_1['id']}/reject", headers=t1_headers)
    assert inv_rej.status_code == 409
    assert inv_rej.json()["error"]["code"] == "ALREADY_APPROVED"

    # Approved student can now log in
    s1_login = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"username": students_g1[0], "password": "Password123!"},
    )
    assert s1_login.status_code == 200
    s1_token = s1_login.json()["access_token"]
    s1_headers = {"Authorization": f"Bearer {s1_token}"}

    # Student trying teacher route -> 403 TEACHER_REQUIRED
    student_to_teacher = requests.get(f"{BASE_URL}/api/students/pending", headers=s1_headers)
    assert student_to_teacher.status_code == 403
    assert student_to_teacher.json()["error"]["code"] == "TEACHER_REQUIRED"

    # --- 4. REJECTION FLOW (PENDING -> REJECTED) ---
    rej_res = requests.post(f"{BASE_URL}/api/students/{target_student_2['id']}/reject", headers=t1_headers)
    assert rej_res.status_code == 200
    rej_data = rej_res.json()
    assert rej_data["success"] is True
    assert rej_data["student"]["approval_status"] == "REJECTED"
    assert rej_data["student"]["is_active"] is False

    # Duplicate reject -> 409 ALREADY_REJECTED
    dup_rej = requests.post(f"{BASE_URL}/api/students/{target_student_2['id']}/reject", headers=t1_headers)
    assert dup_rej.status_code == 409
    assert dup_rej.json()["error"]["code"] == "ALREADY_REJECTED"

    # Invalid state transition: REJECTED -> APPROVED -> 409
    inv_appr = requests.post(f"{BASE_URL}/api/students/{target_student_2['id']}/approve", headers=t1_headers)
    assert inv_appr.status_code == 409
    assert inv_appr.json()["error"]["code"] == "ALREADY_REJECTED"

    # Rejected student login -> 403 ACCOUNT_REJECTED
    s2_login = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"username": students_g1[1], "password": "Password123!"},
    )
    assert s2_login.status_code == 403
    assert s2_login.json()["error"]["code"] == "ACCOUNT_REJECTED"

    # --- 5. STUDENT ID VALIDATION & ERROR CODES ---
    # Malformed UUID -> 422
    assert requests.post(f"{BASE_URL}/api/students/not-a-uuid/approve", headers=t1_headers).status_code == 422
    assert requests.post(f"{BASE_URL}/api/students/not-a-uuid/reject", headers=t1_headers).status_code == 422

    # Nonexistent UUID -> 404 STUDENT_NOT_FOUND
    rand_uuid = str(uuid.uuid4())
    nf_appr = requests.post(f"{BASE_URL}/api/students/{rand_uuid}/approve", headers=t1_headers)
    assert nf_appr.status_code == 404
    assert nf_appr.json()["error"]["code"] == "STUDENT_NOT_FOUND"

    nf_rej = requests.post(f"{BASE_URL}/api/students/{rand_uuid}/reject", headers=t1_headers)
    assert nf_rej.status_code == 404
    assert nf_rej.json()["error"]["code"] == "STUDENT_NOT_FOUND"

    # --- 6. AUDIO UPLOAD SIZE LIMIT ---
    # Create assignment in group 1
    asg = requests.post(
        f"{BASE_URL}/api/assignments",
        headers=t1_headers,
        data={
            "group_id": g1_id,
            "title": f"Speaking Audio Task {uuid.uuid4().hex[:4]}",
            "description": "Upload speaking answer",
            "deadline": "2027-12-31T23:59:59Z",
            "status": "published",
        },
    ).json()

    # Submit audio file < 20MB -> 201
    small_audio = b"\x00" * 1024  # 1 KB
    files_ok = {"file": ("recording.mp3", io.BytesIO(small_audio), "audio/mpeg")}
    sub_ok = requests.post(
        f"{BASE_URL}/api/submissions",
        headers=s1_headers,
        data={"assignment_id": asg["id"], "text_answer": "My audio recording"},
        files=files_ok,
    )
    assert sub_ok.status_code == 201

    # Check leaderboard: approved student is included, pending/rejected students are NOT
    lb_res = requests.get(f"{BASE_URL}/api/gamification/leaderboard?group_id={g1_id}", headers=t1_headers).json()
    student_ids_in_lb = [e["student_id"] for e in lb_res["entries"]]
    assert target_student_1["id"] in student_ids_in_lb
    assert target_student_2["id"] not in student_ids_in_lb
    assert target_student_3["id"] not in student_ids_in_lb
