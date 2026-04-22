# backend/app/api/system.py
"""系统元信息端点：当前 LLM 配置、可用工具列表，供前端 Sidebar 展示。

不暴露任何 api_key / base_url / 连接串等敏感信息。
"""
from __future__ import annotations

import logging

from fastapi import APIRouter

from app.core.tools import (
    SQL_TOOL_INTERRUPT,
    get_custom_tools,
    get_hitl_config,
    get_mcp_tools,
)
from app.infra.llm import get_model_info


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/system", tags=["system"])


@router.get("/meta")
async def meta():
    """返回 Agent 展示需要的系统元信息。

    结构：
    - llm: { provider, model }
    - tools: [ { name, category, hitl } ] — category 取 "custom" / "researcher" / "data_analyst"
    """
    # LLM
    llm_info = get_model_info()

    tools: list[dict] = []

    # 自定义工具（主 Agent 直接持有）
    custom_tools = get_custom_tools()
    custom_hitl = get_hitl_config(custom_tools)
    for t in custom_tools:
        name = getattr(t, "name", None)
        if not name:
            continue
        tools.append(
            {
                "name": name,
                "category": "custom",
                "hitl": bool(custom_hitl.get(name, False)),
            }
        )

    # MCP 工具（researcher 子 Agent）
    try:
        mcp_tools = await get_mcp_tools()
    except Exception as exc:
        logger.warning("获取 MCP 工具失败，meta 跳过：%s", exc)
        mcp_tools = []
    for t in mcp_tools:
        name = getattr(t, "name", None)
        if not name:
            continue
        tools.append(
            {
                "name": name,
                "category": "researcher",
                "hitl": False,
            }
        )

    # SQL 工具（data_analyst 子 Agent）—— 仅暴露名字，避免引入 LLM 依赖延长响应
    # 配置中定义的 SQL 工具名固定，直接从 SQL_TOOL_INTERRUPT 读取
    from app.config import settings

    if settings.mysql_uri:
        for name, needs_hitl in SQL_TOOL_INTERRUPT.items():
            tools.append(
                {
                    "name": name,
                    "category": "data_analyst",
                    "hitl": bool(needs_hitl),
                }
            )

    return {"llm": llm_info, "tools": tools}
