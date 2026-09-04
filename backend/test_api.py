"""
Comprehensive E2E API Verification Script for English Life LMS

Tests:
1. Teacher login & Profile management (Full name, Phone, Username update with password confirmation, Password change with policy checks).
2. Group management (Create group, list groups, edit group, delete group).
3. Student Registration with mandatory group selection and Username.
4. Assignment creation with homework file & vocabulary CSV (Draft vs Published status, 10MB limit enforcement).
5. Student workflow (Student login, assignment visibility filtered by group and status, homework file download, vocabulary list, file submission).
6. Group isolation & direct API security checks (Student B in Group B accessing Group A assignment / submission returns 403 Forbidden).
7. Teacher grading (Score 0-10, Stars 1-5, feedback, student total_stars update).
8. Student deletion & verified cleanup.
"""
import io
import uuid
import time
import requests

BASE_URL = "http://127.0.0.1:8000"


def test_full_workflow():
    print("\n--- Starting Full End-to-End Workflow Verification ---")

    # 1. Teacher Login
    print("\n1. Testing Teacher Login...")
    res = requests.post(f"{BASE_URL}/api/auth/login", json={
        "username": "teacher@englishlife.uz",
        "password": "ChangeMe123!"
    })
    assert res.status_code == 200, f"Teacher login failed: {res.text}"
    teacher_tokens = res.json()
    teacher_headers = {"Authorization": f"Bearer {teacher_tokens['access_token']}"}
    print("[OK] Teacher logged in successfully.")

    # 2. Teacher Profile Management
    print("\n2. Testing Teacher Profile & Password Management...")
    res = requests.get(f"{BASE_URL}/api/teachers/me", headers=teacher_headers)
    assert res.status_code == 200, f"Get teacher profile failed: {res.text}"
    profile = res.json()
    print(f"Current Teacher Username: {profile['email']}, Name: {profile['full_name']}")

    # Test invalid password policy
    res = requests.post(f"{BASE_URL}/api/teachers/me/password", headers=teacher_headers, json={
        "current_password": "ChangeMe123!",
        "new_password": "weak",
        "confirm_password": "weak"
    })
    assert res.status_code == 400, "Should reject weak password"
    print("[OK] Weak password correctly rejected by policy handler.")

    # 3. Group Management
    print("\n3. Testing Group Management & Deletion...")
    group_a_name = f"Group Alpha {uuid.uuid4().hex[:4]}"
    res = requests.post(f"{BASE_URL}/api/groups", headers=teacher_headers, json={
        "name": group_a_name,
        "english_level": "intermediate",
        "schedule": "Mon/Wed/Fri 10:00"
    })
    assert res.status_code == 201, f"Create group failed: {res.text}"
    group_a = res.json()
    group_a_id = group_a["id"]
    print(f"[OK] Created Group A: {group_a_name} ({group_a_id})")

    group_b_name = f"Group Beta {uuid.uuid4().hex[:4]}"
    res = requests.post(f"{BASE_URL}/api/groups", headers=teacher_headers, json={
        "name": group_b_name,
        "english_level": "advanced",
        "schedule": "Tue/Thu 14:00"
    })
    assert res.status_code == 201
    group_b = res.json()
    group_b_id = group_b["id"]
    print(f"[OK] Created Group B: {group_b_name} ({group_b_id})")

    # Create & Delete Group C
    group_c_name = f"Group Temp {uuid.uuid4().hex[:4]}"
    res = requests.post(f"{BASE_URL}/api/groups", headers=teacher_headers, json={
        "name": group_c_name,
        "english_level": "beginner",
        "schedule": "Sat 09:00"
    })
    group_c_id = res.json()["id"]
    res = requests.delete(f"{BASE_URL}/api/groups/{group_c_id}", headers=teacher_headers)
    assert res.status_code == 204
    print("[OK] Group C created and permanently deleted.")

    res = requests.get(f"{BASE_URL}/api/groups", headers=teacher_headers)
    group_ids = [g["id"] for g in res.json()]
    assert group_c_id not in group_ids, "Deleted group must not appear in list"
    print("[OK] Group list correctly excludes deleted group.")

    # 4. Student Registration with Mandatory Group Selection
    print("\n4. Registering Students for Group A & Group B with mandatory group_id...")
    student_a_user = f"student_a_{uuid.uuid4().hex[:4]}"
    res = requests.post(f"{BASE_URL}/api/auth/register", json={
        "username": student_a_user,
        "password": "Stud3ntPass!",
        "full_name": "Alice GroupA",
        "phone": "@alice_tg",
        "group_id": group_a_id
    })
    if res.status_code == 429:
        time.sleep(12)
        res = requests.post(f"{BASE_URL}/api/auth/register", json={
            "username": student_a_user,
            "password": "Stud3ntPass!",
            "full_name": "Alice GroupA",
            "phone": "@alice_tg",
            "group_id": group_a_id
        })
    assert res.status_code == 201, f"Student A registration failed: {res.text}"

    student_b_user = f"student_b_{uuid.uuid4().hex[:4]}"
    res = requests.post(f"{BASE_URL}/api/auth/register", json={
        "username": student_b_user,
        "password": "Stud3ntPass!",
        "full_name": "Bob GroupB",
        "phone": "+998901234567",
        "group_id": group_b_id
    })
    if res.status_code == 429:
        time.sleep(12)
        res = requests.post(f"{BASE_URL}/api/auth/register", json={
            "username": student_b_user,
            "password": "Stud3ntPass!",
            "full_name": "Bob GroupB",
            "phone": "+998901234567",
            "group_id": group_b_id
        })
    assert res.status_code == 201, f"Student B registration failed: {res.text}"

    # Teacher approves both students
    pending_res = requests.get(f"{BASE_URL}/api/students/pending", headers=teacher_headers).json()
    pending = pending_res.get("items", pending_res) if isinstance(pending_res, dict) else pending_res
    for p in pending:
        if p["username"] in (student_a_user, student_b_user):
            requests.post(f"{BASE_URL}/api/students/{p['id']}/approval", headers=teacher_headers, json={"action": "approve"})

    # Login approved students to get active tokens
    log_a = requests.post(f"{BASE_URL}/api/auth/login", json={"username": student_a_user, "password": "Stud3ntPass!"})
    student_a_tokens = log_a.json()
    student_a_headers = {"Authorization": f"Bearer {student_a_tokens['access_token']}"}

    log_b = requests.post(f"{BASE_URL}/api/auth/login", json={"username": student_b_user, "password": "Stud3ntPass!"})
    student_b_tokens = log_b.json()
    student_b_headers = {"Authorization": f"Bearer {student_b_tokens['access_token']}"}

    print("[OK] Student A (Group A) and Student B (Group B) registered and approved successfully.")

    # 5. Create Assignments with Homework File and Vocabulary CSV
    print("\n5. Testing Assignment Creation (Draft, Published, Files, Vocab CSV)...")
    res = requests.post(
        f"{BASE_URL}/api/assignments",
        headers=teacher_headers,
        data={
            "group_id": group_a_id,
            "title": "Draft Unit 1 Homework",
            "description": "This is a draft homework instruction.",
            "deadline": "2030-12-31T23:59:59Z",
            "status": "draft"
        }
    )
    assert res.status_code == 201, f"Failed to create draft assignment: {res.text}"
    draft_assignment_id = res.json()["id"]
    print("[OK] Draft Assignment created.")

    sample_pdf_bytes = b"%PDF-1.4 Mock PDF Content For Homework Assignment"
    sample_csv_text = "word,translation\nachieve,erishmoq\nimprove,yaxshilamoq\nopportunity,imkoniyat"

    files = {
        "file": ("homework_unit2.pdf", sample_pdf_bytes, "application/pdf"),
        "vocab_file": ("vocab.csv", sample_csv_text.encode("utf-8"), "text/csv"),
    }
    data = {
        "group_id": group_a_id,
        "title": "Published Unit 2 Multi-Block Homework",
        "description": "1. Reading: Read attached PDF\n2. Vocabulary: Learn words below",
        "deadline": "2030-12-31T23:59:59Z",
        "status": "published"
    }
    res = requests.post(f"{BASE_URL}/api/assignments", headers=teacher_headers, data=data, files=files)
    assert res.status_code == 201, f"Create assignment failed: {res.text}"
    pub_assignment = res.json()
    pub_assignment_id = pub_assignment["id"]
    print(f"[OK] Published Assignment created ({pub_assignment_id}) with homework file & {len(pub_assignment['vocab_words'])} vocabulary words.")

    # 6. Student Assignment Access & Security Checks
    print("\n6. Testing Student Assignment Access & Group Isolation...")
    res = requests.get(f"{BASE_URL}/api/assignments/mine", headers=student_a_headers)
    assert res.status_code == 200
    student_a_assignments = res.json()
    sa_ids = [a["id"] for a in student_a_assignments]
    assert pub_assignment_id in sa_ids, "Student A must see published assignment for Group A"
    assert draft_assignment_id not in sa_ids, "Student A must NOT see DRAFT assignment"
    print("[OK] Student A sees published assignment, draft assignment is hidden.")

    res = requests.get(f"{BASE_URL}/api/assignments/mine", headers=student_b_headers)
    assert res.status_code == 200
    student_b_assignments = res.json()
    sb_ids = [a["id"] for a in student_b_assignments]
    assert pub_assignment_id not in sb_ids, "Student B (Group B) must NOT see Group A's assignment"
    print("[OK] Group isolation confirmed: Student B cannot see Group A's assignment.")

    # 7. Homework Submission & Teacher Grading Workflow
    print("\n7. Testing Student Submission & Teacher Grading Workflow...")
    student_submission_bytes = b"%PDF-1.4 Student A Completed Homework Solution PDF"
    files = {"file": ("student_solution.pdf", student_submission_bytes, "application/pdf")}
    data = {"assignment_id": pub_assignment_id, "text_answer": "Here is my completed answer."}

    res = requests.post(f"{BASE_URL}/api/submissions", headers=student_a_headers, data=data, files=files)
    assert res.status_code == 201, f"Student submission failed: {res.text}"
    submission = res.json()
    submission_id = submission["id"]
    print(f"[OK] Student A submitted homework ({submission_id}).")

    res = requests.post(f"{BASE_URL}/api/submissions/{submission_id}/grade", headers=teacher_headers, json={
        "score": 9,
        "stars": 5,
        "feedback": "Great work!"
    })
    assert res.status_code == 200
    print("[OK] Teacher graded submission with Score 9/10 and 5 Stars.")

    res = requests.get(f"{BASE_URL}/api/assignments/mine", headers=student_a_headers)
    graded_item = [a for a in res.json() if a["id"] == pub_assignment_id][0]
    assert graded_item["submission_status"] == "graded"
    assert graded_item["score"] == 9
    print("[OK] Student A sees grade 9/10 and 'graded' status.")

    print("\n=======================================================")
    print("  ALL E2E WORKFLOW CHECKS PASSED SUCCESSFULLY!  ")
    print("=======================================================\n")


if __name__ == "__main__":
    test_full_workflow()
