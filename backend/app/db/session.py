import logging
import os
import urllib.parse

from sqlalchemy.engine import URL
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings

logger = logging.getLogger("app.db.session")

# ---------------------------------------------------------------------------
# Neon free-tier: max 10 raw connections.
# We point at the *pooler* endpoint (PgBouncer, transaction mode), so
# SQLAlchemy must NOT maintain its own persistent pool on top — that would
# hold multiple idle raw connections and exhaust the quota almost instantly.
#
# Strategy:
#   • Detect Neon by hostname suffix "neon.tech".
#   • Auto-inject "-pooler" into the host if it is missing (safety net).
#   • Use NullPool so every async-with-session checkout opens/releases one
#     PgBouncer slot and never holds a raw connection between requests.
#   • statement_cache_size=0 is mandatory for PgBouncer transaction mode
#     (prepared statements are not allowed across pooled connections).
# ---------------------------------------------------------------------------

_IS_NEON = False  # set after URL is parsed below


def _ensure_pooler_host(hostname: str) -> str:
    """Auto-inject '-pooler' into a Neon host that is missing it.

    e.g. 'ep-gentle-bonus-aycqd131.c-5.us-east-2.aws.neon.tech'
      -> 'ep-gentle-bonus-aycqd131-pooler.c-5.us-east-2.aws.neon.tech'
    """
    if not hostname or "neon.tech" not in hostname:
        return hostname
    parts = hostname.split(".")
    if parts and not parts[0].endswith("-pooler"):
        parts[0] = parts[0] + "-pooler"
    return ".".join(parts)


def _build_async_engine_url(raw_url: str) -> tuple[URL, dict]:
    """Parse *raw_url* and return a tuple of:
    1. A SQLAlchemy :class:`~sqlalchemy.engine.URL` without unsupported query params.
    2. A ``connect_args`` dict for asyncpg (``{"ssl": True}`` when on Neon / sslmode present).

    Removes ``sslmode``, ``channel_binding``, and ``ssl`` query params because
    asyncpg does not accept them as query-string parameters — SSL is instead
    passed via ``connect_args``.
    """
    global _IS_NEON
    parsed = urllib.parse.urlparse(raw_url)
    query_params = urllib.parse.parse_qs(parsed.query)

    ssl_required = False
    hostname = parsed.hostname or ""

    if "neon.tech" in hostname:
        _IS_NEON = True
        ssl_required = True
        # Auto-correct to pooler host if needed
        corrected = _ensure_pooler_host(hostname)
        if corrected != hostname:
            logger.info(
                "Neon DB: auto-corrected host to pooler endpoint: %s -> %s",
                hostname,
                corrected,
            )
        hostname = corrected

    if "sslmode" in query_params or "channel_binding" in query_params:
        ssl_required = True
        query_params.pop("sslmode", None)
        query_params.pop("channel_binding", None)

    # Strip asyncpg-incompatible 'ssl' query param (passed via connect_args instead)
    query_params.pop("ssl", None)

    clean_query = urllib.parse.urlencode(
        {k: v[0] for k, v in query_params.items()}, doseq=True
    )
    clean_url = URL.create(
        drivername="postgresql+asyncpg",
        username=parsed.username,
        password=parsed.password,
        host=hostname,
        port=parsed.port,
        database=parsed.path.lstrip("/"),
        query=urllib.parse.parse_qs(clean_query) if clean_query else {},
    )

    connect_args: dict = {}
    if ssl_required:
        connect_args["ssl"] = True
    # Required for PgBouncer transaction-mode pooling (Neon pooler)
    connect_args["statement_cache_size"] = 0
    connect_args["timeout"] = 20
    connect_args["command_timeout"] = 30
    return clean_url, connect_args


# Build the engine URL — env var wins over .env / settings
_raw_url: str = (
    os.environ.get("ASYNC_DATABASE_URL")
    or settings.ASYNC_DATABASE_URL
    or os.environ.get("DATABASE_URL")
    or settings.DATABASE_URL
    or ""
)

_clean_url, _connect_args = _build_async_engine_url(_raw_url)

# ---------------------------------------------------------------------------
# Engine configuration
#
# Neon free-tier → NullPool: every request gets one PgBouncer slot for the
#   duration of the async-with block, then releases it immediately.
#   Raw-connection usage equals the number of *concurrent* in-flight requests
#   rather than a standing pool, staying well within the 10-connection ceiling.
#
# Non-Neon (local / dedicated Postgres) → small bounded pool that still
#   recycles connections to avoid long-idle staleness.
# ---------------------------------------------------------------------------
if _IS_NEON:
    engine = create_async_engine(
        _clean_url,
        poolclass=NullPool,   # No persistent pool — Neon pooler handles multiplexing
        echo=False,
        connect_args=_connect_args,
    )
    logger.info("Neon DB detected: using NullPool (host: %s)", _clean_url.host)
else:
    engine = create_async_engine(
        _clean_url,
        pool_pre_ping=True,
        pool_recycle=300,
        pool_timeout=30,
        pool_size=5,
        max_overflow=5,
        echo=False,
        connect_args=_connect_args,
    )

# Expose connect_args for tests / Alembic helpers
connect_args = _connect_args

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


async def get_db():
    """FastAPI dependency that yields a database session.

    The session is always closed in the ``finally`` block so connections are
    returned to PgBouncer (Neon) or the SQLAlchemy pool immediately after the
    request completes — even when an unhandled exception propagates.
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
