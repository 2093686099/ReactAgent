# backend/tests/test_core/test_streaming.py
"""_extract_text 类型分支测试 + _extract_subagent sniff 测试"""
from app.core.streaming import _extract_subagent, _extract_text


def test_string():
    assert _extract_text("hello") == "hello"


def test_string_list():
    assert _extract_text(["a", "b"]) == "ab"


def test_dict_list():
    assert _extract_text([{"type": "text", "text": "x"}]) == "x"


def test_mixed_list():
    content = ["a", {"type": "text", "text": "b"}, {"type": "image"}]
    assert _extract_text(content) == "ab"


def test_none():
    assert _extract_text(None) == ""


def test_int():
    assert _extract_text(123) == ""


def test_empty_list():
    assert _extract_text([]) == ""


# ── _extract_subagent ─────────────────────────────────────────────

def test_subagent_full_json():
    assert (
        _extract_subagent('{"description": "find hotels", "subagent_type": "researcher"}')
        == "researcher"
    )


def test_subagent_partial_json():
    # streaming 场景：args 还没传完就能提前解出
    assert (
        _extract_subagent('{"description": "find", "subagent_type": "data_analyst"')
        == "data_analyst"
    )


def test_subagent_field_first():
    assert (
        _extract_subagent('{"subagent_type": "researcher", "description": ')
        == "researcher"
    )


def test_subagent_spaces_around_colon():
    assert _extract_subagent('"subagent_type"  :  "researcher"') == "researcher"


def test_subagent_not_present():
    assert _extract_subagent('{"description": "only desc"}') is None


def test_subagent_empty_string():
    assert _extract_subagent("") is None


def test_subagent_incomplete_value():
    # 值的引号还没收尾时不应误匹配
    assert _extract_subagent('{"subagent_type": "resea') is None
