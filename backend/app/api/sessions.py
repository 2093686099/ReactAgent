# backend/app/api/sessions.py
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from app.api.deps import get_current_user, get_session_service
from app.core.history import load_history_for_session
from app.models.chat import SessionCreateRequest
from app.services.session import SessionService


router = APIRouter(prefix="/api/sessions", tags=["sessions"])


@router.get("")
async def list_sessions(
    user_id: str = Depends(get_current_user),
    session_svc: SessionService = Depends(get_session_service),
):
    """SESS-01：列出当前用户所有 session，响应里每条含 title / last_updated /
    last_task_id（Phase 10 新增字段）。
    """
    sessions = await session_svc.list_sessions(user_id=user_id)
    return {"sessions": sessions}


@router.get("/active")
async def get_active_session(
    user_id: str = Depends(get_current_user),
    session_svc: SessionService = Depends(get_session_service),
):
    """来源：07/01_backendServer.py:308-325 get_agent_active_sessionid"""
    session_id = await session_svc.get_active_session_id(user_id=user_id)
    return {"active_session_id": session_id or ""}


@router.post("")
async def create_session(
    request: SessionCreateRequest = SessionCreateRequest(),
    user_id: str = Depends(get_current_user),
    session_svc: SessionService = Depends(get_session_service),
):
    """创建或幂等恢复 session（SESS-02 / SESS-04 撤销路径）。

    P-07 幂等语义：
    - request.session_id 非空且已存在 → 返回现有 session（保留 created_at）
    - 否则 → 新建
    - 空 body → 新建（server 分配 uuid）
    """
    if request.session_id and await session_svc.session_exists(
        request.session_id, user_id=user_id,
    ):
        existing = await session_svc.get_session(request.session_id, user_id=user_id)
        # session_exists=True 的前提下 get_session 不应为 None；保险起见处理
        return {
            "session_id": request.session_id,
            "title": (existing or {}).get("title", ""),
        }

    session_id = await session_svc.create_session(
        user_id=user_id,
        session_id=request.session_id,
        title=request.title or "",
    )
    return {"session_id": session_id, "title": request.title or ""}


@router.delete("/{session_id}")
async def delete_session(
    session_id: str,
    user_id: str = Depends(get_current_user),
    session_svc: SessionService = Depends(get_session_service),
):
    """SESS-04：仅删 Redis，不碰 Postgres checkpoint（支持撤销恢复）。"""
    if not await session_svc.session_exists(session_id, user_id=user_id):
        raise HTTPException(status_code=404, detail=f"会话 {session_id} 不存在")
    await session_svc.delete_session(session_id, user_id=user_id)
    return {"status": "success"}


@router.get("/{session_id}/messages")
async def get_messages(
    session_id: str,
    user_id: str = Depends(get_current_user),
    session_svc: SessionService = Depends(get_session_service),
):
    """CHAT-08：从 LangGraph checkpoint 还原历史消息 + 回填 active_task。

    跨用户访问防御（T-10-01 / T-10-02 mitigation）：
    - session_exists 严格绑定 user_id；非本用户拥有则返回 **404**（避免信息泄漏）。
    - detail 文案不暴露"归属另一用户" / "belongs to" 等敏感信息。
    """
    if not await session_svc.session_exists(session_id, user_id=user_id):
        raise HTTPException(status_code=404, detail="会话不存在")
    return await load_history_for_session(user_id, session_id, session_svc)
