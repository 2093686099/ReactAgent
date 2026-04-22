import { Check } from "lucide-react";
import type { Todo } from "@/lib/types";

export function TodoItem({ todo }: { todo: Todo }) {
  return (
    <div className="flex items-start gap-3 py-2 px-4 animate-[todoEnter_200ms_ease-out]">
      <span className="shrink-0 mt-0.5">
        {todo.status === "pending" && <PendingCircle />}
        {todo.status === "in_progress" && <InProgressSpinner />}
        {todo.status === "completed" && <CompletedCircle />}
      </span>
      <span className="text-[var(--color-text-secondary)] text-sm leading-5">
        {todo.content}
      </span>
    </div>
  );
}

function PendingCircle() {
  return (
    <span
      aria-hidden="true"
      className="inline-block w-4 h-4 rounded-full transition-all duration-150"
      style={{ border: "1.5px solid var(--color-border-standard)" }}
    />
  );
}

function InProgressSpinner() {
  return (
    <svg
      aria-hidden="true"
      className="w-4 h-4 animate-spin transition-all duration-150"
      style={{ animationDuration: "1s" }}
      viewBox="0 0 16 16"
    >
      <circle
        cx="8"
        cy="8"
        r="6.5"
        fill="none"
        stroke="var(--color-border-standard)"
        strokeWidth="1.5"
      />
      <path
        d="M 8 1.5 A 6.5 6.5 0 0 1 14.5 8"
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CompletedCircle() {
  return (
    <span
      aria-hidden="true"
      className="inline-flex w-4 h-4 rounded-full items-center justify-center transition-all duration-150"
      style={{ backgroundColor: "var(--color-accent)" }}
    >
      <Check size={12} strokeWidth={3} className="text-white" />
    </span>
  );
}
