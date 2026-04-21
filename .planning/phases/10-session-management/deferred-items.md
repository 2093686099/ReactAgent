# Phase 10 Deferred Items

Items discovered during execution but out-of-scope for the current tasks.

## Plan 10-01

- **backend/tests/test_main.py::test_configure_windows_event_loop_policy_*** (2 cases)
  Pre-existing failures unrelated to session management. On Python 3.9 + macOS,
  `asyncio.WindowsSelectorEventLoopPolicy` does not exist as an attribute, so
  `monkeypatch.setattr(main.asyncio, "WindowsSelectorEventLoopPolicy", ...)` raises
  AttributeError even before the logic under test runs. Confirmed present with
  `git stash` before applying Plan 10-01 changes. Needs `monkeypatch.setattr(..., raising=False)`
  or `sys.modules` patching — ticket for future maintenance plan.
