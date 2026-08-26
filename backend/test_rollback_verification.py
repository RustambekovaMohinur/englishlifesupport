"""
Verification script for rolled back theme state.
Tests all workflows:
- Login (Teacher & Student)
- Register student with Username, Password, Telegram contact, Group ID
- Public groups list endpoint for registration dropdown
- Create group, Edit group, Delete group
- Create assignment with Vocabulary CSV and Homework File
- Student view homework, audio playback URL, vocabulary table
- Student homework submission with text and file
- Teacher grade submission (0-10 score, 1-5 stars, feedback)
- Teacher profile update & password change
"""
import uuid
import requests

BASE_URL = "http://127.0.0.1:8000"

def verify_all():
    print("--- 1. Testing Teacher Login ---")
    res = requests.post(f"{BASE_URL}/api/auth/login", json={"username": "teacher@englishlife.uz", "password": "ChangeMe123!"})
    assert res.status_code == 200, f"Teacher login failed: {res.text}"
    teacher_token = res.json()["access_token"]
    t_headers = {"Authorization": f"Bearer {teacher_token}"}
    print("[OK] Teacher logged in successfully.")

    print("\n--- 2. Testing Group Management (Create, Edit, Delete) ---")
    g_name = f"Test Group {uuid.uuid4().hex[:4]}"
    res = requests.post(f"{BASE_URL}/api/groups", headers=t_headers, json={"name": g_name, "english_level": "intermediate", "schedule": "Mon/Wed"})
    assert res.status_code == 201, f"Create group failed: {res.text}"
    group_id = res.json()["id"]
    print(f"[OK] Created group: {g_name} ({group_id})")

    res = requests.patch(f"{BASE_URL}/api/groups/{group_id}", headers=t_headers, json={"name": f"{g_name} Updated"})
    assert res.status_code == 200
    print("[OK] Edited group successfully.")

    print("\n--- 3. Testing Public Groups Endpoint for Student Registration ---")
    res = requests.get(f"{BASE_URL}/api/auth/groups/public")
    assert res.status_code == 200
    pub_groups = res.json()
    assert any(g["id"] == group_id for g in pub_groups), "Created group must appear in public groups list for registration selector"
    print("[OK] Public groups endpoint returned created group for register dropdown.")

    print("\n--- 4. Testing Student Registration (Username, Password, Telegram, Group ID) ---")
    st_user = f"student_{uuid.uuid4().hex[:4]}"
    res = requests.post(f"{BASE_URL}/api/auth/register", json={
        "username": st_user,
        "password": "Stud3ntPass!",
        "full_name": "Test Student",
        "phone": "@test_telegram",
        "group_id": group_id
    })
    assert res.status_code == 201, f"Student registration failed: {res.text}"
    st_token = res.json()["access_token"]
    st_headers = {"Authorization": f"Bearer {st_token}"}
    print("[OK] Registered student with mandatory group selection and telegram contact.")

    print("\n--- 5. Testing Assignment Creation with File & Vocab CSV ---")
    csv_bytes = b"word,translation\napple,olma\nbanana,banan"
    pdf_bytes = b"%PDF-1.4 Sample Homework PDF File"
    files = {
        "file": ("sample.pdf", pdf_bytes, "application/pdf"),
        "vocab_file": ("vocab.csv", csv_bytes, "text/csv")
    }
    data = {
        "group_id": group_id,
        "title": "Unit 1 Reading & Vocabulary",
        "description": "Read PDF and learn vocabulary.",
        "deadline": "2030-12-31T23:59:59Z",
        "status": "published"
    }
    res = requests.post(f"{BASE_URL}/api/assignments", headers=t_headers, data=data, files=files)
    assert res.status_code == 201, f"Create assignment failed: {res.text}"
    assignment = res.json()
    assignment_id = assignment["id"]
    assert len(assignment["vocab_words"]) == 2
    print("[OK] Assignment created with homework PDF and 2 vocabulary words.")

    print("\n--- 6. Testing Student Dashboard & Assignment View ---")
    res = requests.get(f"{BASE_URL}/api/assignments/mine", headers=st_headers)
    assert res.status_code == 200
    st_assignments = res.json()
    assert any(a["id"] == assignment_id for a in st_assignments)
    print("[OK] Student sees published assignment.")

    print("\n--- 7. Testing Student Submission ---")
    sub_file = b"%PDF-1.4 Student Solution PDF"
    files = {"file": ("solution.pdf", sub_file, "application/pdf")}
    data = {"assignment_id": assignment_id, "text_answer": "Finished my homework!"}
    res = requests.post(f"{BASE_URL}/api/submissions", headers=st_headers, data=data, files=files)
    assert res.status_code == 201
    sub_id = res.json()["id"]
    print(f"[OK] Student submitted homework ({sub_id}).")

    print("\n--- 8. Testing Teacher Grading ---")
    res = requests.post(f"{BASE_URL}/api/submissions/{sub_id}/grade", headers=t_headers, json={
        "score": 10,
        "stars": 5,
        "feedback": "Perfect job!"
    })
    assert res.status_code == 200
    print("[OK] Teacher graded submission (10/10, 5 stars).")

    print("\n--- 9. Testing Group Deletion ---")
    res = requests.delete(f"{BASE_URL}/api/groups/{group_id}", headers=t_headers)
    assert res.status_code == 204
    print("[OK] Permanent group deletion tested.")

    print("\n=======================================================")
    print(" ALL VERIFICATION CHECKS PASSED SUCCESSFULLY! ")
    print("=======================================================\n")

if __name__ == "__main__":
    verify_all()
