"use client";
import { MoreHorizontal, Share2 } from "lucide-react";
import type { ReactNode } from "react";
import { ReconnectBanner } from "@/components/layout/reconnect-banner";
import { TodoToggleButton } from "@/components/todo/todo-toggle-button";
import { useChatStore } from "@/stores/chat-store";
import { useSessionStore } from "@/stores/session-store";

type ChatAreaProps = {
  children: ReactNode;
};

function formatTime(secs: number): string {
  const d = new Date(secs * 1000);
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  const pad = (n: number) => n.toString().padStart(2, "0");
  const hhmm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return sameDay ? `今天 ${hhmm}` : `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${hhmm}`;
}

export function ChatArea({ children }: ChatAreaProps) {
  const activeId = useSessionStore((s) => s.activeSessionId);
  const sessions = useSessionStore((s) => s.sessions);
  const messageCount = useChatStore((s) => s.messages.length);

  const active = sessions.find((s) => s.id === activeId);
  const title = active?.title || "新会话";
  const meta =
    active?.last_updated != null
      ? `${messageCount} 条消息 · ${formatTime(active.last_updated)}`
      : `${messageCount} 条消息`;

  return (
    <section className="flex h-screen min-w-0 flex-col bg-[var(--color-bg-panel)]">
      <ReconnectBanner />
      <header className="flex items-center justify-between gap-3 border-b border-[var(--color-border-subtle)] px-5 py-2.5">
        <div className="flex min-w-0 items-baseline gap-3">
          <span className="truncate text-[14px] font-[510] tracking-[-0.182px] text-[var(--color-text-primary)]">
            {title}
          </span>
          <span className="truncate text-[11.5px] text-[var(--color-text-quaternary)]">{meta}</span>
        </div>
        <div className="flex flex-none items-center gap-1">
          <TodoToggleButton />
          <HeaderIconButton ariaLabel="分享">
            <Share2 size={13} aria-hidden="true" />
          </HeaderIconButton>
          <HeaderIconButton ariaLabel="更多">
            <MoreHorizontal size={13} aria-hidden="true" />
          </HeaderIconButton>
        </div>
      </header>
      {children}
    </section>
  );
}

function HeaderIconButton({
  children,
  ariaLabel,
  onClick,
}: {
  children: ReactNode;
  ariaLabel: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      title={ariaLabel}
      onClick={onClick}
      className="inline-flex h-[26px] w-[26px] items-center justify-center rounded-[5px] text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
    >
      {children}
    </button>
  );
}
