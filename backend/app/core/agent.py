# backend/app/core/agent.py
from __future__ import annotations

from deepagents import create_deep_agent
from deepagents.middleware.subagents import SubAgent
from deepagents.backends.store import StoreBackend
from langchain.agents.middleware.summarization import SummarizationMiddleware
from app.infra.database import db
from app.infra.llm import get_llm
from app.core.tools import (
    SQL_TOOL_INTERRUPT,
    get_custom_tools,
    get_hitl_config,
    get_mcp_tools,
    get_sql_tools,
)


class AgentService:
    """Agent 创建和生命周期管理 — 统一 invoke 和 resume 的 Agent 构建"""

    def __init__(self, checkpointer=None, store=None):
        self._checkpointer = checkpointer
        self._store = store

    async def create_agent(self, *, system_prompt: str | None = None):
        llm_chat = get_llm()
        mcp_tools = await get_mcp_tools()
        sql_tools = await get_sql_tools(llm_chat)
        custom_tools = get_custom_tools()
        interrupt_on = get_hitl_config(custom_tools)
        subagents: list[SubAgent] = []
        if mcp_tools:
            subagents.append(
                SubAgent(
                    name="researcher",
                    description="负责使用高德地图工具进行地理信息搜索、路线规划和周边查询",
                    system_prompt="你是一个地理信息调研助手，擅长使用地图工具查询地点、路线和周边信息。将调研结果整理为结构化摘要返回。",
                    tools=mcp_tools,
                )
            )
        if sql_tools:
            subagents.append(
                SubAgent(
                    name="data_analyst",
                    description=(
                        "负责使用 MySQL 工具查询本地数据库的表结构和业务数据。"
                        "执行 sql_db_query 时会触发 HITL 人工审批。"
                    ),
                    system_prompt=(
                        "你是一个数据库分析助手。每次接到任务，请按以下流程：\n"
                        "1. 先用 sql_db_list_tables 查看库内所有表（输入空字符串即可）；\n"
                        "2. 再用 sql_db_schema 查询相关表的字段和样例行；\n"
                        "3. 起草 SQL 后，用 sql_db_query_checker 复核语法和常见错误；\n"
                        "4. 最后用 sql_db_query 执行查询（会触发用户审批，请在描述中清晰说明用途）。\n"
                        "默认只生成 SELECT 查询；任何修改类语句（INSERT/UPDATE/DELETE/DDL）必须先在描述中显式标明意图。\n"
                        "返回结构化的结果摘要给主 Agent。"
                    ),
                    tools=sql_tools,
                    interrupt_on=SQL_TOOL_INTERRUPT,
                )
            )

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
            subagents=subagents,
        )