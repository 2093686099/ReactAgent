# backend/app/core/hitl.py
from __future__ import annotations

from app.core.exceptions import InvalidDecisionError


def build_decisions(response_type: str, args: dict | None, action_requests: list) -> dict:
    """
    将前端的 approve/edit/reject 转换为 Command(resume=...) 所需的 decisions 结构。
    来源：07/01_backendServer.py:218-271
    """
    # 兼容历史值
    response_type = (response_type or "").lower().strip()
    if response_type == "accept":
        response_type = "approve"
    elif response_type == "response":
        response_type = "reject"

    if response_type not in {"approve", "edit", "reject"}:
        raise InvalidDecisionError(f"不支持的响应类型: {response_type}")

    count = len(action_requests) if action_requests else 1

    if response_type == "approve":
        return {"decisions": [{"type": "approve"} for _ in range(count)]}

    if response_type == "reject":
        message = None
        if args:
            message = args.get("message") or args.get("args")
        decision = {"type": "reject"}
        if message:
            decision["message"] = message
        return {"decisions": [decision for _ in range(count)]}

    # edit
    if count != 1:
        raise InvalidDecisionError("多工具调用不支持单次 edit")
    if not args:
        raise InvalidDecisionError("edit 需要提供参数")

    edited_args = args.get("edited_args") or args.get("args")
    if not isinstance(edited_args, dict):
        raise InvalidDecisionError("edited_args 必须是 JSON 对象")

    tool_name = args.get("name")
    if not tool_name and action_requests:
        tool_name = action_requests[0].get("name")

    return {"decisions": [{"type": "edit", "edited_action": {"name": tool_name, "args": edited_args}}]}