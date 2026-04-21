"use client";

import { Trash2 } from "lucide-react";
import type { Session } from "@/lib/types";

interface Props {
  session: Session;
  active: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

export function SessionItem({ session, active, onSelect, onDelete }: Props) {
  const title = session.title || "新会话";
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(session.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(session.id);
        }
      }}
      className={[
        "group relative flex items-center justify-between gap-2",
        "h-8 px-3 rounded-md cursor-pointer",
        "text-[14px] font-[510]",
        "transition-colors",
        active
          ? "bg-[rgba(255,255,255,0.05)] text-[var(--color-text-primary)] border-l-2 border-l-[#5e6ad2]"
          : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]",
      ].join(" ")}
    >
      <span className="truncate">{title}</span>
      <button
        type="button"
        aria-label="删除会话"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(session.id);
        }}
        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-[rgba(255,255,255,0.08)]"
      >
        <Trash2 size={14} className="text-[var(--color-text-tertiary)]" />
      </button>
    </div>
  );
}
