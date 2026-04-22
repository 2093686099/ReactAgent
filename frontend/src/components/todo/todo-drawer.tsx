"use client";
import { X } from "lucide-react";
import { useUIStore } from "@/stores/ui-store";
import { TodoList } from "./todo-list";

export function TodoDrawer() {
  const closeDrawer = useUIStore((s) => s.closeDrawer);

  return (
    <aside className="flex h-screen flex-col bg-[var(--color-bg-panel)] border-l border-[var(--color-border-subtle)]">
      <header className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border-subtle)]">
        <span className="text-[13px] font-medium text-[var(--color-text-secondary)]">
          任务计划
        </span>
        <button
          type="button"
          aria-label="关闭任务面板"
          onClick={closeDrawer}
          className="p-1 rounded hover:bg-[rgba(255,255,255,0.08)] transition-colors"
        >
          <X size={14} aria-hidden="true" className="text-[var(--color-text-tertiary)]" />
        </button>
      </header>
      <TodoList />
    </aside>
  );
}
