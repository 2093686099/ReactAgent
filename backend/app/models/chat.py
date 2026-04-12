# backend/app/models/chat.py
from pydantic import BaseModel
from typing import Dict, Any, Optional


class ChatRequest(BaseModel):
    """用户发送消息，启动新的后台 task"""
    session_id: str
    query: str
    system_message: Optional[str] = None


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