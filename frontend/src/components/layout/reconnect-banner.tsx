"use client";

import { useEffect, useState } from "react";
import { useChatStore } from "@/stores/chat-store";

export function ReconnectBanner() {
  const status = useChatStore((s) => s.connectionStatus);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (status === "reconnecting") {
      const timer = window.setTimeout(() => setVisible(true), 1000);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(() => setVisible(false), 300);
    return () => window.clearTimeout(timer);
  }, [status]);

  if (!visible && status === "connected") {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="
        flex items-center gap-2 px-4 py-1.5
        text-[13px] font-[510] text-[var(--color-text-secondary)]
        bg-[var(--color-bg-panel)]
        border-b border-[var(--color-border-subtle)]
        transition-opacity duration-200
      "
    >
      <span
        aria-hidden="true"
        className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--color-text-tertiary)] animate-pulse"
      />
      连接中断，正在重连…
    </div>
  );
}
