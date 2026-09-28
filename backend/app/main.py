import asyncio
import logging
import os
import sys
from pathlib import Path

# Ensure backend directory is on sys.path so app imports work whether started from repo root or backend/
_backend_dir = str(Path(__file__).resolve().parent.parent)
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

from fastapi import FastAPI, HTTPException, Request, Response, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from sqlalchemy import select

from app.api.routes import assignments, auth, dashboard, feedback, gamification, groups, profile, storage, students, submissions, teachers, telegram, wordlists
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


def get_cors_headers(request: Request) -> dict[str, str]:
    """
    Ensure every error response includes explicit CORS headers matching the request origin.
    This guarantees browsers will never block error payloads with a generic 'Network Error'.
    """
    origin = request.headers.get("origin")
    headers: dict[str, str] = {
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Methods": "*",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Expose-Headers": "Content-Disposition, Content-Length, Content-Type",
    }
    if origin:
        headers["Access-Control-Allow-Origin"] = origin
    else:
        headers["Access-Control-Allow-Origin"] = "*"
        headers.pop("Access-Control-Allow-Credentials", None)
    return headers


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        content={"detail": "Too many requests. Please try again shortly."},
        headers=get_cors_headers(request),
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    # Friendly, structured validation errors without leaking internals.
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": "Validation error", "errors": exc.errors()},
        headers=get_cors_headers(request),
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    headers = get_cors_headers(request)
    if exc.headers:
        headers.update(exc.headers)
    if isinstance(exc.detail, dict) and "code" in exc.detail:
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "success": False,
                "error": {
                    "code": exc.detail["code"],
                    "message": exc.detail.get("message", ""),
                },
                "detail": exc.detail.get("message", ""),
            },
            headers=headers,
        )
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
        headers=headers,
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    # Never leak stack traces to the client, especially in production.
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    headers = get_cors_headers(request)
    if settings.ENVIRONMENT == "production":
        return JSONResponse(status_code=500, content={"detail": f"Internal server error: {type(exc).__name__}"}, headers=headers)
    return JSONResponse(status_code=500, content={"detail": f"Internal server error: {exc}"}, headers=headers)



@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    if request.method == "OPTIONS":
        return await call_next(request)
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    if settings.ENVIRONMENT == "production":
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
    return response


origins = list({
    "https://englishlifesupport.vercel.app",
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
    *settings.cors_origins_list,
})

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=3600,
)


@app.options("/{rest_of_path:path}", include_in_schema=False)
async def preflight_handler(request: Request, rest_of_path: str):
    """Immediate CORS preflight responder to guarantee zero preflight hangs."""
    origin = request.headers.get("origin") or "*"
    headers = {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, PATCH, HEAD",
        "Access-Control-Allow-Headers": request.headers.get("access-control-request-headers", "*"),
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Max-Age": "3600",
    }
    return Response(status_code=204, headers=headers)


app.include_router(auth.router)
app.include_router(students.router)
app.include_router(students.teacher_students_router)
app.include_router(teachers.router)
app.include_router(groups.router)
app.include_router(assignments.router)
app.include_router(assignments.teacher_assignments_router)
app.include_router(submissions.router)
app.include_router(dashboard.router)
app.include_router(gamification.router)
app.include_router(profile.router)
app.include_router(profile.users_avatar_router)
app.include_router(profile.v1_profile_router)
app.include_router(feedback.router)
app.include_router(wordlists.router, prefix="/api/wordlists", tags=["Wordlists"])
app.include_router(wordlists.router, prefix="/wordlists", tags=["Wordlists Fallback"])
app.include_router(wordlists.router, prefix="/api/api/wordlists", tags=["Wordlists Fallback"], include_in_schema=False)
app.include_router(storage.router)
app.include_router(telegram.router)


@app.get("/")
@app.get("/health")
@app.get("/api/health")
async def health_check():
    return {"status": "ok", "service": "English Life LMS API"}


@app.get("/api/wordlists-ping")
@app.get("/wordlists-ping")
async def wordlists_ping():
    return {"status": "ok", "routes": "mounted"}



async def bootstrap_teacher_account(max_retries: int = 5, retry_delay: float = 2.0):
    """
    Ensures exactly one teacher account exists on first run, using the
    credentials from environment variables. This is the ONLY way a teacher
    account is created - there is no public "register as teacher" endpoint.
    Safe to run on every startup: it's a no-op once a teacher exists.
    """
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


