from __future__ import annotations

from unittest.mock import MagicMock

from app import main


def test_configure_windows_event_loop_policy_sets_selector_policy(monkeypatch):
    set_policy = MagicMock()
    selector_policy = MagicMock(return_value="selector-policy")

    monkeypatch.setattr(main.sys, "platform", "win32")
    monkeypatch.setattr(main.asyncio, "set_event_loop_policy", set_policy)
    monkeypatch.setattr(main.asyncio, "WindowsSelectorEventLoopPolicy", selector_policy)

    main.configure_windows_event_loop_policy()

    selector_policy.assert_called_once_with()
    set_policy.assert_called_once_with("selector-policy")


def test_configure_windows_event_loop_policy_skips_non_windows(monkeypatch):
    set_policy = MagicMock()
    selector_policy = MagicMock()

    monkeypatch.setattr(main.sys, "platform", "linux")
    monkeypatch.setattr(main.asyncio, "set_event_loop_policy", set_policy)
    monkeypatch.setattr(main.asyncio, "WindowsSelectorEventLoopPolicy", selector_policy)

    main.configure_windows_event_loop_policy()

    selector_policy.assert_not_called()
    set_policy.assert_not_called()
