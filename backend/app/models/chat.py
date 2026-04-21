# backend/app/models/chat.py
from __future__ import annotations

from pydantic import BaseModel
from typing import Dict, Any, Optional


class ChatRequest(BaseModel):
    """用户发送消息，启动新的后台 task"""
    session_id: str
    query: str
    system_message: Optional[str] = None


class SessionCreateRequest(BaseModel):
    """POST /api/sessions 请求体。所有字段都可选，body 可为空。

    - session_id 非空且已存在 → 幂等返回现有 session（不覆盖 created_at，P-07）
    - session_id 缺省 → 服务端 uuid
    - title 缺省 → 空串（首次 invoke 时由 TaskService 回填）
    - last_task_id 缺省 → None；SESS-04 撤销路径上由前端回传，
      用于恢复已删除但仍有 running/interrupted task 的会话（WR-02）
    """
    session_id: Optional[str] = None
    title: Optional[str] = None
    last_task_id: Optional[str] = None


class ResumeRequest(BaseModel):
    """HITL 恢复请求 — 针对已有 task_id"""
    task_id: str
    response_type: str          # approve / edit / reject
    args: Optional[Dict[str, Any]] = None
    action_requests: list[dict[str, Any]] | None = None  # 前端回传的中断上下文


class TaskCreatedResponse(BaseModel):
    """invoke/resume 立即返回的响应"""
    task_id: str
    session_id: str
    status: str  # "running"


class MemoryRequest(BaseModel):
    """写入长期记忆"""
    memory_info: str
    user_id: Optional[str] = None