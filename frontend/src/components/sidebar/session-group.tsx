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
    <div className="flex flex-col gap-0.5">
      <div className="px-3 py-1 text-[12px] font-[510] text-[var(--color-text-quaternary)] uppercase tracking-wide">
        {label}
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
