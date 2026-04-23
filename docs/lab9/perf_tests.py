"""lab9 / task 2.1 — 性能基准测试。

沿用 invoke → stream SSE 的真实链路，度量：
- TTFT（time-to-first-token）：打到首个 token 事件的延时
- TTLT（time-to-last-token / done）：端到端完成时间
- token 数：流中 token 事件个数
"""
from __future__ import annotations

import asyncio
import json
import time

import httpx


BASE_URL = "http://localhost:8001"
USER_ID = "lab9_perf"


QUERIES = [
    "你好",
    "请解释什么是大语言模型",
    "Transformer 架构的核心组件有哪些？请详细说明。",
    "帮我计算 123 乘以 456 等于多少",
    "介绍一下你能做什么",
]


async def _session(client: httpx.AsyncClient) -> str:
    r = await client.post(
        f"{BASE_URL}/api/sessions",
        json={},
        headers={"X-User-Id": USER_ID},
    )
    r.raise_for_status()
    return r.json()["session_id"]


async def bench_one(client: httpx.AsyncClient, query: str) -> dict:
    sid = await _session(client)
    t0 = time.monotonic()
    resp = await client.post(
        f"{BASE_URL}/api/chat/invoke",
        json={"session_id": sid, "query": query},
        headers={"X-User-Id": USER_ID},
    )
    resp.raise_for_status()
    task_id = resp.json()["task_id"]

    first_token_ts: float | None = None
    tokens = 0
    events: list[str] = []
    async with client.stream(
        "GET",
        f"{BASE_URL}/api/chat/stream/{task_id}",
        headers={"X-User-Id": USER_ID},
        timeout=90,
    ) as s:
        current = None
        async for raw in s.aiter_lines():
            if raw is None:
                continue
            line = raw.strip()
            if not line:
                current = None
                continue
            if line.startswith("event:"):
                current = line.split(":", 1)[1].strip()
                events.append(current)
            elif line.startswith("data:"):
                if current == "token":
                    if first_token_ts is None:
                        first_token_ts = time.monotonic()
                    tokens += 1
            if current in ("done", "error"):
                break
    t_end = time.monotonic()
    return {
        "query": query[:40],
        "ttft_s": round((first_token_ts - t0), 2) if first_token_ts else None,
        "total_s": round(t_end - t0, 2),
        "tokens": tokens,
        "events": {k: events.count(k) for k in set(events)},
    }


async def main() -> None:
    async with httpx.AsyncClient(timeout=30) as client:
        # 串行基准
        serial: list[dict] = []
        print("===== 串行基准 =====")
        for q in QUERIES:
            r = await bench_one(client, q)
            serial.append(r)
            print(r)

        # 并发基准（3 路）
        print("\n===== 并发 3 路 =====")
        t0 = time.monotonic()
        parallel = await asyncio.gather(
            *(bench_one(client, q) for q in QUERIES[:3])
        )
        wall = round(time.monotonic() - t0, 2)
        for r in parallel:
            print(r)
        print(f"并发 3 路总耗时 (wall): {wall}s")

        avg_total = round(sum(r["total_s"] for r in serial) / len(serial), 2)
        avg_ttft = round(
            sum(r["ttft_s"] for r in serial if r["ttft_s"] is not None)
            / max(1, sum(1 for r in serial if r["ttft_s"] is not None)),
            2,
        )
        report = {
            "serial": serial,
            "parallel": {
                "cases": parallel,
                "wall_s": wall,
                "serial_wall_would_be_s": round(
                    sum(r["total_s"] for r in serial[:3]), 2
                ),
            },
            "summary": {
                "avg_total_s": avg_total,
                "avg_ttft_s": avg_ttft,
            },
        }
        with open("docs/lab9/perf_results.json", "w", encoding="utf-8") as f:
            json.dump(report, f, ensure_ascii=False, indent=2)
        print("\n结果已写入 docs/lab9/perf_results.json")


if __name__ == "__main__":
    asyncio.run(main())
