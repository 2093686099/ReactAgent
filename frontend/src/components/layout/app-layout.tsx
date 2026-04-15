import type { ReactNode } from "react";
import { Sidebar } from "@/components/sidebar/sidebar";

type AppLayoutProps = {
  children: ReactNode;
};

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="grid min-h-screen grid-cols-[240px_1fr] bg-[var(--color-bg-panel)] text-[var(--color-text-primary)]">
      <Sidebar />
      <div className="border-l border-[var(--color-border-subtle)]">{children}</div>
    </div>
  );
}
