"use client";
import { useChatStore } from "@/stores/chat-store";
import { TodoItem } from "./todo-item";

export function TodoList() {
  const todos = useChatStore((s) => s.todos);

  if (todos.length === 0) {
    return (
      <div className="nice-scroll flex-1 overflow-y-auto">
        <div className="px-[18px] py-8 text-center text-[13px] text-[var(--color-text-quaternary)]">
          Agent 尚未制定任务计划
        </div>
      </div>
    );
  }

  return (
    <div className="nice-scroll flex-1 min-h-0 overflow-y-auto pb-4 pt-2.5">
      {todos.map((t, i) => (
        <TodoItem key={`${i}-${t.content}`} todo={t} />
      ))}
    </div>
  );
}
