# backend/app/core/agent.py
from __future__ import annotations

from deepagents import create_deep_agent
from deepagents.middleware.subagents import SubAgent
from deepagents.backends.store import StoreBackend
from langchain.agents.middleware.summarization import SummarizationMiddleware
from app.infra.database import db
from app.infra.llm import get_llm
from app.core.prompts import DEFAULT_SYSTEM_PROMPT
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
        """构建主 Agent。system_prompt 默认使用 DEFAULT_SYSTEM_PROMPT；
        传入非 None 值时覆盖（测试或未来的 per-user 定制用）。"""
        effective_prompt = system_prompt if system_prompt is not None else DEFAULT_SYSTEM_PROMPT
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
                    system_prompt=(
                        "你是主 Agent 委派的地理信息调研助手，底层工具是高德地图 MCP。\n"
                        "收到任务后，先把主 Agent 给的目标拆清楚：起点/终点、半径、类别、偏好；"
                        "然后一次性规划好所需的地图查询序列（地理编码 → 路线 / POI 搜索 → 详情补全），"
                        "尽量在一轮内跑完，不要零散地反复回去问主 Agent。\n"
                        "高德免费额度约 2 QPS，同类查询请成批但有节制地发起。\n"
                        "返回结构化摘要，建议包含：核心答案（直接回应主 Agent 的问题）、"
                        "关键数值/POI 列表（名称、地址、距离或耗时等）、"
                        "简短路线或位置说明、数据来源标注'高德'。\n"
                        "不要编造坐标、距离、营业时间等字段；工具没返回的就如实说没有。"
                    ),
                    tools=mcp_tools,
                )
            )
        if sql_tools:
            subagents.append(
                SubAgent(
                    name="data_analyst",
                    description=(
                        "负责使用 MySQL 工具查询本地数据库的表结构和业务数据，"
                        "默认只读（SELECT），按 list_tables → schema → checker → query 的流程执行。"
                    ),
                    system_prompt=(
                        "你是主 Agent 委派的数据库分析助手，底层是本地 MySQL。\n"
                        "每次接到任务，按下面的顺序走：\n"
                        "1. `sql_db_list_tables`（输入空字符串）列出库内所有表，定位相关表；\n"
                        "2. `sql_db_schema` 查看目标表的字段和样例行，确认列名与类型；\n"
                        "3. 起草 SQL 后用 `sql_db_query_checker` 校验语法与常见错误；\n"
                        "4. 校验通过再用 `sql_db_query` 执行，执行前在思考中清楚说明这条查询的用途。\n"
                        "默认只生成 SELECT 查询，并在合适时加 LIMIT 防止结果过大。\n"
                        "任何修改类语句（INSERT / UPDATE / DELETE / DDL）必须是主 Agent 在任务描述中明确要求才能生成，且要在描述中显式标明意图。\n"
                        "返回结构化摘要：使用的表与字段、最终 SQL、关键结果（行数、聚合值或 top-N 列表）、如有异常一并说明。"
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
            system_prompt=effective_prompt,
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