import { Check } from "lucide-react";
import type { Todo } from "@/lib/types";

export function TodoItem({ todo }: { todo: Todo }) {
  const textColor =
    todo.status === "completed"
      ? "text-[var(--color-text-quaternary)]"
      : todo.status === "in_progress"
        ? "text-[var(--color-text-primary)]"
        : "text-[var(--color-text-secondary)]";

  return (
    <div
      className="flex items-start gap-2.5 px-[18px] py-2 text-[13px] leading-[1.5]"
      style={{ animation: "todoEnter 200ms ease-out" }}
    >
      <span className="mt-[2px] inline-flex h-3.5 w-3.5 flex-none items-center justify-center">
        {todo.status === "pending" && <PendingCircle />}
        {todo.status === "in_progress" && <InProgressSpinner />}
        {todo.status === "completed" && <CompletedCircle />}
      </span>
      <span
        className={[
          "flex-1 min-w-0",
          textColor,
          todo.status === "completed" ? "line-through decoration-white/15" : "",
        ].join(" ")}
      >
        {todo.content}
      </span>
    </div>
  );
}

function PendingCircle() {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-3.5 w-3.5 rounded-full"
      style={{ border: "1.5px solid var(--color-border-standard)" }}
    />
  );
}

function InProgressSpinner() {
  return (
    <svg
      aria-hidden="true"
      className="h-3.5 w-3.5 animate-spin"
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
        stroke="var(--color-accent-violet)"
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
      className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-white"
      style={{
        backgroundColor: "var(--color-accent-violet)",
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.15)",
      }}
    >
      <Check size={10} strokeWidth={3} />
    </span>
  );
}
