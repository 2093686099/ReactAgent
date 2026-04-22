import { create } from "zustand";
import { fetchSystemMeta } from "@/lib/api";
import type { SystemMeta } from "@/lib/types";

type State = {
  meta: SystemMeta | null;
  loading: boolean;
  error: string | null;
  // 防并发重复拉取（React strict mode 下 effect 会触发两次）
  _inflight: Promise<void> | null;
  load: () => Promise<void>;
  refresh: () => Promise<void>;
};

export const useSystemMetaStore = create<State>((set, get) => ({
  meta: null,
  loading: false,
  error: null,
  _inflight: null,

  load: async () => {
    const state = get();
    if (state.meta || state.loading) {
      return state._inflight ?? undefined;
    }
    return get().refresh();
  },

  refresh: async () => {
    const inflight = (async () => {
      set({ loading: true, error: null });
      try {
        const meta = await fetchSystemMeta();
        set({ meta, loading: false, _inflight: null });
      } catch (err) {
        set({
          loading: false,
          error: err instanceof Error ? err.message : "加载系统信息失败",
          _inflight: null,
        });
      }
    })();
    set({ _inflight: inflight });
    return inflight;
  },
}));
