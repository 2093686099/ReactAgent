# backend/app/services/session.py
from __future__ import annotations

import json
import logging
import time
import uuid
from app.infra.redis import redis_manager
from app.config import settings


logger = logging.getLogger(__name__)


class SessionService:
    """会话管理服务。
    数据结构：
      user_sessions:{user_id}              SET     该用户的所有 session_id
      session:{user_id}:{session_id}       HASH    会话元数据
    """

    @property
    def client(self):
        if redis_manager.client is None:
            raise RuntimeError("Redis 未初始化，请确认 lifespan 已运行")
        return redis_manager.client

    @staticmethod
    def _key(user_id: str, session_id: str) -> str:
        return f"session:{user_id}:{session_id}"

    @staticmethod
    def _user_sessions_key(user_id: str) -> str:
        return f"user_sessions:{user_id}"

    async def create_session(
        self,
        user_id: str | None = None,
        session_id: str | None = None,
    ) -> str:
        """创建新会话，返回 session_id"""
        user_id = user_id or settings.default_user_id
        session_id = session_id or str(uuid.uuid4())
        data = {
            "session_id": session_id,
            "user_id": user_id,
            "status": "idle",
            "created_at": time.time(),
            "last_updated": time.time(),
        }
        await self.client.set(
            self._key(user_id, session_id),
            json.dumps(data, ensure_ascii=False),
            ex=settings.session_ttl,
        )
        await self.client.sadd(self._user_sessions_key(user_id), session_id)
        await self.client.expire(self._user_sessions_key(user_id), settings.session_ttl)
        logger.info(f"创建会话 {user_id}:{session_id}")
        return session_id

    async def get_session(self, session_id: str, user_id: str | None = None) -> dict | None:
        user_id = user_id or settings.default_user_id
        raw = await self.client.get(self._key(user_id, session_id))
        return json.loads(raw) if raw else None

    async def touch(self, session_id: str, user_id: str | None = None) -> bool:
        """更新 last_updated 时间戳并续期 TTL"""
        user_id = user_id or settings.default_user_id
        current = await self.get_session(session_id, user_id)
        if current is None:
            return False
        current["last_updated"] = time.time()
        await self.client.set(
            self._key(user_id, session_id),
            json.dumps(current, ensure_ascii=False),
            ex=settings.session_ttl,
        )
        return True

    async def session_exists(self, session_id: str, user_id: str | None = None) -> bool:
        user_id = user_id or settings.default_user_id
        return (await self.client.exists(self._key(user_id, session_id))) > 0

    async def list_sessions(self, user_id: str | None = None) -> list[dict]:
        """列出用户的所有会话，按 last_updated 倒序。
        使用 mget 批量获取，Redis 调用从 N+1 降为 2（smembers + mget）。"""
        user_id = user_id or settings.default_user_id
        session_ids = list(await self.client.smembers(self._user_sessions_key(user_id)))
        if not session_ids:
            return []
        keys = [self._key(user_id, sid) for sid in session_ids]
        values = await self.client.mget(keys)
        sessions = []
        expired_sids = []
        for sid, raw in zip(session_ids, values):
            if raw:
                sessions.append(json.loads(raw))
            else:
                expired_sids.append(sid)
        if expired_sids:
            pipe = self.client.pipeline()
            for sid in expired_sids:
                pipe.srem(self._user_sessions_key(user_id), sid)
            await pipe.execute()
        sessions.sort(key=lambda s: s.get("last_updated", 0), reverse=True)
        return sessions

    async def get_active_session_id(self, user_id: str | None = None) -> str | None:
        sessions = await self.list_sessions(user_id)
        return sessions[0]["session_id"] if sessions else None

    async def delete_session(self, session_id: str, user_id: str | None = None) -> bool:
        user_id = user_id or settings.default_user_id
        deleted = await self.client.delete(self._key(user_id, session_id))
        await self.client.srem(self._user_sessions_key(user_id), session_id)
        if deleted:
            logger.info(f"删除会话 {user_id}:{session_id}")
        return deleted > 0
