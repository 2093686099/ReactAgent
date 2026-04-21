import { describe, it, expect } from "vitest";
import { groupSessions } from "@/lib/time-group";

interface SessionLike {
  id: string;
  title: string;
  created_at: number;
  last_updated: number;
  status: string;
  last_task_id?: string | null;
}

function mkSession(id: string, lastUpdatedSec: number): SessionLike {
  return {
    id,
    title: id,
    created_at: 0,
    last_updated: lastUpdatedSec,
    status: "idle",
    last_task_id: null,
  };
}

// 基准 now: 2026-04-20 10:00:00 (+08:00)
const NOW = new Date("2026-04-20T10:00:00+08:00").getTime();
const DAY = 24 * 3600 * 1000;

// 当地零点（0 时刻）— 必须和实现里 new Date(now).setHours(0,0,0,0) 一致
const TODAY_START = (() => {
  const d = new Date(NOW);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
})();
const YESTERDAY_START = TODAY_START - DAY;
const WEEK_START = TODAY_START - 7 * DAY;

describe("groupSessions", () => {
  it("returns empty array for empty input", () => {
    expect(groupSessions([], NOW)).toEqual([]);
  });

  it("populates all four buckets with one item each", () => {
    const sessions = [
      mkSession("t", NOW / 1000),
      mkSession("y", (YESTERDAY_START + 3600 * 1000) / 1000),
      mkSession("w", (TODAY_START - 3 * DAY) / 1000),
      mkSession("o", (TODAY_START - 30 * DAY) / 1000),
    ];
    const result = groupSessions(sessions, NOW);
    expect(result).toHaveLength(4);
    expect(result[0]).toMatchObject({ group: "today", label: "今天" });
    expect(result[0].items.map((s) => s.id)).toEqual(["t"]);
    expect(result[1]).toMatchObject({ group: "yesterday", label: "昨天" });
    expect(result[1].items.map((s) => s.id)).toEqual(["y"]);
    expect(result[2]).toMatchObject({ group: "week", label: "7 天内" });
    expect(result[2].items.map((s) => s.id)).toEqual(["w"]);
    expect(result[3]).toMatchObject({ group: "older", label: "更早" });
    expect(result[3].items.map((s) => s.id)).toEqual(["o"]);
  });

  it("sorts items within bucket by last_updated desc", () => {
    const earlier = mkSession("a", (TODAY_START + 1 * 3600 * 1000) / 1000);
    const later = mkSession("b", (TODAY_START + 5 * 3600 * 1000) / 1000);
    const result = groupSessions([earlier, later], NOW);
    expect(result).toHaveLength(1);
    expect(result[0].group).toBe("today");
    expect(result[0].items.map((s) => s.id)).toEqual(["b", "a"]);
  });

  it("today/yesterday boundary at midnight", () => {
    const atMidnight = mkSession("today-start", TODAY_START / 1000);
    const oneSecBefore = mkSession("yesterday-end", (TODAY_START - 1000) / 1000);
    const result = groupSessions([atMidnight, oneSecBefore], NOW);
    const today = result.find((g) => g.group === "today");
    const yesterday = result.find((g) => g.group === "yesterday");
    expect(today?.items.map((s) => s.id)).toEqual(["today-start"]);
    expect(yesterday?.items.map((s) => s.id)).toEqual(["yesterday-end"]);
  });

  it("week/older boundary at 7 days", () => {
    const atWeekStart = mkSession("week-start", WEEK_START / 1000);
    const oneSecBefore = mkSession("older-end", (WEEK_START - 1000) / 1000);
    const result = groupSessions([atWeekStart, oneSecBefore], NOW);
    const week = result.find((g) => g.group === "week");
    const older = result.find((g) => g.group === "older");
    expect(week?.items.map((s) => s.id)).toEqual(["week-start"]);
    expect(older?.items.map((s) => s.id)).toEqual(["older-end"]);
  });

  it("excludes empty buckets from result", () => {
    const onlyOlder = mkSession("x", (TODAY_START - 30 * DAY) / 1000);
    const result = groupSessions([onlyOlder], NOW);
    expect(result).toHaveLength(1);
    expect(result[0].group).toBe("older");
  });

  it("treats last_updated as seconds (multiplies by 1000)", () => {
    // 传入秒级时间戳（NOW 的秒级），应被识别为今天
    const s = mkSession("sec", NOW / 1000);
    const result = groupSessions([s], NOW);
    expect(result).toHaveLength(1);
    expect(result[0].group).toBe("today");
    expect(result[0].items.map((x) => x.id)).toEqual(["sec"]);
  });
});
