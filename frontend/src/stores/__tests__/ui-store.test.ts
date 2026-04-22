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

describe("ui-store basics", () => {
  it("initial state: drawer closed, Set empty", () => {
    const s = useUIStore.getState();
    expect(s.todoDrawerOpen).toBe(false);
    expect(s.hasAutoOpenedFor.size).toBe(0);
  });

  it("toggleDrawer flips boolean", () => {
    const { toggleDrawer } = useUIStore.getState();
    toggleDrawer();
    expect(useUIStore.getState().todoDrawerOpen).toBe(true);
    toggleDrawer();
    expect(useUIStore.getState().todoDrawerOpen).toBe(false);
  });

  it("openDrawer / closeDrawer are idempotent", () => {
    const { openDrawer, closeDrawer } = useUIStore.getState();
    openDrawer();
    openDrawer();
    expect(useUIStore.getState().todoDrawerOpen).toBe(true);
    closeDrawer();
    closeDrawer();
    expect(useUIStore.getState().todoDrawerOpen).toBe(false);
  });
});
