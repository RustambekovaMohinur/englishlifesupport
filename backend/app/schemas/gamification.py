import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class StarTransactionOut(BaseModel):
    id: uuid.UUID
    amount: int
    reason: str
    description: str | None = None
    reference_id: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class AchievementOut(BaseModel):
    id: uuid.UUID
    badge_key: str
    title: str
    description: str
    icon: str
    unlocked_at: datetime

    model_config = {"from_attributes": True}


class FreePassStatus(BaseModel):
    month_key: str
    has_free_pass: bool
    is_used: bool
    used_at: datetime | None = None


class StudentGamificationSummary(BaseModel):
    total_stars: int
    streak: int
    longest_streak: int
    last_activity_date: str | None = None
    total_xp: int
    level: int
    level_title: str
    next_level_xp: int
    free_pass: FreePassStatus
    achievements: list[AchievementOut]
    recent_transactions: list[StarTransactionOut]


class LeaderboardEntry(BaseModel):
    rank: int
    student_id: uuid.UUID
    student_name: str
    weekly_xp: int
    weekly_stars: int
    streak: int
    completion_rate: int
    is_current_user: bool = False


class WeeklyLeaderboardOut(BaseModel):
    group_name: str | None = None
    week_key: str
    current_student_rank: int | None = None
    entries: list[LeaderboardEntry]


class SotwNomination(BaseModel):
    student_id: uuid.UUID
    stars_awarded: int = Field(default=50, ge=50, le=100)
    reason: str | None = Field(default=None, max_length=255)


class SotwOut(BaseModel):
    group_id: uuid.UUID
    student_id: uuid.UUID
    student_name: str
    week_key: str
    stars_awarded: int
    reason: str | None = None


class TaskLockOverrideRequest(BaseModel):
    student_id: uuid.UUID
    assignment_id: uuid.UUID
    is_unlocked: bool = True


class VocabPracticeSubmission(BaseModel):
    assignment_id: uuid.UUID | None = None  # optional link to assignment
    total_words: int
    correct_words: int
