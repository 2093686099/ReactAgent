"""从 LangGraph checkpoint 还原前端 Message[]。

设计要点：
- 用 duck-typing（`type(msg).__name__`）识别消息类型，与 app/core/streaming.py 保持
  同模式。原因见 tests/conftest.py 顶注：整个 langchain_core 包被 mock 成 MagicMock，
  `isinstance(msg, HumanMessage)` 永远为 False。
- 历史 **不还原 HITL**（P-01）：ToolMessage 只映射为 tool pill，默认 `status="done"`；
  若 ToolMessage.content 以 reject 前缀开头 → `status="rejected"`。
- 连续 assistant 消息（AIMessage + ToolMessage）合并到同一 "assistant" 气泡，直到
  遇到下一个 HumanMessage 才重置。
"""
from __future__ import annotations

from typing import Any

from app.infra import task_bus
from app.infra.database import db

REJECT_PREFIX = "用户已主动取消"  # 与 frontend/src/app/page.tsx 的 reject 模板关键前缀对齐


def _extract_text(content: Any) -> str:
    """LangChain Message.content 可能是 str 或 list[str | {type:'text', text:...}]."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                parts.append(item.get("text", ""))
        return "".join(parts)
    return ""


def messages_to_segments(raw_messages: list[Any]) -> list[dict]:
    """LangGraph checkpoint 的 BaseMessage 列表 → 前端 Message[]（segments 模型）。

    规则：
    - HumanMessage → 独立 user 气泡，segments=[text]
    - AIMessage / ToolMessage → 合并到当前 assistant 气泡
    - AIMessage.content 非空 → append text segment
    - AIMessage.tool_calls → 每个 append tool segment(status="done")
    - ToolMessage → 找到最后一个同名 tool segment；若 content 以 reject 前缀开头，
      标记为 rejected
    """
    result: list[dict] = []
    current_ai: dict | None = None  # 当前正在拼装的 assistant 气泡

    for idx, msg in enumerate(raw_messages):
        tname = type(msg).__name__
        content_raw = getattr(msg, "content", "")
        content = _extract_text(content_raw)

        if tname == "HumanMessage":
            current_ai = None
            result.append({
                "id": f"user-{getattr(msg, 'id', idx)}",
                "role": "user",
                "segments": [{"type": "text", "content": content}],
                "timestamp": 0,
            })
        elif tname == "AIMessage":
            if current_ai is None:
                current_ai = {
                    "id": f"assistant-{getattr(msg, 'id', idx)}",
                    "role": "assistant",
                    "segments": [],
                    "timestamp": 0,
                }
                result.append(current_ai)
            if content:
                current_ai["segments"].append({"type": "text", "content": content})
            for tc in (getattr(msg, "tool_calls", None) or []):
                tool_name = tc.get("name") if isinstance(tc, dict) else getattr(tc, "name", None)
                if tool_name:
                    current_ai["segments"].append(
                        {"type": "tool", "name": tool_name, "status": "done"}
                    )
        elif tname == "ToolMessage":
            if current_ai is None:
                # 保守处理：未知场景（如 checkpoint 起始就是 ToolMessage），起新 assistant 气泡
                current_ai = {
                    "id": f"assistant-{idx}",
                    "role": "assistant",
                    "segments": [],
                    "timestamp": 0,
                }
                result.append(current_ai)
            tool_name = getattr(msg, "name", None) or ""
            is_reject = isinstance(content, str) and content.startswith(REJECT_PREFIX)
            if is_reject:
                # 找到最后一个匹配 name 的 tool segment，改 rejected
                for seg in reversed(current_ai["segments"]):
                    if seg.get("type") == "tool" and seg.get("name") == tool_name:
                        seg["status"] = "rejected"
                        break
        # 其他类型（SystemMessage 等）忽略
    return result


async def load_history_for_session(
    user_id: str,
    session_id: str,
    session_svc,
) -> dict:
    """读 session.last_task_id + checkpoint，组装 loadHistory 响应体。

    返回：{messages, active_task, truncate_after_active_task}
    - active_task：session.last_task_id 对应的 task 若状态为 running/interrupted，
      则回填 {task_id, status}；否则 None。
    - truncate_after_active_task：active_task 存在 且 checkpoint 最末 AIMessage →
      true（P-02 降级规则，精确匹配留给后续 Phase）。
    """
    session = await session_svc.get_session(session_id, user_id)
    active_task: dict | None = None
    if session:
        last_tid = session.get("last_task_id")
        if last_tid:
            meta = await task_bus.get_task_meta(last_tid)
            if meta and meta.get("status") in (
                task_bus.STATUS_RUNNING,
                task_bus.STATUS_INTERRUPTED,
            ):
                active_task = {"task_id": last_tid, "status": meta["status"]}

    # checkpointer 未初始化（比如测试环境或启动期）→ 返回空壳
    if db.checkpointer is None:
        return {
            "messages": [],
            "active_task": active_task,
            "truncate_after_active_task": False,
        }

    config = {"configurable": {"thread_id": session_id}}
    ckpt_tuple = await db.checkpointer.aget_tuple(config)
    if ckpt_tuple is None:
        return {
            "messages": [],
            "active_task": active_task,
            "truncate_after_active_task": False,
        }

    raw = (ckpt_tuple.checkpoint or {}).get("channel_values", {}).get("messages", []) or []
    truncate = bool(
        active_task is not None
        and raw
        and type(raw[-1]).__name__ == "AIMessage"
    )
    return {
        "messages": messages_to_segments(raw),
        "active_task": active_task,
        "truncate_after_active_task": truncate,
    }
