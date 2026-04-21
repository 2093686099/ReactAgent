"use client";

import { useEffect } from "react";
import { Bot, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSessionStore } from "@/stores/session-store";
import { groupSessions } from "@/lib/time-group";
import { SessionGroup } from "./session-group";

interface Props {
  onSwitch: (id: string) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
}

export function Sidebar({ onSwitch, onDelete, onNew }: Props) {
  const sessions = useSessionStore((s) => s.sessions);
  const activeId = useSessionStore((s) => s.activeSessionId);
  const loadSessions = useSessionStore((s) => s.loadSessions);

  useEffect(() => {
    // 首次加载失败（后端未起）不阻塞 UI，页面仍可创建本地会话并发消息
    void loadSessions().catch(() => {});
  }, [loadSessions]);

  const groups = groupSessions(sessions);

  return (
    <aside className="flex h-screen flex-col gap-4 bg-[var(--color-bg-deepest)] p-4">
      <div className="flex items-center gap-2 text-[15px] font-[510] text-[var(--color-text-quaternary)]">
        <Bot size={16} />
        <span>AI Agent</span>
      </div>

      <Button
        type="button"
        variant="ghost"
        className="w-full justify-start text-[15px] font-[510] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
        onClick={onNew}
      >
        <Plus size={16} />
        新建会话
      </Button>

      <div className="flex flex-col gap-3 overflow-y-auto">
        {groups.map((g) => (
          <SessionGroup
            key={g.group}
            label={g.label}
            items={g.items}
            activeId={activeId}
            onSelect={onSwitch}
            onDelete={onDelete}
          />
        ))}
      </div>
    </aside>
  );
}
