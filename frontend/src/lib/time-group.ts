import type { Session } from "@/lib/types";

export type TimeGroup = "today" | "yesterday" | "week" | "older";

export const GROUP_LABELS: Record<TimeGroup, string> = {
  today: "今天",
  yesterday: "昨天",
  week: "7 天内",
  older: "更早",
};

export interface GroupResult {
  group: TimeGroup;
  label: string;
  items: Session[];
}

function startOfToday(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * 把 sessions 按 last_updated 分到 today / yesterday / week / older 四桶。
 * 组内按 last_updated 倒序；空桶被过滤不返回。
 *
 * @param sessions 待分组会话列表
 * @param now      当前时间（毫秒），默认 Date.now()。测试中传入固定值避免时间漂移
 */
export function groupSessions(
  sessions: Session[],
  now: number = Date.now(),
): GroupResult[] {
  const todayStart = startOfToday(now);
  const yesterdayStart = todayStart - 24 * 3600 * 1000;
  const weekStart = todayStart - 7 * 24 * 3600 * 1000;

  const buckets: Record<TimeGroup, Session[]> = {
    today: [],
    yesterday: [],
    week: [],
    older: [],
  };

  for (const s of sessions) {
    const tsMs = s.last_updated * 1000; // 后端秒级 float → 毫秒
    if (tsMs >= todayStart) buckets.today.push(s);
    else if (tsMs >= yesterdayStart) buckets.yesterday.push(s);
    else if (tsMs >= weekStart) buckets.week.push(s);
    else buckets.older.push(s);
  }

  const order: TimeGroup[] = ["today", "yesterday", "week", "older"];
  return order
    .map((g) => ({
      group: g,
      label: GROUP_LABELS[g],
      items: buckets[g].sort((a, b) => b.last_updated - a.last_updated),
    }))
    .filter((r) => r.items.length > 0);
}
