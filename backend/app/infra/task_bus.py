# backend/app/infra/task_bus.py
import json
import logging
from typing import AsyncGenerator, TypedDict
from app.infra.redis import redis_manager
from app.config import settings


logger = logging.getLogger(__name__)

STATUS_RUNNING = "running"
STATUS_INTERRUPTED = "interrupted"
STATUS_COMPLETED = "completed"
STATUS_ERROR = "error"
TERMINAL_STATUSES = {STATUS_INTERRUPTED, STATUS_COMPLETED, STATUS_ERROR}


class TaskMeta(TypedDict):
    task_id: str
    user_id: str
    session_id: str
    status: str


def _events_key(task_id: str) -> str:
    return f"task:{task_id}:events"


def _meta_key(task_id: str) -> str:
    return f"task:{task_id}"


async def _client():
    if redis_manager.client is None:
        raise RuntimeError("Redis 未初始化")
    return redis_manager.client


async def create_task_meta(task_id: str, user_id: str, session_id: str) -> None:
    """登记 task 元数据（Redis HASH）"""
    client = await _client()
    meta: TaskMeta = {
        "task_id": task_id,
        "user_id": user_id,
        "session_id": session_id,
        "status": STATUS_RUNNING,
    }
    await client.hset(_meta_key(task_id), mapping=meta)
    await client.expire(_meta_key(task_id), settings.task_ttl)


async def get_task_meta(task_id: str) -> TaskMeta | None:
    client = await _client()
    data = await client.hgetall(_meta_key(task_id))
    return data if data else None


async def set_task_status(task_id: str, status: str) -> None:
    client = await _client()
    key = _meta_key(task_id)
    exists = await client.exists(key)
    if not exists:
        logger.warning(f"set_task_status 找不到 task {task_id}")
        return
    await client.hset(key, "status", status)


async def publish_event(task_id: str, event: str, data: dict) -> str:
    """向任务事件流追加一条事件，返回 stream entry ID"""
    client = await _client()
    entry_id = await client.xadd(
        _events_key(task_id),
        {"event": event, "data": json.dumps(data, ensure_ascii=False)},
    )
    await client.expire(_events_key(task_id), settings.task_ttl)
    return entry_id


async def read_events(
    task_id: str,
    from_id: str = "0",
    block_ms: int = 5000,
) -> AsyncGenerator[tuple[str, str, dict], None]:
    """
    从任务事件流读取事件。

    Args:
        task_id: 任务 ID
        from_id: 起始位置（"0" 表示从头读）。客户端重连时传入上次最后 entry_id。
        block_ms: 每次阻塞读的超时（毫秒）。超时后会检查 task 状态决定是否退出。

    Yields:
        (entry_id, event_type, data) 三元组
    """
    client = await _client()
    last_id = from_id
    while True:
        entries = await client.xread(
            {_events_key(task_id): last_id},
            block=block_ms,
        )
        if not entries:
            # 超时无新事件 — 检查 task 是否已终结
            meta = await get_task_meta(task_id)
            if meta is None or meta.get("status") in TERMINAL_STATUSES:
                # 最后再 drain 一次，捕获超时窗口内的残留事件
                entries = await client.xread({_events_key(task_id): last_id}, block=0, count=100)
                if not entries:
                    return
            else:
                continue

        for _stream, msgs in entries:
            for entry_id, fields in msgs:
                last_id = entry_id
                event = fields.get("event", "")
                data = json.loads(fields.get("data", "{}"))
                yield entry_id, event, data