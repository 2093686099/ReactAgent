"use client";

import { Bot, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useChatStore } from "@/stores/chat-store";

export function Sidebar() {
  const reset = useChatStore((state) => state.reset);

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
        onClick={reset}
      >
        <Plus size={16} />
        新建会话
      </Button>
    </aside>
  );
}
