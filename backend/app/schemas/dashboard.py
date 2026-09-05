import uuid
from datetime import datetime

from pydantic import BaseModel


class TeacherDashboard(BaseModel):
    total_students: int
    active_students: int
    total_groups: int
    total_assignments: int
    pending_submissions: int
    completion_rate: int = 0
    late_students: int = 0
    locked_students: int = 0
    inactive_students: int = 0
    recent_submissions: list["RecentSubmissionItem"]


class RecentSubmissionItem(BaseModel):
    id: uuid.UUID
    student_name: str
    assignment_title: str
    submitted_at: datetime
    status: str

    model_config = {"from_attributes": True}


class StudentDashboard(BaseModel):
    full_name: str
    group_name: str | None
    teacher_name: str | None
    english_level: str | None = None
    total_stars: int
    streak: int = 0
    total_xp: int = 0
    level: int = 1
    level_title: str = "Beginner"
    free_pass_available: bool = True
    average_score: float | None
    total_assignments: int
    completed_assignments: int
    upcoming_deadlines: list["UpcomingAssignmentItem"]
    recent_grades: list["RecentGradeItem"]


class UpcomingAssignmentItem(BaseModel):
    id: uuid.UUID
    title: str
    deadline: datetime
    submitted: bool

    model_config = {"from_attributes": True}


class RecentGradeItem(BaseModel):
    assignment_title: str
    score: int
    stars: int
    graded_at: datetime

    model_config = {"from_attributes": True}


TeacherDashboard.model_rebuild()
StudentDashboard.model_rebuild()
