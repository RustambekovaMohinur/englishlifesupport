import io
import uuid
import pytest
import requests

BASE_URL = "http://127.0.0.1:8000"


def test_registration_and_profiles():
    # 1. Teacher Login
    res = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"username": "teacher@englishlife.uz", "password": "ChangeMe123!"},
    )
    assert res.status_code == 200, f"Teacher login failed: {res.text}"
    teacher_token = res.json()["access_token"]
    teacher_headers = {"Authorization": f"Bearer {teacher_token}"}

    # 2. Get Teacher Unified Profile
    t_prof_res = requests.get(f"{BASE_URL}/api/profile/me", headers=teacher_headers)
    assert t_prof_res.status_code == 200
    t_prof = t_prof_res.json()
    assert t_prof["role"] == "teacher"
    assert "stats" in t_prof

    # 3. Update Teacher Profile (First name, Last name, Bio, Telegram)
    t_update_res = requests.patch(
        f"{BASE_URL}/api/profile/me",
        headers=teacher_headers,
        json={
            "first_name": "Asadbek",
            "last_name": "Khasanov",
            "bio": "Lead English Instructor and IELTS Specialist.",
            "telegram_username": "@asadbek_teacher",
        },
    )
    assert t_update_res.status_code == 200
    updated_t_prof = t_update_res.json()
    assert updated_t_prof["full_name"] == "Asadbek Khasanov"
    assert updated_t_prof["bio"] == "Lead English Instructor and IELTS Specialist."
    assert updated_t_prof["telegram_username"] == "@asadbek_teacher"

    # 4. Teacher Upload Photo
    fake_png = (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4"
        b"\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
    )
    files = {"file": ("avatar.png", io.BytesIO(fake_png), "image/png")}
    t_avatar_res = requests.post(f"{BASE_URL}/api/profile/me/avatar", headers=teacher_headers, files=files)
    assert t_avatar_res.status_code == 200
    t_avatar_data = t_avatar_res.json()
    assert t_avatar_data["avatar_url"] is not None

    # Fetch avatar image
    img_res = requests.get(f"{BASE_URL}{t_avatar_data['avatar_url']}")
    assert img_res.status_code == 200
    assert img_res.content == fake_png

    # 5. Create Group for Student
    g_res = requests.post(
        f"{BASE_URL}/api/groups",
        headers=teacher_headers,
        json={"name": f"Profile Test Group {uuid.uuid4().hex[:4]}", "english_level": "intermediate", "schedule": "Mon/Wed"},
    )
    assert g_res.status_code == 201
    group_id = g_res.json()["id"]

    # 6. Student Registration with new format
    st_username = f"std_{uuid.uuid4().hex[:6]}"
    import time
    time.sleep(5)
    st_reg_res = requests.post(
        f"{BASE_URL}/api/auth/register",
        json={
            "username": st_username,
            "password": "Stud3ntPass!",
            "first_name": "Bob",
            "last_name": "Smith",
            "telegram_username": "bob_telegram",
            "group_id": group_id,
        },
    )
    if st_reg_res.status_code == 429:
        import time
        time.sleep(12)
        st_reg_res = requests.post(
            f"{BASE_URL}/api/auth/register",
            json={
                "username": st_username,
                "password": "Stud3ntPass!",
                "first_name": "Bob",
                "last_name": "Smith",
                "telegram_username": "bob_telegram",
                "group_id": group_id,
            },
        )
    assert st_reg_res.status_code == 201, f"Student registration failed: {st_reg_res.text}"
    assert st_reg_res.json()["status"] == "pending"

    # Verify pending student cannot login yet
    pending_login = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"username": st_username, "password": "Stud3ntPass!"},
    )
    assert pending_login.status_code == 403

    # Teacher approves student
    pending_res = requests.get(f"{BASE_URL}/api/students/pending", headers=teacher_headers).json()
    pending_students = pending_res["items"] if isinstance(pending_res, dict) and "items" in pending_res else pending_res
    bob_pending = next(p for p in pending_students if p["username"] == st_username)
    appr_res = requests.post(
        f"{BASE_URL}/api/students/{bob_pending['id']}/approval",
        headers=teacher_headers,
        json={"action": "approve"},
    )
    assert appr_res.status_code == 200

    # 7. Student Duplicate Username Check (Case-insensitive)
    dup_res = requests.post(
        f"{BASE_URL}/api/auth/register",
        json={
            "username": st_username.upper(),
            "password": "Stud3ntPass!",
            "first_name": "Another",
            "last_name": "User",
            "telegram_username": "@another",
            "group_id": group_id,
        },
    )
    if dup_res.status_code == 429:
        import time
        time.sleep(12)
        dup_res = requests.post(
            f"{BASE_URL}/api/auth/register",
            json={
                "username": st_username.upper(),
                "password": "Stud3ntPass!",
                "first_name": "Another",
                "last_name": "User",
                "telegram_username": "@another",
                "group_id": group_id,
            },
        )
    assert dup_res.status_code == 409

    # 8. Student Login (now approved)
    login_res = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"username": st_username, "password": "Stud3ntPass!"},
    )
    assert login_res.status_code == 200
    st_token = login_res.json()["access_token"]
    st_headers = {"Authorization": f"Bearer {st_token}"}

    # 9. Student Profile
    s_prof_res = requests.get(f"{BASE_URL}/api/profile/me", headers=st_headers)
    assert s_prof_res.status_code == 200
    s_prof = s_prof_res.json()
    assert s_prof["username"] == st_username
    assert s_prof["full_name"] == "Bob Smith"
    assert s_prof["telegram_username"] == "@bob_telegram"
    assert s_prof["role"] == "student"

    # 10. Student update bio
    s_update_res = requests.patch(
        f"{BASE_URL}/api/profile/me",
        headers=st_headers,
        json={"bio": "Aiming for IELTS 7.5+", "first_name": "Robert"},
    )
    assert s_update_res.status_code == 200
    updated_s_prof = s_update_res.json()
    assert updated_s_prof["bio"] == "Aiming for IELTS 7.5+"
    assert updated_s_prof["full_name"] == "Robert Smith"

    # 11. Student upload photo
    s_files = {"file": ("student_avatar.png", io.BytesIO(fake_png), "image/png")}
    s_avatar_res = requests.post(f"{BASE_URL}/api/profile/me/avatar", headers=st_headers, files=s_files)
    assert s_avatar_res.status_code == 200
    assert s_avatar_res.json()["avatar_url"] is not None

    # 12. Student remove photo
    s_del_avatar = requests.delete(f"{BASE_URL}/api/profile/me/avatar", headers=st_headers)
    assert s_del_avatar.status_code == 200
    assert s_del_avatar.json()["avatar_url"] is None

    # 13. Security: Student cannot update protected fields via profile (e.g. role, group)
    hack_res = requests.patch(
        f"{BASE_URL}/api/profile/me",
        headers=st_headers,
        json={"role": "teacher", "group_id": str(uuid.uuid4())},
    )
    # The endpoint should ignore unknown fields or succeed without mutating role/group
    refreshed_s = requests.get(f"{BASE_URL}/api/profile/me", headers=st_headers).json()
    assert refreshed_s["role"] == "student"

    # 14. Teacher delete photo
    t_del_avatar = requests.delete(f"{BASE_URL}/api/profile/me/avatar", headers=teacher_headers)
    assert t_del_avatar.status_code == 200
    assert t_del_avatar.json()["avatar_url"] is None
