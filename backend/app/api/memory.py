# backend/app/api/memory.py
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from app.api.deps import get_current_user
from app.services.memory import memory_service


router = APIRouter(prefix="/api/memory", tags=["memory"])


class MemoryWriteRequest(BaseModel):
    memory_info: str


@router.post("")
async def write_memory(
    request: MemoryWriteRequest,
    user_id: str = Depends(get_current_user),
):
    """来源：07/01_backendServer.py:401-428 write_long_term"""
    memory_id = await memory_service.write(request.memory_info, user_id=user_id)
    return {"status": "success", "memory_id": memory_id}


@router.get("")
async def read_memory(user_id: str = Depends(get_current_user)):
    """新增：读取当前用户全部长期记忆（07 只有 write，read 在 agent 内部调用）"""
    content = await memory_service.read(user_id=user_id)
    return {"memory": content}