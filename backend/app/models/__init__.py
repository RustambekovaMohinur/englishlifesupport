"""
Import every model module here so that:
1. `Base.metadata` (used by Alembic autogenerate) knows about all tables.
2. SQLAlchemy can resolve the string-based relationship() references
   between models regardless of import order elsewhere in the app.
"""
from app.db.base_class import Base  # noqa: F401
from app.models.user import User, UserRole  # noqa: F401
from app.models.refresh_token import RefreshToken  # noqa: F401
from app.models.teacher import TeacherProfile  # noqa: F401
from app.models.group import Group, EnglishLevel  # noqa: F401
from app.models.student import StudentProfile  # noqa: F401
from app.models.assignment import Assignment  # noqa: F401
from app.models.submission import Submission, SubmissionStatus  # noqa: F401
from app.models.grade import Grade  # noqa: F401
from app.models.vocabulary import (  # noqa: F401
    VocabularyAnswer,
    VocabularyAssignment,
    VocabularyAttempt,
    VocabularyWord,
)
from app.models.gamification import (  # noqa: F401
    Achievement,
    FreePass,
    StarTransaction,
    StarTransactionReason,
    StudentOfTheWeek,
    StudentStreak,
    StudentXP,
    TaskLockOverride,
    XPTransaction,
)

__all__ = [
    "Base",
    "User",
    "UserRole",
    "RefreshToken",
    "TeacherProfile",
    "Group",
    "EnglishLevel",
    "StudentProfile",
    "Assignment",
    "Submission",
    "SubmissionStatus",
    "Grade",
    "VocabularyAssignment",
    "VocabularyWord",
    "VocabularyAttempt",
    "VocabularyAnswer",
    "StarTransaction",
    "StarTransactionReason",
    "FreePass",
    "StudentStreak",
    "StudentXP",
    "XPTransaction",
    "Achievement",
    "TaskLockOverride",
    "StudentOfTheWeek",
]
