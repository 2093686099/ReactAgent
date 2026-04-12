# backend/app/services/task.py
from __future__ import annotations

import asyncio
import logging
import uuid
from typing import Any
from langgraph.types import Command
from app.infra import task_bus
from app.core.agent import AgentService
from app.core.streaming import parse_agent_events, EVT_HITL, EVT_DONE, EVT_ERROR
from app.core.exceptions import TaskNotFoundError, TaskStateError
from app.config import settings


logger = logging.getLogger(__name__)

AgentInput = dict[str, Any] | Command


class TaskService:
    """任务生命周期管理 — 后台执行 agent 并把事件写入 Redis Stream"""

    def __init__(self, agent_service: AgentService | None = None):
        self._agent_service = agent_service or AgentService()
        self._running: dict[str, asyncio.Task] = {}

    async def start_invoke(
        self,
        user_id: str,
        session_id: str,
        query: str,
        system_prompt: str | None = None,
    ) -> str:
        """启动一个新的 invoke 任务，返回 task_id"""
        task_id = str(uuid.uuid4())
        await task_bus.create_task_meta(task_id, user_id, session_id)
        agent_input = {"messages": [{"role": "user", "content": query}]}
        bg = asyncio.create_task(
            self._run_agent(task_id, agent_input, session_id, system_prompt),
            name=f"agent-{task_id}",
        )
        self._running[task_id] = bg
        bg.add_done_callback(lambda t: self._running.pop(task_id, None))
        return task_id

    async def start_resume(
        self,
        task_id: str,
        command_data: dict,
    ) -> None:
        """恢复已有的中断任务（保持同一 task_id，继续写入同一事件流）"""
        meta = await task_bus.get_task_meta(task_id)
        if meta is None:
            raise TaskNotFoundError(f"task {task_id} 不存在或已过期")
        if meta["status"] != task_bus.STATUS_INTERRUPTED:
            raise TaskStateError(f"task {task_id} 当前状态 {meta['status']}，无法 resume")
        await task_bus.set_task_status(task_id, task_bus.STATUS_RUNNING)

        bg = asyncio.create_task(
            self._run_agent(task_id, Command(resume=command_data), meta["session_id"], None),
            name=f"agent-resume-{task_id}",
        )
        self._running[task_id] = bg
        bg.add_done_callback(lambda t: self._running.pop(task_id, None))

    async def _run_agent(
        self,
        task_id: str,
        agent_input: AgentInput,
        session_id: str,
        system_prompt: str | None,
    ) -> None:
        """后台协程：创建 agent，解析事件，写入 task_bus"""
        try:
            agent = await self._agent_service.create_agent(system_prompt=system_prompt)
            hit_interrupt = False
            async for event, data in parse_agent_events(
                agent,
                agent_input,
                config={"configurable": {"thread_id": session_id}},
            ):
                await task_bus.publish_event(task_id, event, data)
                if event == EVT_HITL:
                    hit_interrupt = True
                    break
                if event == EVT_DONE:
                    break

            final_status = (
                task_bus.STATUS_INTERRUPTED if hit_interrupt else task_bus.STATUS_COMPLETED
            )
            await task_bus.set_task_status(task_id, final_status)
            logger.info(f"task {task_id} 结束，状态 {final_status}")

        except Exception as e:
            logger.exception(f"task {task_id} 执行失败")
            await task_bus.publish_event(task_id, EVT_ERROR, {"message": str(e)})
            await task_bus.set_task_status(task_id, task_bus.STATUS_ERROR)

    async def cancel_all(self) -> None:
        """取消所有运行中的 agent 后台任务（用于 shutdown）"""
        for task_id, t in self._running.items():
            logger.info(f"取消运行中的任务 {task_id}")
            t.cancel()
        if self._running:
            await asyncio.gather(*self._running.values(), return_exceptions=True)
            self._running.clear()
