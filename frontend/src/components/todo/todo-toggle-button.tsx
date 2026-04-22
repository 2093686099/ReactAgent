"use client";
import { ListTodo } from "lucide-react";
import { useUIStore } from "@/stores/ui-store";

export function TodoToggleButton() {
  const toggleDrawer = useUIStore((s) => s.toggleDrawer);
  const drawerOpen = useUIStore((s) => s.todoDrawerOpen);

  return (
    <button
      type="button"
      aria-label="切换任务面板"
      aria-pressed={drawerOpen}
      onClick={toggleDrawer}
      className="p-1.5 rounded hover:bg-[rgba(255,255,255,0.08)] transition-colors"
    >
      <ListTodo size={14} aria-hidden="true" className="text-[var(--color-text-tertiary)]" />
    </button>
  );
}
