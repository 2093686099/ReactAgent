# backend/tests/test_core/test_hitl.py
"""build_decisions 边界测试"""
import pytest
from app.core.hitl import build_decisions
from app.core.exceptions import InvalidDecisionError


def test_approve_single():
    """approve + 单个 action"""
    result = build_decisions("approve", None, [{"name": "tool1"}])
    assert result == {"decisions": [{"type": "approve"}]}


def test_approve_multiple():
    """approve + 3 个 action_requests → decisions 长度 3"""
    actions = [{"name": "t1"}, {"name": "t2"}, {"name": "t3"}]
    result = build_decisions("approve", None, actions)
    assert len(result["decisions"]) == 3
    assert all(d["type"] == "approve" for d in result["decisions"])


def test_reject_with_message():
    """reject + args 带 message"""
    result = build_decisions("reject", {"message": "不行"}, [{"name": "t1"}])
    assert result["decisions"][0]["type"] == "reject"
    assert result["decisions"][0]["message"] == "不行"


def test_reject_without_message():
    """reject + 无 args → decisions 无 message 键"""
    result = build_decisions("reject", None, [{"name": "t1"}])
    assert result["decisions"][0]["type"] == "reject"
    assert "message" not in result["decisions"][0]


def test_edit_valid():
    """edit + 合法 args"""
    args = {"edited_args": {"city": "北京"}, "name": "book_hotel"}
    result = build_decisions("edit", args, [{"name": "book_hotel"}])
    assert result["decisions"][0]["type"] == "edit"
    assert result["decisions"][0]["edited_action"]["name"] == "book_hotel"
    assert result["decisions"][0]["edited_action"]["args"] == {"city": "北京"}


def test_edit_multiple_actions_raises():
    """edit + 多个 action_requests → raises"""
    actions = [{"name": "t1"}, {"name": "t2"}]
    with pytest.raises(InvalidDecisionError, match="多工具调用不支持单次 edit"):
        build_decisions("edit", {"edited_args": {"a": 1}, "name": "t1"}, actions)


def test_edit_no_args_raises():
    """edit + args 为 None → raises"""
    with pytest.raises(InvalidDecisionError, match="edit 需要提供参数"):
        build_decisions("edit", None, [{"name": "t1"}])


def test_invalid_type_raises():
    """未知 response_type 'xyz' → raises"""
    with pytest.raises(InvalidDecisionError, match="不支持的响应类型"):
        build_decisions("xyz", None, [])


def test_accept_alias():
    """'accept' 别名 → 等价于 approve"""
    result = build_decisions("accept", None, [{"name": "t1"}])
    assert result == {"decisions": [{"type": "approve"}]}


def test_response_alias():
    """'response' 别名 → 等价于 reject"""
    result = build_decisions("response", {"message": "拒绝"}, [{"name": "t1"}])
    assert result["decisions"][0]["type"] == "reject"
    assert result["decisions"][0]["message"] == "拒绝"