async def _run_startup_tasks():
    """Executes DB table verification, migrations, and teacher bootstrap in the background without blocking HTTP serving."""
    # 1. Ensure wordlist and other metadata tables exist safely without blocking
    try:
        from app.db.base_class import Base
        from app.db.session import engine
        from app.models.wordlist import WordlistSet, WordlistItem  # noqa: F401

        async def _init_models():
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
                try:
                    import sqlalchemy as sa
                    if conn.dialect.name == "postgresql":
                        await conn.execute(sa.text("ALTER TABLE wordlist_sets ADD COLUMN IF NOT EXISTS b2_file_url TEXT"))
                        await conn.execute(sa.text("ALTER TABLE wordlist_sets ADD COLUMN IF NOT EXISTS total_words INTEGER DEFAULT 0"))
                        await conn.execute(sa.text("ALTER TABLE task_lock_overrides ADD COLUMN IF NOT EXISTS is_exempted BOOLEAN NOT NULL DEFAULT FALSE"))
                        await conn.execute(sa.text("ALTER TABLE submissions ADD COLUMN IF NOT EXISTS image_hash VARCHAR(64)"))
                        await conn.execute(sa.text("ALTER TABLE submissions ADD COLUMN IF NOT EXISTS file_sha256 VARCHAR(64)"))
                        await conn.execute(sa.text("ALTER TABLE submissions ADD COLUMN IF NOT EXISTS is_suspicious BOOLEAN NOT NULL DEFAULT FALSE"))
                        await conn.execute(sa.text("ALTER TABLE submissions ADD COLUMN IF NOT EXISTS similarity_score DOUBLE PRECISION"))
                        await conn.execute(sa.text("ALTER TABLE submissions ADD COLUMN IF NOT EXISTS duplicate_of_submission_id UUID"))
                        await conn.execute(sa.text("ALTER TABLE submissions ADD COLUMN IF NOT EXISTS flag_reason VARCHAR(500)"))
                        await conn.execute(sa.text("ALTER TABLE submission_images ADD COLUMN IF NOT EXISTS image_hash VARCHAR(64)"))
                        await conn.execute(sa.text("ALTER TABLE submission_images ADD COLUMN IF NOT EXISTS file_sha256 VARCHAR(64)"))
                        await conn.execute(sa.text("ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS parent_telegram_chat_id VARCHAR(64)"))
                        await conn.execute(sa.text("ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS parent_telegram_username VARCHAR(255)"))
                        await conn.execute(sa.text("ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS parent_name VARCHAR(255)"))
                        await conn.execute(sa.text("ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS parent_linked_at TIMESTAMP WITH TIME ZONE"))
                        await conn.execute(sa.text("ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS last_parent_digest_sent_at TIMESTAMP WITH TIME ZONE"))
                        await conn.execute(sa.text("ALTER TABLE assignments ADD COLUMN IF NOT EXISTS parent_digest_sent BOOLEAN NOT NULL DEFAULT FALSE"))
                        await conn.execute(sa.text("ALTER TABLE submissions ADD COLUMN IF NOT EXISTS tab_switch_count BIGINT NOT NULL DEFAULT 0"))
                        await conn.execute(sa.text("ALTER TABLE submissions ADD COLUMN IF NOT EXISTS ai_evaluation_json TEXT"))
                        await conn.execute(sa.text("ALTER TABLE submissions ADD COLUMN IF NOT EXISTS ai_grade_suggested DOUBLE PRECISION"))
                        await conn.execute(sa.text("ALTER TABLE submissions ADD COLUMN IF NOT EXISTS ai_evaluated_at TIMESTAMP WITH TIME ZONE"))
                        await conn.execute(sa.text("ALTER TABLE submissions ADD COLUMN IF NOT EXISTS audio_transcript TEXT"))
                        await conn.execute(sa.text("ALTER TABLE submissions ADD COLUMN IF NOT EXISTS speaking_metrics_json TEXT"))
                        await conn.execute(sa.text("ALTER TABLE submissions ADD COLUMN IF NOT EXISTS ai_speaking_evaluation_json TEXT"))
                        await conn.execute(sa.text("ALTER TABLE submissions ADD COLUMN IF NOT EXISTS verification_code VARCHAR(32)"))
                        await conn.execute(sa.text("ALTER TABLE submissions ADD COLUMN IF NOT EXISTS verification_code_matched BOOLEAN"))
                        await conn.execute(sa.text("ALTER TABLE submissions ADD COLUMN IF NOT EXISTS tampering_detected BOOLEAN NOT NULL DEFAULT FALSE"))
                    else:
                        res = await conn.execute(sa.text("PRAGMA table_info(wordlist_sets)"))
                        cols = [r[1] for r in res.fetchall()]
                        if "b2_file_url" not in cols:
                            await conn.execute(sa.text("ALTER TABLE wordlist_sets ADD COLUMN b2_file_url TEXT"))
                        if "total_words" not in cols:
                            await conn.execute(sa.text("ALTER TABLE wordlist_sets ADD COLUMN total_words INTEGER DEFAULT 0"))
                        res_ovr = await conn.execute(sa.text("PRAGMA table_info(task_lock_overrides)"))
                        ovr_cols = [r[1] for r in res_ovr.fetchall()]
                        if "is_exempted" not in ovr_cols:
                            await conn.execute(sa.text("ALTER TABLE task_lock_overrides ADD COLUMN is_exempted BOOLEAN NOT NULL DEFAULT 0"))

                        res_sub = await conn.execute(sa.text("PRAGMA table_info(submissions)"))
                        sub_cols = [r[1] for r in res_sub.fetchall()]
                        if "image_hash" not in sub_cols:
                            await conn.execute(sa.text("ALTER TABLE submissions ADD COLUMN image_hash VARCHAR(64)"))
                        if "file_sha256" not in sub_cols:
                            await conn.execute(sa.text("ALTER TABLE submissions ADD COLUMN file_sha256 VARCHAR(64)"))
                        if "is_suspicious" not in sub_cols:
                            await conn.execute(sa.text("ALTER TABLE submissions ADD COLUMN is_suspicious BOOLEAN NOT NULL DEFAULT 0"))
                        if "similarity_score" not in sub_cols:
                            await conn.execute(sa.text("ALTER TABLE submissions ADD COLUMN similarity_score FLOAT"))
                        if "duplicate_of_submission_id" not in sub_cols:
                            await conn.execute(sa.text("ALTER TABLE submissions ADD COLUMN duplicate_of_submission_id TEXT"))
                        if "flag_reason" not in sub_cols:
                            await conn.execute(sa.text("ALTER TABLE submissions ADD COLUMN flag_reason VARCHAR(500)"))
                        if "tab_switch_count" not in sub_cols:
                            await conn.execute(sa.text("ALTER TABLE submissions ADD COLUMN tab_switch_count BIGINT NOT NULL DEFAULT 0"))
                        if "ai_evaluation_json" not in sub_cols:
                            await conn.execute(sa.text("ALTER TABLE submissions ADD COLUMN ai_evaluation_json TEXT"))
                        if "ai_grade_suggested" not in sub_cols:
                            await conn.execute(sa.text("ALTER TABLE submissions ADD COLUMN ai_grade_suggested FLOAT"))
                        if "ai_evaluated_at" not in sub_cols:
                            await conn.execute(sa.text("ALTER TABLE submissions ADD COLUMN ai_evaluated_at TIMESTAMP"))
                        if "audio_transcript" not in sub_cols:
                            await conn.execute(sa.text("ALTER TABLE submissions ADD COLUMN audio_transcript TEXT"))
                        if "speaking_metrics_json" not in sub_cols:
                            await conn.execute(sa.text("ALTER TABLE submissions ADD COLUMN speaking_metrics_json TEXT"))
                        if "ai_speaking_evaluation_json" not in sub_cols:
                            await conn.execute(sa.text("ALTER TABLE submissions ADD COLUMN ai_speaking_evaluation_json TEXT"))
                        if "verification_code" not in sub_cols:
                            await conn.execute(sa.text("ALTER TABLE submissions ADD COLUMN verification_code VARCHAR(32)"))
                        if "verification_code_matched" not in sub_cols:
                            await conn.execute(sa.text("ALTER TABLE submissions ADD COLUMN verification_code_matched BOOLEAN"))
                        if "tampering_detected" not in sub_cols:
                            await conn.execute(sa.text("ALTER TABLE submissions ADD COLUMN tampering_detected BOOLEAN NOT NULL DEFAULT 0"))

                        res_simg = await conn.execute(sa.text("PRAGMA table_info(submission_images)"))
                        simg_cols = [r[1] for r in res_simg.fetchall()]
                        if "image_hash" not in simg_cols:
                            await conn.execute(sa.text("ALTER TABLE submission_images ADD COLUMN image_hash VARCHAR(64)"))
                        if "file_sha256" not in simg_cols:
                            await conn.execute(sa.text("ALTER TABLE submission_images ADD COLUMN file_sha256 VARCHAR(64)"))

                        res_sp = await conn.execute(sa.text("PRAGMA table_info(student_profiles)"))
                        sp_cols = [r[1] for r in res_sp.fetchall()]
                        if "parent_telegram_chat_id" not in sp_cols:
                            await conn.execute(sa.text("ALTER TABLE student_profiles ADD COLUMN parent_telegram_chat_id VARCHAR(64)"))
                        if "parent_telegram_username" not in sp_cols:
                            await conn.execute(sa.text("ALTER TABLE student_profiles ADD COLUMN parent_telegram_username VARCHAR(255)"))
                        if "parent_name" not in sp_cols:
                            await conn.execute(sa.text("ALTER TABLE student_profiles ADD COLUMN parent_name VARCHAR(255)"))
                        if "parent_linked_at" not in sp_cols:
                            await conn.execute(sa.text("ALTER TABLE student_profiles ADD COLUMN parent_linked_at TIMESTAMP"))
                        if "last_parent_digest_sent_at" not in sp_cols:
                            await conn.execute(sa.text("ALTER TABLE student_profiles ADD COLUMN last_parent_digest_sent_at TIMESTAMP"))

                        res_as = await conn.execute(sa.text("PRAGMA table_info(assignments)"))
                        as_cols = [r[1] for r in res_as.fetchall()]
                        if "parent_digest_sent" not in as_cols:
                            await conn.execute(sa.text("ALTER TABLE assignments ADD COLUMN parent_digest_sent BOOLEAN NOT NULL DEFAULT 0"))
                except Exception as ex:
                    logger.debug("Column check note: %s", ex)

        await asyncio.wait_for(_init_models(), timeout=8.0)
        logger.info("Database metadata verified.")
    except Exception as exc:
        logger.warning("Startup metadata create_all check: %s", exc)

    # 2. Ensure database schema is migrated before application queries tables
    if os.environ.get("RUN_MIGRATIONS_ON_STARTUP") == "true":
        try:
            from pathlib import Path
            from alembic.config import Config
            from alembic import command

            def _run_migrations():
                backend_dir = Path(__file__).resolve().parents[1]
                alembic_ini_path = backend_dir / "alembic.ini"
                alembic_cfg = Config(str(alembic_ini_path))
                alembic_cfg.set_main_option("script_location", str(backend_dir / "alembic"))
                command.upgrade(alembic_cfg, "head")

            try:
                await asyncio.wait_for(asyncio.to_thread(_run_migrations), timeout=10.0)
                logger.info("Database schema is up to date (alembic upgrade head).")
            except asyncio.TimeoutError:
                logger.warning("Startup migration check timed out; continuing startup.")
        except Exception as exc:
            logger.warning("Startup database migration check note: %s", exc)

    # 3. Bootstrap initial teacher account (guarded by timeout so startup never deadlocks)
    try:
        await asyncio.wait_for(bootstrap_teacher_account(max_retries=3, retry_delay=1.0), timeout=10.0)
    except asyncio.TimeoutError:
        logger.warning("bootstrap_teacher_account timed out; server continuing startup.")
    except Exception as exc:
        logger.exception("Error during bootstrap_teacher_account execution: %s", exc)


@app.on_event("startup")
async def startup_event():
    # In test environment, ensure a fresh SQLite database file
    if settings.ENVIRONMENT == "test":
        db_path_str = settings.DATABASE_URL.split('/')[-1]
        db_path = Path(db_path_str)
        if db_path.exists():
            db_path.unlink()
            logger.info("Deleted existing test SQLite DB to ensure clean state")

    # Launch background DB warmup/migration task so FastAPI accepts HTTP requests immediately
    asyncio.create_task(_run_startup_tasks())

    # Log registered preview-bulk routes
    for route in app.routes:
        if "preview-bulk" in getattr(route, "path", ""):
            methods = list(getattr(route, "methods", []))
            logger.info("[ROUTE MATCH]: %s -> %s", methods, route.path)
    # Launch background parent notification reporter loop
    from app.services.parent_reporter import start_parent_reporter_loop
    asyncio.create_task(start_parent_reporter_loop())


