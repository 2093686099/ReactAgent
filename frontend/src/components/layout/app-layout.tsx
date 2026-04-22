"use client";
import { type ReactNode, useEffect } from "react";
import { TodoDrawer } from "@/components/todo/todo-drawer";
import { useUIStore } from "@/stores/ui-store";

type AppLayoutProps = {
  children: ReactNode;
  sidebar: ReactNode;
};

export function AppLayout({ children, sidebar }: AppLayoutProps) {
  const drawerOpen = useUIStore((s) => s.todoDrawerOpen);

  useEffect(() => {
    void useUIStore.persist.rehydrate();
  }, []);

  const cols = drawerOpen
    ? "grid-cols-[268px_minmax(0,1fr)_320px]"
    : "grid-cols-[268px_minmax(0,1fr)]";

  return (
    <div
      className={`grid h-screen overflow-hidden ${cols} bg-[var(--color-bg-deepest)] text-[var(--color-text-primary)] transition-[grid-template-columns] duration-200 ease-out`}
    >
      {sidebar}
      <div className="min-w-0 border-l border-[var(--color-border-subtle)]">{children}</div>
      {drawerOpen && <TodoDrawer />}
    </div>
  );
}
