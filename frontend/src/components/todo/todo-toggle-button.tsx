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
      title="任务计划"
      onClick={toggleDrawer}
      className={[
        "inline-flex h-[26px] w-[26px] items-center justify-center rounded-[5px] transition-colors",
        drawerOpen
          ? "bg-[rgba(113,112,255,0.12)] text-[var(--color-accent-hover)]"
          : "text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]",
      ].join(" ")}
    >
      <ListTodo size={13} aria-hidden="true" />
    </button>
  );
}
