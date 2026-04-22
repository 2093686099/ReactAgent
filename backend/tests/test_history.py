"""app.core.history 的单元测试。

注意：测试用 duck-typing fixture（tests/fixtures/checkpoint_factory.py），
原因参见 conftest.py 的模块顶层注释 —— langchain_core 整包被 mock 成 MagicMock，
导致 isinstance(msg, HumanMessage) 永远为 False，所以生产代码和测试都用 duck-typing。
"""
from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from tests.fixtures.checkpoint_factory import (
    make_ai,
    make_checkpoint_tuple,
    make_human,
    make_tool,
)


# ────────────────────────────────────────────
# messages_to_segments 纯函数单元测试
# ────────────────────────────────────────────


def test_messages_to_segments():
    """Human → AI(text) → AI(tool_calls)+ToolMessage → AI(text)
    应输出：1 个 user 气泡 + 1 个 assistant 气泡（segments=text/tool/text）。

    注意：现实 LangGraph 流中，tool_calls 放在一个 AIMessage，text 追加在另一个
    AIMessage。本测试用两个独立 AIMessage 表达，但 messages_to_segments 会把
    连续的 assistant 消息合并成同一气泡（不被 HumanMessage 打断）。
    """
    from app.core.history import messages_to_segments

    raw = [
        make_human("hi"),
        make_ai(content="你好"),
        make_ai(content="", tool_calls=[{"name": "done", "args": {}, "id": "c1"}]),
        make_tool(name="done", content="result-ok"),
        make_ai(content="已完成"),
    ]
    segs = messages_to_segments(raw)
    assert len(segs) == 2
    assert segs[0]["role"] == "user"
    assert segs[0]["segments"] == [{"type": "text", "content": "hi"}]
    assert segs[1]["role"] == "assistant"
    # 预期 segments 顺序：text("你好") → tool(done) → text("已完成")
    types = [(s["type"], s.get("content"), s.get("name"), s.get("status"))
             for s in segs[1]["segments"]]
    assert types == [
        ("text", "你好", None, None),
        ("tool", None, "done", "done"),
        ("text", "已完成", None, None),
    ]


def test_no_hitl_segment_in_history():
    """P-01：历史 **不还原** HITL segment，ToolMessage 只映射为 tool pill。"""
    from app.core.history import messages_to_segments

    raw = [
        make_human("查天气"),
        make_ai(content="", tool_calls=[{"name": "weather", "args": {"city": "NYC"}}]),
        make_tool(name="weather", content="sunny"),
    ]
    segs = messages_to_segments(raw)
    seg_types = set()
    for msg in segs:
        for s in msg["segments"]:
            seg_types.add(s["type"])
    assert "hitl" not in seg_types
    assert "tool" in seg_types


def test_rejected_tool_pill():
    """ToolMessage.content 以 '用户已主动取消' 开头 → tool segment status='rejected'"""
    from app.core.history import messages_to_segments

    raw = [
        make_human("删文件"),
        make_ai(content="", tool_calls=[{"name": "rm", "args": {"path": "/x"}}]),
        make_tool(name="rm", content="用户已主动取消该工具调用"),
    ]
    segs = messages_to_segments(raw)
    tool_seg = None
    for msg in segs:
        for s in msg["segments"]:
            if s["type"] == "tool":
                tool_seg = s
                break
    assert tool_seg is not None
    assert tool_seg["status"] == "rejected"


def test_long_history():
    """≥10 条消息 messages_to_segments 不抛异常；segments 类型均合法。"""
    from app.core.history import messages_to_segments

    raw: list = []
    for i in range(12):
        raw.append(make_human(f"q{i}"))
        raw.append(make_ai(content=f"a{i}"))
    segs = messages_to_segments(raw)
    assert len(segs) == 24
    for msg in segs:
        assert msg["role"] in {"user", "assistant"}
        for s in msg["segments"]:
            assert s["type"] in {"text", "tool"}


# ────────────────────────────────────────────
# load_history_for_session 集成测试（monkeypatch db.checkpointer + task_bus）
# ────────────────────────────────────────────


@pytest.mark.asyncio
async def test_truncate_when_active_task(monkeypatch):
    """active_task 非空 + 最末 AIMessage → truncate_after_active_task=True"""
    from app.core import history as history_mod

    raw = [make_human("hi"), make_ai(content="half answer...")]
    fake_ckptr = AsyncMock()
    fake_ckptr.aget_tuple = AsyncMock(return_value=make_checkpoint_tuple(raw))
    monkeypatch.setattr(history_mod.db, "checkpointer", fake_ckptr)

    # session 有 last_task_id，且 task_bus 报告 running/interrupted
    session_svc = AsyncMock()
    session_svc.get_session = AsyncMock(return_value={
        "session_id": "s1", "user_id": "u1", "title": "hi",
        "last_task_id": "t-1", "last_updated": 1.0,
    })
    monkeypatch.setattr(
        history_mod.task_bus, "get_task_meta",
        AsyncMock(return_value={
            "task_id": "t-1", "user_id": "u1", "session_id": "s1",
            "status": history_mod.task_bus.STATUS_INTERRUPTED,
        }),
    )

    result = await history_mod.load_history_for_session("u1", "s1", session_svc)
    assert result["active_task"] == {"task_id": "t-1", "status": "interrupted"}
    assert result["truncate_after_active_task"] is True
    assert len(result["messages"]) == 2


