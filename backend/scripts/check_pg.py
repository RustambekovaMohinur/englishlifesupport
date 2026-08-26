import os, sys, asyncio
# Ensure the project root is in PYTHONPATH
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if project_root not in sys.path:
    sys.path.append(project_root)

from app.core.config import settings
from sqlalchemy.ext.asyncio import create_async_engine

async def main():
    # Create engine
    engine = create_async_engine(settings.ASYNC_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        # Get table names in public schema
        result = await conn.run_sync(lambda sync_conn: sync_conn.execute("SELECT tablename FROM pg_tables WHERE schemaname='public'"))
        tables = [row[0] for row in result]
        print("TABLES", tables)
        for tbl in tables:
            cnt_res = await conn.execute(f"SELECT COUNT(*) FROM {tbl}")
            count = cnt_res.scalar_one()
            print(f"{tbl}: {count}")
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(main())
