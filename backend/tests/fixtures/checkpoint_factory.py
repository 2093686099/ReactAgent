"""LangGraph Checkpoint fixtures for tests.

conftest.py 把整个 langchain_core 包 mock 成 MagicMock，结果 HumanMessage/AIMessage
变成可调用的 MagicMock（type(...).__name__ == "MagicMock"），测试里 duck-typing 判
断全部失效。

这里用 `type(name, (object,), {...})` 动态建类，让 `type(msg).__name__` 返回我们
想要的 "HumanMessage" / "AIMessage" / "ToolMessage"，刚好匹配 app/core/history.py
的 duck-typing 判断（与 app/core/streaming.py 同模式）。
"""
from __future__ import annotations

from types import SimpleNamespace
from typing import Any


def _make_msg_class(name: str):
    # 动态建类，名字决定 type(obj).__name__
    return type(name, (object,), {})


_HumanMessage = _make_msg_class("HumanMessage")
_AIMessage = _make_msg_class("AIMessage")
_ToolMessage = _make_msg_class("ToolMessage")


def make_human(content: str, msg_id: str | None = None):
    msg = _HumanMessage()
    msg.content = content
    if msg_id is not None:
        msg.id = msg_id
    return msg


def make_ai(
    content: str = "",
    tool_calls: list[dict[str, Any]] | None = None,
    msg_id: str | None = None,
):
    msg = _AIMessage()
    msg.content = content
    msg.tool_calls = tool_calls or []
    if msg_id is not None:
        msg.id = msg_id
    return msg


def make_tool(name: str, content: str, msg_id: str | None = None):
    msg = _ToolMessage()
    msg.name = name
    msg.content = content
    if msg_id is not None:
        msg.id = msg_id
    return msg


def make_checkpoint_tuple(messages: list[Any]):
    """构造一个与 AsyncPostgresSaver.aget_tuple() 返回值形状相同的对象。

    真实对象 shape: CheckpointTuple(checkpoint={"channel_values": {"messages": [...]}})
    """
    return SimpleNamespace(
        checkpoint={"channel_values": {"messages": messages}},
    )
