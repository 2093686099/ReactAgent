import { describe, it, expect, beforeEach, vi } from "vitest";
import { useUIStore } from "@/stores/ui-store";

beforeEach(() => {
  const mem = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
    key: () => null,
    length: 0,
  });
  useUIStore.setState({
    todoDrawerOpen: false,
    hasAutoOpenedFor: new Set<string>(),
  });
});

describe("ui-store autoOpenDrawer semantics", () => {
  it("first autoOpenDrawer for sessionId opens drawer + tracks id", () => {
    useUIStore.getState().autoOpenDrawer("s1");
    const s = useUIStore.getState();
    expect(s.todoDrawerOpen).toBe(true);
    expect(s.hasAutoOpenedFor.has("s1")).toBe(true);
  });

  it("repeated autoOpenDrawer on same sessionId is idempotent (no state change)", () => {
    const { autoOpenDrawer } = useUIStore.getState();
    autoOpenDrawer("s1");
    autoOpenDrawer("s1");
    autoOpenDrawer("s1");
    expect(useUIStore.getState().hasAutoOpenedFor.size).toBe(1);
  });

  it("user close then autoOpenDrawer on SAME sessionId keeps drawer closed", () => {
    const { autoOpenDrawer, closeDrawer } = useUIStore.getState();
    autoOpenDrawer("s1");       // opens
    closeDrawer();              // user closes
    autoOpenDrawer("s1");       // must NOT reopen — D-02 硬约束
    expect(useUIStore.getState().todoDrawerOpen).toBe(false);
  });

  it("different sessionId triggers a fresh auto-open even after prior close", () => {
    const { autoOpenDrawer, closeDrawer } = useUIStore.getState();
    autoOpenDrawer("s1");
    closeDrawer();
    autoOpenDrawer("s2");       // different sessionId → opens
    const s = useUIStore.getState();
    expect(s.todoDrawerOpen).toBe(true);
    expect(s.hasAutoOpenedFor.has("s2")).toBe(true);
  });

  it("autoOpenDrawer is the ONLY path that mutates hasAutoOpenedFor (SSE-only contract)", () => {
    // 这条测试的意图：store 本身不提供"其他路径触发 auto-open"的后门
    // 未来若有人把 setTodos 或 loadHistory 偷偷挂到 ui-store，本测试锁死：
    // 除非显式调 autoOpenDrawer，Set 保持空
    const initial = useUIStore.getState();
    // 穷举 store 暴露的 action，除 autoOpenDrawer 外均不应改 hasAutoOpenedFor
    initial.toggleDrawer();
    initial.openDrawer();
    initial.closeDrawer();
    expect(useUIStore.getState().hasAutoOpenedFor.size).toBe(0);
  });
});
