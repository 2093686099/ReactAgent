import type { ReactNode } from "react";

type AppLayoutProps = {
  children: ReactNode;
  sidebar: ReactNode;
};

export function AppLayout({ children, sidebar }: AppLayoutProps) {
  return (
    <div className="grid min-h-screen grid-cols-[240px_1fr] bg-[var(--color-bg-panel)] text-[var(--color-text-primary)]">
      {sidebar}
      <div className="border-l border-[var(--color-border-subtle)]">{children}</div>
    </div>
  );
}
