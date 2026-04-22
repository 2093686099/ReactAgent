import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

type UIState = {
  todoDrawerOpen: boolean;
  hasAutoOpenedFor: Set<string>;
  toggleDrawer: () => void;
  openDrawer: () => void;
  closeDrawer: () => void;
  autoOpenDrawer: (sessionId: string) => void;
};

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      todoDrawerOpen: false,
      hasAutoOpenedFor: new Set<string>(),
      toggleDrawer: () => set((s) => ({ todoDrawerOpen: !s.todoDrawerOpen })),
      openDrawer: () => set({ todoDrawerOpen: true }),
      closeDrawer: () => set({ todoDrawerOpen: false }),
      autoOpenDrawer: (sessionId) =>
        set((s) => {
          if (s.hasAutoOpenedFor.has(sessionId)) return s;
          const next = new Set(s.hasAutoOpenedFor);
          next.add(sessionId);
          return { hasAutoOpenedFor: next, todoDrawerOpen: true };
        }),
    }),
    {
      name: "neuron-assistant:ui-store:v1",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (s) => ({ todoDrawerOpen: s.todoDrawerOpen }) as Partial<UIState>,
    },
  ),
);
