import os
import pathlib
import sys
import importlib
import pytest

# Ensure test environment is set before any application code imports
os.environ["ENVIRONMENT"] = "test"
# Use a test‑only JWT secret
os.environ["JWT_SECRET_KEY"] = "test-secret-key"

# Fresh SQLite DB for the whole test session
test_db_path = pathlib.Path("test.db")
if test_db_path.exists():
    test_db_path.unlink()

os.environ["ASYNC_DATABASE_URL"] = f"sqlite+aiosqlite:///{test_db_path}"
os.environ["DATABASE_URL"] = f"sqlite:///./{test_db_path}"

# Reload config if it was already imported (unlikely at this early stage)
if "app.core.config" in sys.modules:
    importlib.reload(sys.modules["app.core.config"])

# Dummy fixture to keep pytest happy; autouse ensures this file is processed
@pytest.fixture(autouse=True, scope="session")
def dummy_fixture():
    return True
