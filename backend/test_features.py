import os
import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.core.security import hash_password
from app.db.base_class import Base
from app.db.session import get_db
from app.models.user import User, UserRole
from app.models.teacher import TeacherProfile
from app.models.student import StudentProfile
from app.models.group import Group, EnglishLevel
from app.models.assignment import Assignment, AssignmentStatus
from app.models.submission import Submission, SubmissionStatus
from app.models.grade import Grade

# Use an in-memory or file-based test database for testing
TEST_DB_URL = "sqlite:///./test_lms.db"

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

test_engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

@pytest.fixture(scope="session", autouse=True)
def setup_test_database():
    Base.metadata.drop_all(bind=test_engine)
    Base.metadata.create_all(bind=test_engine)
    yield
    Base.metadata.drop_all(bind=test_engine)
    if os.path.exists("./test_lms.db"):
        os.remove("./test_lms.db")

async def override_get_db():
    from app.db.session import AsyncSessionLocal
    # For sync test sqlite or async session fallback
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

# We can also test against the live running FastAPI server via httpx / Rest API calls!
