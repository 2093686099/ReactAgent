# backend/app/services/memory.py
import logging
import uuid
from app.infra.database import db
from app.config import settings


logger = logging.getLogger(__name__)


class MemoryService:
    """长期记忆服务（基于 AsyncPostgresStore）"""

    @property
    def store(self):
        if db.store is None:
            raise RuntimeError("PostgresStore 未初始化，请确认 lifespan 已运行")
        return db.store

    @staticmethod
    def _namespace(user_id: str) -> tuple[str, str]:
        return ("memories", user_id)

    async def read(self, user_id: str | None = None) -> str:
        """
        读取用户长期记忆，返回拼接后的字符串。
        来源：07/utils/tasks.py:70-116 read_long_term_info
        """
        user_id = user_id or settings.default_user_id
        memories = await self.store.asearch(self._namespace(user_id), query="")
        if not memories:
            return ""
        texts = [
            d.value["data"]
            for d in memories
            if isinstance(d.value, dict) and "data" in d.value
        ]
        return " ".join(texts)

    async def write(self, memory_info: str, user_id: str | None = None) -> str:
        """
        写入一条长期记忆，返回 memory_id。
        来源：07/01_backendServer.py:44-80 write_long_term_info
        """
        user_id = user_id or settings.default_user_id
        memory_id = str(uuid.uuid4())
        await self.store.aput(
            namespace=self._namespace(user_id),
            key=memory_id,
            value={"data": memory_info},
        )
        logger.info(f"写入长期记忆 {memory_id}（user={user_id}）")
        return memory_id


memory_service = MemoryService()