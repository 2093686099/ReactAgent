# backend/app/infra/database.py
from psycopg_pool import AsyncConnectionPool
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.store.postgres import AsyncPostgresStore
from app.config import settings


class Database:
    """PostgreSQL 连接池 + checkpointer + store 的生命周期管理"""

    def __init__(self):
        self.pool: AsyncConnectionPool | None = None
        self.checkpointer: AsyncPostgresSaver | None = None
        self.store: AsyncPostgresStore | None = None

    async def connect(self):
        self.pool = AsyncConnectionPool(
            conninfo=settings.db_uri,
            min_size=settings.db_pool_min,
            max_size=settings.db_pool_max,
            kwargs={"autocommit": True, "prepare_threshold": 0},
        )
        await self.pool.open()
        self.checkpointer = AsyncPostgresSaver(self.pool)
        self.store = AsyncPostgresStore(self.pool)

    async def disconnect(self):
        if self.pool:
            await self.pool.close()


db = Database()