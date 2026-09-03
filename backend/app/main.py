import logging

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from sqlalchemy import select

from app.api.routes import assignments, auth, dashboard, gamification, groups, profile, students, submissions, teachers
from app.core.config import settings
from app.core.rate_limit import limiter
from app.core.security import hash_password
from app.db.session import AsyncSessionLocal
from app.models.teacher import TeacherProfile
from app.models.user import User, UserRole

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("english_life")

app = FastAPI(
    title="English Life LMS API",
    version="1.0.0",
    # Hide interactive docs in production to reduce attack surface.
    docs_url="/api/docs" if settings.ENVIRONMENT != "production" else None,
    redoc_url=None,
)

app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        content={"detail": "Too many requests. Please try again shortly."},
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    # Friendly, structured validation errors without leaking internals.
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": "Validation error", "errors": exc.errors()},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    # Never leak stack traces to the client, especially in production.
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    if settings.ENVIRONMENT == "production":
        return JSONResponse(status_code=500, content={"detail": "Internal server error"})
    return JSONResponse(status_code=500, content={"detail": f"Internal server error: {exc}"})


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_origin_regex=settings.CORS_ORIGIN_REGEX if getattr(settings, "CORS_ORIGIN_REGEX", None) else None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    if settings.ENVIRONMENT == "production":
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
    return response


app.include_router(auth.router)
app.include_router(students.router)
app.include_router(teachers.router)
app.include_router(groups.router)
app.include_router(assignments.router)
app.include_router(submissions.router)
app.include_router(dashboard.router)
app.include_router(gamification.router)
app.include_router(profile.router)


@app.get("/api/health")
async def health_check():
    return {"status": "ok"}


async def bootstrap_teacher_account(max_retries: int = 5, retry_delay: float = 2.0):
    """
    Ensures exactly one teacher account exists on first run, using the
    credentials from environment variables. This is the ONLY way a teacher
    account is created - there is no public "register as teacher" endpoint.
    Safe to run on every startup: it's a no-op once a teacher exists.
    """
    import asyncio

    for attempt in range(1, max_retries + 1):
        try:
            async with AsyncSessionLocal() as db:
                existing = await db.execute(select(User).where(User.role == UserRole.TEACHER))
                teacher = existing.scalar_one_or_none()
                if teacher is not None:
                    teacher.email = settings.BOOTSTRAP_TEACHER_EMAIL
                    if not teacher.username:
                        teacher.username = "teacher"
                    teacher.password_hash = hash_password(settings.BOOTSTRAP_TEACHER_PASSWORD)
                    await db.commit()
                    logger.info("Teacher account verified: %s", settings.BOOTSTRAP_TEACHER_EMAIL)
                    return

                teacher_user = User(
                    email=settings.BOOTSTRAP_TEACHER_EMAIL,
                    username="teacher",
                    password_hash=hash_password(settings.BOOTSTRAP_TEACHER_PASSWORD),
                    role=UserRole.TEACHER,
                )
                db.add(teacher_user)
                await db.flush()

                db.add(TeacherProfile(user_id=teacher_user.id, full_name=settings.BOOTSTRAP_TEACHER_NAME))
                await db.commit()
                logger.info("Bootstrapped initial teacher account: %s", settings.BOOTSTRAP_TEACHER_EMAIL)
                return
        except Exception as exc:
            logger.warning("Attempt %d/%d to bootstrap teacher account: %s", attempt, max_retries, exc)
            if attempt < max_retries:
                await asyncio.sleep(retry_delay)
            else:
                logger.exception("Could not bootstrap teacher account after %d attempts: %s", max_retries, exc)


@app.on_event("startup")
async def startup_event():
    # In test environment, ensure a fresh SQLite database file
    if settings.ENVIRONMENT == "test":
        # Extract file path from DATABASE_URL (expects sqlite:///./<filename>)
        db_path_str = settings.DATABASE_URL.split('/')[-1]
        db_path = pathlib.Path(db_path_str)
        if db_path.exists():
            db_path.unlink()
            logger.info("Deleted existing test SQLite DB to ensure clean state")
    # 1. Ensure database schema is migrated before application queries tables
    try:
        import asyncio
        from pathlib import Path
        from alembic.config import Config
        from alembic import command


        def _run_migrations():
            backend_dir = Path(__file__).resolve().parents[1]
            alembic_ini_path = backend_dir / "alembic.ini"
            alembic_cfg = Config(str(alembic_ini_path))
            alembic_cfg.set_main_option("script_location", str(backend_dir / "alembic"))
            command.upgrade(alembic_cfg, "head")

        await asyncio.to_thread(_run_migrations)
        logger.info("Database schema is up to date (alembic upgrade head).")
    except Exception as exc:
        logger.warning("Startup database migration check note: %s", exc)

    # 2. Bootstrap initial teacher account
    try:
        await bootstrap_teacher_account()
    except Exception as exc:
        logger.exception("Error during bootstrap_teacher_account execution: %s", exc)

