import type { ReactNode } from "react";

type ChatAreaProps = {
  children: ReactNode;
};

export function ChatArea({ children }: ChatAreaProps) {
  return (
    <section className="flex h-screen flex-col bg-[var(--color-bg-panel)]">
      {children}
    </section>
  );
}
