import uuid
from datetime import datetime

from pydantic import BaseModel


class TeacherDashboard(BaseModel):
    total_students: int
    active_students: int
    total_groups: int
    total_assignments: int
    pending_submissions: int
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
    total_stars: int
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
