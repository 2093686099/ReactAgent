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
        "group relative flex cursor-pointer items-center gap-2",
        "rounded-[5px] py-[6px] pl-3 pr-2.5 leading-[1.4]",
        "text-[12.5px] transition-colors duration-120",
        active
          ? "bg-[rgba(113,112,255,0.08)] text-[var(--color-text-primary)]"
          : "text-[var(--color-text-tertiary)] hover:bg-white/[0.03] hover:text-[var(--color-text-secondary)]",
      ].join(" ")}
    >
      {/* 左侧纵向规则线（方案 B 标志） */}
      <span
        aria-hidden="true"
        className="absolute inset-y-1.5 left-1 w-[2px] rounded-[2px]"
        style={{
          background: active ? "var(--color-accent-violet)" : "transparent",
        }}
      />
      <span
        className={[
          "flex-1 overflow-hidden text-ellipsis whitespace-nowrap",
          active ? "font-[510]" : "",
        ].join(" ")}
      >
        {title}
      </span>
      <button
        type="button"
        aria-label="删除会话"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(session.id);
        }}
        className="rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-white/[0.08]"
      >
        <Trash2 size={12} className="text-[var(--color-text-quaternary)]" />
      </button>
    </div>
  );
}
