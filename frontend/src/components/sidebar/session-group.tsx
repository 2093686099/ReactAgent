"use client";

import type { Session } from "@/lib/types";
import { SessionItem } from "./session-item";

interface Props {
  label: string;
  items: Session[];
  activeId: string;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

export function SessionGroup({ label, items, activeId, onSelect, onDelete }: Props) {
  return (
    <div className="mb-2.5 flex flex-col">
      <div className="flex items-center justify-between px-1 pb-1.5 pt-2 text-[10.5px] font-[510] uppercase tracking-[0.04em] text-[var(--color-text-quaternary)]">
        <span>{label}</span>
        <span className="rounded-[3px] bg-white/[0.03] px-1.5 py-px font-mono text-[10px] font-normal">
          {items.length}
        </span>
      </div>
      {items.map((s) => (
        <SessionItem
          key={s.id}
          session={s}
          active={s.id === activeId}
          onSelect={onSelect}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
