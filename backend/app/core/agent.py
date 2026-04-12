# backend/app/core/agent.py
from __future__ import annotations

from deepagents import create_deep_agent
from deepagents.middleware.subagents import SubAgent
from deepagents.backends.store import StoreBackend
from langchain.agents.middleware.summarization import SummarizationMiddleware
from app.infra.database import db
from app.infra.llm import get_llm
from app.core.tools import get_mcp_tools, get_custom_tools, get_hitl_config


class AgentService:
    """Agent 创建和生命周期管理 — 统一 invoke 和 resume 的 Agent 构建"""

    def __init__(self, checkpointer=None, store=None):
        self._checkpointer = checkpointer
        self._store = store

    async def create_agent(self, *, system_prompt: str | None = None):
        llm_chat, _ = get_llm()
        mcp_tools = await get_mcp_tools()
        custom_tools = get_custom_tools()
        interrupt_on = get_hitl_config(custom_tools)

        checkpointer = self._checkpointer or db.checkpointer
        store = self._store or db.store

        return create_deep_agent(
            model=llm_chat,
            tools=custom_tools,
            system_prompt=system_prompt,
            middleware=[
                SummarizationMiddleware(
                    model=llm_chat,
                    trigger=[("tokens", 3000), ("messages", 50)],
                    keep=("messages", 20),
                ),
            ],
            interrupt_on=interrupt_on,
            checkpointer=checkpointer,
            store=store,
            backend=StoreBackend(),
            subagents=[
                SubAgent(
                    name="researcher",
                    description="负责使用高德地图工具进行地理信息搜索、路线规划和周边查询",
                    system_prompt="你是一个地理信息调研助手，擅长使用地图工具查询地点、路线和周边信息。将调研结果整理为结构化摘要返回。",
                    tools=mcp_tools,
                ),
            ],
        )