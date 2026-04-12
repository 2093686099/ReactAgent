# backend/app/api/deps.py（新增公共依赖）
from app.config import settings


async def get_current_user() -> str:
    """
    获取当前用户 ID。
    当前阶段：返回 settings.default_user_id（单用户）。
    未来加登录：改为从 Authorization header 解析 JWT，返回真实 user_id。
    """
    return settings.default_user_id