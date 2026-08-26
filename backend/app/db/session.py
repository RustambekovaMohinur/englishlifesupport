import urllib.parse
from sqlalchemy.engine import URL
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings


def _build_async_engine_url(raw_url: str) -> tuple[URL, dict]:
    """Parse *raw_url* (settings.ASYNC_DATABASE_URL) and return a tuple of:
    1. A SQLAlchemy :class:`~sqlalchemy.engine.URL` without unsupported query params.
    2. A ``connect_args`` dict for asyncpg (e.g. ``{"ssl": True}`` when ``sslmode`` is present).
    The function removes ``sslmode`` and ``channel_binding`` because asyncpg does not accept them.
    """
    parsed = urllib.parse.urlparse(raw_url)
    query_params = urllib.parse.parse_qs(parsed.query)

    ssl_required = False
    if "sslmode" in query_params:
        ssl_required = True
        # strip the unsupported parameters
        query_params.pop("sslmode", None)
        query_params.pop("channel_binding", None)

    # Re‑encode remaining query parameters (if any)
    clean_query = urllib.parse.urlencode({k: v[0] for k, v in query_params.items()}, doseq=True)
    # Build a new URL using SQLAlchemy's URL helper to ensure the dialect sees a clean URL
    clean_url = URL.create(
        drivername=parsed.scheme,
        username=parsed.username,
        password=parsed.password,
        host=parsed.hostname,
        port=parsed.port,
        database=parsed.path.lstrip("/"),
        query=urllib.parse.parse_qs(clean_query),
    )

    connect_args: dict = {}
    if ssl_required:
        connect_args["ssl"] = True
    return clean_url, connect_args

# Build the engine once at import time
_clean_url, _connect_args = _build_async_engine_url(settings.ASYNC_DATABASE_URL)

engine = create_async_engine(
    _clean_url,
    pool_pre_ping=True,
    pool_size=20,
    max_overflow=10,
    echo=False,
    connect_args=_connect_args,
)

# expose connect_args for tests
connect_args = _connect_args

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)

async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
