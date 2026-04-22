"use client";
import { useEffect, type ReactNode } from "react";
import { useUIStore } from "@/stores/ui-store";
import { TodoDrawer } from "@/components/todo/todo-drawer";

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
    ? "grid-cols-[240px_1fr_320px]"
    : "grid-cols-[240px_1fr]";

  return (
    <div
      className={`grid min-h-screen ${cols} bg-[var(--color-bg-panel)] text-[var(--color-text-primary)] transition-[grid-template-columns] duration-200 ease-out`}
    >
      {sidebar}
      <div className="border-l border-[var(--color-border-subtle)]">{children}</div>
      {drawerOpen && <TodoDrawer />}
    </div>
  );
}
