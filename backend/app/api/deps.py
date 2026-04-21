# backend/app/api/deps.py（公共依赖 + 服务 provider）
from __future__ import annotations

from app.config import settings
from app.services.task import TaskService
from app.services.session import SessionService
from app.services.memory import MemoryService


async def get_current_user() -> str:
    """
    获取当前用户 ID。
    当前阶段：返回 settings.default_user_id（单用户）。
    未来加登录：改为从 Authorization header 解析 JWT，返回真实 user_id。
    """
    return settings.default_user_id


_task_service: TaskService | None = None
_session_service: SessionService | None = None
_memory_service: MemoryService | None = None


def get_session_service() -> SessionService:
    global _session_service
    if _session_service is None:
        _session_service = SessionService()
    return _session_service


def get_task_service() -> TaskService:
    global _task_service
    if _task_service is None:
        # 注入同一个 SessionService singleton，保证 TaskService 写 title / last_task_id
        # 与 API 层 session_svc 命中同一份 Redis 逻辑路径（方便测试 monkeypatch）。
        _task_service = TaskService(session_service=get_session_service())
    return _task_service


def get_memory_service() -> MemoryService:
    global _memory_service
    if _memory_service is None:
        _memory_service = MemoryService()
    return _memory_service