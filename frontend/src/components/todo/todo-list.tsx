"use client";
import { useChatStore } from "@/stores/chat-store";
import { TodoItem } from "./todo-item";

export function TodoList() {
  const todos = useChatStore((s) => s.todos);

  if (todos.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-[15px] text-[var(--color-text-tertiary)]">
        Agent 尚未制定任务计划
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto py-2">
      {todos.map((t, i) => (
        <TodoItem key={`${i}-${t.content}`} todo={t} />
      ))}
    </div>
  );
}
