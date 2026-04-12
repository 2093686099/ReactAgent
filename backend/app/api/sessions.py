# backend/app/api/sessions.py
from fastapi import APIRouter, Depends, HTTPException
from app.api.deps import get_current_user
from app.services.session import session_service


router = APIRouter(prefix="/api/sessions", tags=["sessions"])


@router.get("")
async def list_sessions(user_id: str = Depends(get_current_user)):
    """来源：07/01_backendServer.py:328-346 get_agent_sessionids"""
    sessions = await session_service.list_sessions(user_id=user_id)
    return {"sessions": sessions}


@router.get("/active")
async def get_active_session(user_id: str = Depends(get_current_user)):
    """来源：07/01_backendServer.py:308-325 get_agent_active_sessionid"""
    session_id = await session_service.get_active_session_id(user_id=user_id)
    return {"active_session_id": session_id or ""}


@router.post("")
async def create_session(user_id: str = Depends(get_current_user)):
    """新增：显式创建会话端点"""
    session_id = await session_service.create_session(user_id=user_id)
    return {"session_id": session_id}


@router.delete("/{session_id}")
async def delete_session(
    session_id: str,
    user_id: str = Depends(get_current_user),
):
    """来源：07/01_backendServer.py:431-448 delete_agent_session"""
    if not await session_service.session_exists(session_id, user_id=user_id):
        raise HTTPException(status_code=404, detail=f"会话 {session_id} 不存在")
    await session_service.delete_session(session_id, user_id=user_id)
    return {"status": "success"}