@pytest.mark.asyncio
async def test_messages_endpoint_returns_empty_todos(monkeypatch):
    """todos 字段始终存在；state 无 todos 键时返回 []（RESEARCH.md Pitfall 3）"""
    from app.core import history as history_mod

    raw = [make_human("hi"), make_ai(content="done")]
    fake_ckptr = AsyncMock()
    fake_ckptr.aget_tuple = AsyncMock(return_value=make_checkpoint_tuple(raw))  # 不传 todos
    monkeypatch.setattr(history_mod.db, "checkpointer", fake_ckptr)

    session_svc = AsyncMock()
    session_svc.get_session = AsyncMock(return_value={
        "session_id": "s1", "user_id": "u1", "title": "", "last_task_id": None,
    })

    result = await history_mod.load_history_for_session("u1", "s1", session_svc)
    assert result["todos"] == []


@pytest.mark.asyncio
async def test_messages_endpoint_returns_todos_from_checkpoint(monkeypatch):
    """state.todos 有内容时正确序列化为 {content, status} dict"""
    from app.core import history as history_mod

    raw = [make_human("plan 3 steps")]
    fake_todos = [
        {"content": "step A", "status": "completed"},
        {"content": "step B", "status": "in_progress"},
        {"content": "step C", "status": "pending"},
    ]
    fake_ckptr = AsyncMock()
    fake_ckptr.aget_tuple = AsyncMock(
        return_value=make_checkpoint_tuple(raw, todos=fake_todos)
    )
    monkeypatch.setattr(history_mod.db, "checkpointer", fake_ckptr)

    session_svc = AsyncMock()
    session_svc.get_session = AsyncMock(return_value={
        "session_id": "s1", "user_id": "u1", "title": "", "last_task_id": None,
    })

    result = await history_mod.load_history_for_session("u1", "s1", session_svc)
    assert len(result["todos"]) == 3
    assert result["todos"][0] == {"content": "step A", "status": "completed"}
    assert result["todos"][1]["status"] == "in_progress"
    assert result["todos"][2]["status"] == "pending"


@pytest.mark.asyncio
async def test_no_truncate_when_no_active_task(monkeypatch):
    """无 active_task → truncate_after_active_task=False，即便最末是 AIMessage。"""
    from app.core import history as history_mod

    raw = [make_human("hi"), make_ai(content="done")]
    fake_ckptr = AsyncMock()
    fake_ckptr.aget_tuple = AsyncMock(return_value=make_checkpoint_tuple(raw))
    monkeypatch.setattr(history_mod.db, "checkpointer", fake_ckptr)

    session_svc = AsyncMock()
    session_svc.get_session = AsyncMock(return_value={
        "session_id": "s1", "user_id": "u1", "title": "hi",
        "last_task_id": None,
    })

    result = await history_mod.load_history_for_session("u1", "s1", session_svc)
    assert result["active_task"] is None
    assert result["truncate_after_active_task"] is False
    assert result["todos"] == []


@pytest.mark.asyncio
async def test_load_history_when_checkpointer_is_none(monkeypatch):
    """db.checkpointer=None → 返回空壳，不抛异常。"""
    from app.core import history as history_mod

    monkeypatch.setattr(history_mod.db, "checkpointer", None)
    session_svc = AsyncMock()
    session_svc.get_session = AsyncMock(return_value=None)

    result = await history_mod.load_history_for_session("u1", "s-missing", session_svc)
    assert result["messages"] == []
    assert result["active_task"] is None
    assert result["truncate_after_active_task"] is False
    assert result["todos"] == []


@pytest.mark.asyncio
async def test_load_history_when_no_checkpoint(monkeypatch):
    """aget_tuple 返回 None → 返回空壳。"""
    from app.core import history as history_mod

    fake_ckptr = AsyncMock()
    fake_ckptr.aget_tuple = AsyncMock(return_value=None)
    monkeypatch.setattr(history_mod.db, "checkpointer", fake_ckptr)

    session_svc = AsyncMock()
    session_svc.get_session = AsyncMock(return_value={
        "session_id": "s1", "user_id": "u1", "title": "", "last_task_id": None,
    })

    result = await history_mod.load_history_for_session("u1", "s1", session_svc)
    assert result["messages"] == []
    assert result["active_task"] is None
    assert result["truncate_after_active_task"] is False
    assert result["todos"] == []
