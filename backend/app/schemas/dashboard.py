import uuid
from datetime import datetime

from pydantic import BaseModel, model_validator


class RecentSubmissionItem(BaseModel):
    id: uuid.UUID
    student_name: str
    student_avatar: str | None = None
    assignment_title: str
    submitted_at: datetime
    status: str

    studentName: str | None = None
    studentAvatar: str | None = None
    assignmentTitle: str | None = None
    submittedAt: datetime | None = None

    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def populate_camel_case(self) -> "RecentSubmissionItem":
        if self.studentName is None:
            self.studentName = self.student_name
        if self.studentAvatar is None:
            self.studentAvatar = self.student_avatar
        if self.assignmentTitle is None:
            self.assignmentTitle = self.assignment_title
        if self.submittedAt is None:
            self.submittedAt = self.submitted_at
        return self


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
    total_wordlists: int = 0
    recent_submissions: list[RecentSubmissionItem]

    totalStudents: int | None = None
    activeStudents: int | None = None
    totalGroups: int | None = None
    totalAssignments: int | None = None
    pendingSubmissions: int | None = None
    completionRate: int | None = None
    lateStudents: int | None = None
    lockedStudents: int | None = None
    inactiveStudents: int | None = None
    totalWordlists: int | None = None
    recentSubmissions: list[RecentSubmissionItem] | None = None

    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def populate_camel_case(self) -> "TeacherDashboard":
        if self.totalStudents is None:
            self.totalStudents = self.total_students
        if self.activeStudents is None:
            self.activeStudents = self.active_students
        if self.totalGroups is None:
            self.totalGroups = self.total_groups
        if self.totalAssignments is None:
            self.totalAssignments = self.total_assignments
        if self.pendingSubmissions is None:
            self.pendingSubmissions = self.pending_submissions
        if self.completionRate is None:
            self.completionRate = self.completion_rate
        if self.lateStudents is None:
            self.lateStudents = self.late_students
        if self.lockedStudents is None:
            self.lockedStudents = self.locked_students
        if self.inactiveStudents is None:
            self.inactiveStudents = self.inactive_students
        if self.totalWordlists is None:
            self.totalWordlists = self.total_wordlists
        if self.recentSubmissions is None:
            self.recentSubmissions = self.recent_submissions
        return self


class UpcomingAssignmentItem(BaseModel):
    id: uuid.UUID
    title: str
    deadline: datetime
    submitted: bool
    is_locked: bool = False
    lock_reason: str | None = None

    isLocked: bool | None = None
    lockReason: str | None = None

    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def populate_camel_case(self) -> "UpcomingAssignmentItem":
        if self.isLocked is None:
            self.isLocked = self.is_locked
        if self.lockReason is None:
            self.lockReason = self.lock_reason
        return self


class RecentGradeItem(BaseModel):
    assignment_title: str
    score: int
    stars: int
    graded_at: datetime

    assignmentTitle: str | None = None
    gradedAt: datetime | None = None

    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def populate_camel_case(self) -> "RecentGradeItem":
        if self.assignmentTitle is None:
            self.assignmentTitle = self.assignment_title
        if self.gradedAt is None:
            self.gradedAt = self.graded_at
        return self


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
    upcoming_deadlines: list[UpcomingAssignmentItem]
    recent_grades: list[RecentGradeItem]
    weekly_badge: str | None = None

    fullName: str | None = None
    groupName: str | None = None
    teacherName: str | None = None
    englishLevel: str | None = None
    totalStars: int | None = None
    totalXp: int | None = None
    levelTitle: str | None = None
    freePassAvailable: bool | None = None
    averageScore: float | None = None
    totalAssignments: int | None = None
    completedAssignments: int | None = None
    upcomingDeadlines: list[UpcomingAssignmentItem] | None = None
    recentGrades: list[RecentGradeItem] | None = None
    weeklyBadge: str | None = None

    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def populate_camel_case(self) -> "StudentDashboard":
        if self.fullName is None:
            self.fullName = self.full_name
        if self.groupName is None:
            self.groupName = self.group_name
        if self.teacherName is None:
            self.teacherName = self.teacher_name
        if self.englishLevel is None:
            self.englishLevel = self.english_level
        if self.totalStars is None:
            self.totalStars = self.total_stars
        if self.totalXp is None:
            self.totalXp = self.total_xp
        if self.levelTitle is None:
            self.levelTitle = self.level_title
        if self.freePassAvailable is None:
            self.freePassAvailable = self.free_pass_available
        if self.averageScore is None:
            self.averageScore = self.average_score
        if self.totalAssignments is None:
            self.totalAssignments = self.total_assignments
        if self.completedAssignments is None:
            self.completedAssignments = self.completed_assignments
        if self.upcomingDeadlines is None:
            self.upcomingDeadlines = self.upcoming_deadlines
        if self.recentGrades is None:
            self.recentGrades = self.recent_grades
        if self.weeklyBadge is None:
            self.weeklyBadge = self.weekly_badge
        return self


TeacherDashboard.model_rebuild()
StudentDashboard.model_rebuild()
