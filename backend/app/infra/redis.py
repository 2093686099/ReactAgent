# backend/app/infra/redis.py
from __future__ import annotations

import redis.asyncio as redis
from app.config import settings


class RedisManager:
    """Redis 连接管理"""

    def __init__(self):
        self.client: redis.Redis | None = None

    async def connect(self):
        self.client = redis.Redis(
            host=settings.redis_host,
            port=settings.redis_port,
            db=settings.redis_db,
            decode_responses=True,
        )

    async def disconnect(self):
        if self.client:
            await self.client.aclose()


redis_manager = RedisManager()