# backend/app/api/chat.py
from __future__ import annotations

import json
import logging
from fastapi import APIRouter, Depends, Header, HTTPException, Query
from fastapi.responses import StreamingResponse
from app.models.chat import ChatRequest, ResumeRequest, TaskCreatedResponse
from app.services.task import TaskService
from app.services.session import SessionService
from app.infra import task_bus
from app.core.hitl import build_decisions
from app.api.deps import get_current_user, get_task_service, get_session_service


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/chat", tags=["chat"])


def _format_sse(event: str, data: dict, entry_id: str | None = None) -> str:
    """格式化 SSE 消息。entry_id 作为 SSE 的 id 字段，客户端用来断点续传。"""
    lines = []
    if entry_id:
        lines.append(f"id: {entry_id}")
    lines.append(f"event: {event}")
    lines.append(f"data: {json.dumps(data, ensure_ascii=False)}")
    return "\n".join(lines) + "\n\n"


@router.post("/invoke", response_model=TaskCreatedResponse)
async def invoke(
    request: ChatRequest,
    user_id: str = Depends(get_current_user),
    task_svc: TaskService = Depends(get_task_service),
    session_svc: SessionService = Depends(get_session_service),
):
    """
    发送消息，创建后台 agent 任务。立即返回 task_id，客户端通过
    GET /api/chat/stream/{task_id} 订阅 SSE 事件流。

    注意：session 的隐式创建 / title 写入 / last_task_id 维护由 TaskService 统一
    负责（P-05 / P-06）。API 层只做用户活动 touch。
    """
    # session 存在时 touch（"用户活动"语义）；不存在会由 TaskService 负责 create
    if await session_svc.session_exists(request.session_id, user_id):
        await session_svc.touch(request.session_id, user_id)

    task_id = await task_svc.start_invoke(
        user_id=user_id,
        session_id=request.session_id,
        query=request.query,
        system_prompt=request.system_message,
    )
    return TaskCreatedResponse(
        task_id=task_id,
        session_id=request.session_id,
        status=task_bus.STATUS_RUNNING,
    )


@router.post("/resume", response_model=TaskCreatedResponse)
async def resume(
    request: ResumeRequest,
    task_svc: TaskService = Depends(get_task_service),
    session_svc: SessionService = Depends(get_session_service),
):
    """
    提交 HITL 决策，恢复已中断的 task。保持同一 task_id，事件流续接。

    来源：07/01_backendServer.py:176-291 (resume_agent)
          + 07/utils/tasks.py:513-636 (resume_agent_task)
    """
    meta = await task_bus.get_task_meta(request.task_id)
    if meta is None:
        raise HTTPException(status_code=404, detail=f"task {request.task_id} 不存在或已过期")
    if meta["status"] != task_bus.STATUS_INTERRUPTED:
        raise HTTPException(
            status_code=400,
            detail=f"task {request.task_id} 当前状态 {meta['status']}，无法恢复",
        )

    command_data = build_decisions(
        request.response_type, request.args, request.action_requests or []
    )
    await task_svc.start_resume(request.task_id, command_data)
    # P-06: resume 路径也刷 last_updated
    await session_svc.touch(meta["session_id"], meta["user_id"])

    return TaskCreatedResponse(
        task_id=request.task_id,
        session_id=meta["session_id"],
        status=task_bus.STATUS_RUNNING,
    )


@router.get("/stream/{task_id}")
async def stream(
    task_id: str,
    from_id: str | None = Query(default=None),
    last_event_id: str | None = Header(default=None, alias="Last-Event-ID"),
):
    """
    SSE 端点。从 Redis Stream 读取任务事件并推送给客户端。

    起点优先级：query(from_id) > header(Last-Event-ID) > "0"。
    """
    # Phase 12 D-01 / D-05：query > header > "0"。浏览器 EventSource 自动重连时会在
    # HTTP header 里带 Last-Event-ID，这条 fallback 让服务端无须前端改动就能续传。
    effective_from_id = from_id if from_id is not None else (last_event_id or "0")

    meta = await task_bus.get_task_meta(task_id)
    if meta is None:
        raise HTTPException(status_code=404, detail=f"task {task_id} 不存在或已过期")

    async def event_stream():
        async for entry_id, event, data in task_bus.read_events(
            task_id, from_id=effective_from_id
        ):
            yield _format_sse(event, data, entry_id=entry_id)
            if event in ("done", "error"):
                return

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # 禁用 nginx 缓冲
        },
    )
