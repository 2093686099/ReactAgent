"use client";
import { X } from "lucide-react";
import { useChatStore } from "@/stores/chat-store";
import { useUIStore } from "@/stores/ui-store";
import { TodoList } from "./todo-list";

export function TodoDrawer() {
  const closeDrawer = useUIStore((s) => s.closeDrawer);
  const todos = useChatStore((s) => s.todos);
  const total = todos.length;
  const done = todos.filter((t) => t.status === "completed").length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <aside
      className="flex h-screen min-h-0 flex-col border-l border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)]"
      style={{ animation: "drawer-in 220ms ease" }}
    >
      <header className="flex items-center justify-between border-b border-[var(--color-border-subtle)] pb-2.5 pl-[18px] pr-3.5 pt-2.5">
        <div className="flex items-baseline gap-2.5">
          <span className="text-[13px] font-[510] tracking-[-0.182px] text-[var(--color-text-primary)]">
            任务计划
          </span>
          {total > 0 ? (
            <span className="font-mono text-[11px] text-[var(--color-text-quaternary)]">
              {done} / {total}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          aria-label="关闭任务面板"
          onClick={closeDrawer}
          className="inline-flex h-[26px] w-[26px] items-center justify-center rounded-[5px] text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
        >
          <X size={13} aria-hidden="true" />
        </button>
      </header>

      {/* 进度条 */}
      <div className="h-[2px] bg-white/[0.04]">
        <div
          className="h-full transition-[width] duration-300 ease-out"
          style={{
            width: `${pct}%`,
            background: "linear-gradient(90deg, var(--color-accent), var(--color-accent-violet))",
            boxShadow: pct > 0 ? "0 0 8px rgba(113,112,255,0.5)" : "none",
          }}
        />
      </div>

      <TodoList />
    </aside>
  );
}
