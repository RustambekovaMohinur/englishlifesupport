import urllib.parse
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings

# Parse the async database URL to handle parameters unsupported by asyncpg (e.g., sslmode, channel_binding)
_raw_url = settings.ASYNC_DATABASE_URL
parsed = urllib.parse.urlparse(_raw_url)
query_params = urllib.parse.parse_qs(parsed.query)

# Determine if SSL is required (e.g., Render uses sslmode=require)
ssl_required = False
if "sslmode" in query_params:
    ssl_required = True
    # Remove sslmode (and possible channel_binding) to avoid passing unsupported args to asyncpg
    query_params.pop("sslmode", None)
    query_params.pop("channel_binding", None)

# Rebuild the URL without the unsupported query parameters
clean_query = urllib.parse.urlencode({k: v[0] for k, v in query_params.items()}, doseq=True)
clean_url = urllib.parse.urlunparse(
    (parsed.scheme, parsed.netloc, parsed.path, parsed.params, clean_query, parsed.fragment)
)

# Prepare asyncpg‑specific connect arguments
connect_args: dict = {}
if ssl_required:
    # asyncpg uses the "ssl" argument (bool or SSLContext) to enable TLS
    connect_args["ssl"] = True

engine = create_async_engine(
    clean_url,
    pool_pre_ping=True,
    pool_size=20,
    max_overflow=10,
    echo=False,
    connect_args=connect_args,
)

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
