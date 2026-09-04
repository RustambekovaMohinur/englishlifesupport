import uuid
import pytest
import requests

BASE_URL = "http://127.0.0.1:8000"


def _teacher_login():
    res = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"username": "teacher@englishlife.uz", "password": "ChangeMe123!"},
    )
    assert res.status_code == 200
    token = res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_corrections_comments_and_custom_stars():
    teacher_headers = _teacher_login()

    # 1. Create a test group
    g_res = requests.post(
        f"{BASE_URL}/api/groups",
        headers=teacher_headers,
        json={"name": f"Review Group {uuid.uuid4().hex[:6]}", "english_level": "intermediate"},
    )
    assert g_res.status_code == 201
    group_id = g_res.json()["id"]

    # 2. Register a student & approve
    s_username = f"stud_rev_{uuid.uuid4().hex[:6]}"
    reg_res = requests.post(
        f"{BASE_URL}/api/auth/register",
        json={
            "username": s_username,
            "password": "Password123!",
            "first_name": "Review",
            "last_name": "Student",
            "group_id": group_id,
        },
    )
    assert reg_res.status_code == 201

    # Get student id from pending and approve
    pending = requests.get(f"{BASE_URL}/api/students/pending?page=1&page_size=100", headers=teacher_headers).json()["items"]
    student_record = next(s for s in pending if s["username"] == s_username)
    appr = requests.post(f"{BASE_URL}/api/students/{student_record['id']}/approve", headers=teacher_headers)
    assert appr.status_code == 200

    # Student login
    s_login = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"username": s_username, "password": "Password123!"},
    )
    assert s_login.status_code == 200
    student_headers = {"Authorization": f"Bearer {s_login.json()['access_token']}"}

    # 3. Create assignment
    asg_res = requests.post(
        f"{BASE_URL}/api/assignments",
        headers=teacher_headers,
        data={
            "title": "Essay on Travel",
            "description": "Write about your favorite city",
            "deadline": "2030-12-31T23:59:59Z",
            "group_id": group_id,
            "status": "published",
        },
    )
    assert asg_res.status_code == 201
    asg_id = asg_res.json()["id"]

    # 4. Student submits homework
    original_text = "I goes to Paris last summer and it is wonderfull."
    sub_res = requests.post(
        f"{BASE_URL}/api/submissions",
        headers=student_headers,
        data={"assignment_id": asg_id, "text_answer": original_text},
    )
    assert sub_res.status_code == 201
    sub_data = sub_res.json()
    sub_id = sub_data["id"]
    assert sub_data["text_answer"] == original_text
    assert sub_data["corrections"] == []
    assert sub_data["comments"] == []

    # 5. Teacher adds an error correction on "I goes" -> "I went" (grammar)
    corr1_res = requests.post(
        f"{BASE_URL}/api/submissions/{sub_id}/corrections",
        headers=teacher_headers,
        json={
            "selected_text": "I goes",
            "correction": "I went",
            "comment": "Use past simple for completed past events.",
            "error_type": "grammar",
        },
    )
    assert corr1_res.status_code == 200
    corr1 = corr1_res.json()
    assert corr1["selected_text"] == "I goes"
    assert corr1["correction"] == "I went"
    assert corr1["error_type"] == "grammar"

    # Teacher adds second error correction: "wonderfull" -> "wonderful" (spelling)
    corr2_res = requests.post(
        f"{BASE_URL}/api/submissions/{sub_id}/corrections",
        headers=teacher_headers,
        json={
            "selected_text": "wonderfull",
            "correction": "wonderful",
            "comment": "Double 'l' is unnecessary here.",
            "error_type": "spelling",
        },
    )
    assert corr2_res.status_code == 200

    # 6. Teacher adds a submission comment
    comm_res = requests.post(
        f"{BASE_URL}/api/submissions/{sub_id}/comments",
        headers=teacher_headers,
        json={"comment": "Good effort! Watch your past tense forms."},
    )
    assert comm_res.status_code == 200
    comm = comm_res.json()
    assert comm["comment"] == "Good effort! Watch your past tense forms."

    # 7. Teacher grades with custom stars (e.g. 8 stars and score 9)
    grade_res = requests.post(
        f"{BASE_URL}/api/submissions/{sub_id}/grade",
        headers=teacher_headers,
        json={"score": 9, "stars": 8, "feedback": "Impressive vocabulary overall."},
    )
    assert grade_res.status_code == 200
    grade = grade_res.json()
    assert grade["score"] == 9
    assert grade["stars"] == 8

    # 8. Fetch submission as student -> original text preserved, corrections & comments attached
    student_view = requests.get(f"{BASE_URL}/api/submissions/{sub_id}", headers=student_headers)
    assert student_view.status_code == 200
    sv_data = student_view.json()
    assert sv_data["text_answer"] == original_text
    assert len(sv_data["corrections"]) == 2
    assert len(sv_data["comments"]) == 1
    assert sv_data["grade"]["score"] == 9
    assert sv_data["grade"]["stars"] == 8

    # 9. Delete a correction
    del_corr = requests.delete(
        f"{BASE_URL}/api/submissions/{sub_id}/corrections/{corr1['id']}",
        headers=teacher_headers,
    )
    assert del_corr.status_code == 204

    # Verify student now sees 1 correction
    student_view2 = requests.get(f"{BASE_URL}/api/submissions/{sub_id}", headers=student_headers)
    assert len(student_view2.json()["corrections"]) == 1
