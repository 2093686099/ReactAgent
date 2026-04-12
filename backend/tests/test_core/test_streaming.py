# backend/tests/test_core/test_streaming.py
"""_extract_text 类型分支测试"""
from app.core.streaming import _extract_text


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
