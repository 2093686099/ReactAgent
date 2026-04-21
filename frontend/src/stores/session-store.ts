import { create } from "zustand";
import type { Session } from "@/lib/types";
import { createSessionAPI, deleteSession, listSessions } from "@/lib/api";

function newLocalId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `session-${Date.now()}`;
}

type SessionState = {
  sessions: Session[];
  activeSessionId: string; // 永远非空（首次进入页面 createLocal 兜底）
  deletedPending: Session | null; // 最近一次删除（8s 内可撤销）
  loadSessions: () => Promise<Session[]>;
  setActive: (id: string) => void;
  createLocal: () => string;
  deleteOptimistic: (id: string) => Promise<void>;
  restoreSession: (session: Session) => Promise<void>;
  clearDeletedPending: () => void;
  upsertSession: (session: Session) => void;
};

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  activeSessionId: newLocalId(),
  deletedPending: null,

  loadSessions: async () => {
    const sessions = await listSessions();
    set({ sessions });
    return sessions;
  },

  setActive: (id) => set({ activeSessionId: id }),

  createLocal: () => {
    const id = newLocalId();
    const nowSec = Date.now() / 1000;
    const placeholder: Session = {
      id,
      title: "",
      created_at: nowSec,
      last_updated: nowSec,
      status: "idle",
      last_task_id: null,
    };
    set((s) => ({
      sessions: [placeholder, ...s.sessions],
      activeSessionId: id,
    }));
    return id;
  },

  deleteOptimistic: async (id) => {
    const before = get().sessions;
    const target = before.find((s) => s.id === id) ?? null;
    set({
      sessions: before.filter((s) => s.id !== id),
      deletedPending: target,
    });
    try {
      await deleteSession(id);
    } catch (e) {
      // 后端失败 → 回滚本地列表，清掉 pending
      set({ sessions: before, deletedPending: null });
      throw e;
    }
  },

  restoreSession: async (session) => {
    // 幂等 POST：后端存在返回原记录，不存在则恢复占位
    // WR-02：回传 last_task_id，确保撤销后仍能 reattach 在途 HITL / running task
    try {
      await createSessionAPI({
        session_id: session.id,
        title: session.title,
        last_task_id: session.last_task_id ?? undefined,
      });
    } catch {
      // 8s 撤销窗口过短 & 撤销失败不重试；UI 可自行提示
    }
    set((s) => ({
      sessions: [session, ...s.sessions].sort(
        (a, b) => b.last_updated - a.last_updated,
      ),
      deletedPending: null,
    }));
  },

  clearDeletedPending: () => set({ deletedPending: null }),

  upsertSession: (session) =>
    set((s) => {
      const idx = s.sessions.findIndex((x) => x.id === session.id);
      if (idx === -1) return { sessions: [session, ...s.sessions] };
      const next = [...s.sessions];
      next[idx] = session;
      return { sessions: next };
    }),
}));
