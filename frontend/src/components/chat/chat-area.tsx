"use client";
import type { ReactNode } from "react";
import { ReconnectBanner } from "@/components/layout/reconnect-banner";
import { TodoToggleButton } from "@/components/todo/todo-toggle-button";

type ChatAreaProps = {
  children: ReactNode;
};

export function ChatArea({ children }: ChatAreaProps) {
  return (
    <section className="flex h-screen flex-col bg-[var(--color-bg-panel)]">
      <ReconnectBanner />
      <header className="flex items-center justify-end px-4 py-2 border-b border-[var(--color-border-subtle)]">
        <TodoToggleButton />
      </header>
      {children}
    </section>
  );
}
