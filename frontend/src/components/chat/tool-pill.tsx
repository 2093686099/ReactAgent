import { Check, Loader2, X } from "lucide-react";
import { getToolLabel } from "@/lib/tool-labels";
import type { ToolSegment } from "@/lib/types";

type ToolPillProps = {
  segment: ToolSegment;
};

export function ToolPill({ segment }: ToolPillProps) {
  const isRejected = segment.status === "rejected";
  const isCalling = segment.status === "calling";
  const label = getToolLabel(segment.name);
  const stateText = isCalling ? "调用中" : isRejected ? "已拒绝" : "已完成";

  // 三态 icon 圆形背景与颜色
  const iconBg = isCalling
    ? "rgba(113,112,255,0.12)"
    : isRejected
      ? "rgba(239,68,68,0.12)"
      : "rgba(16,185,129,0.12)";
  const iconColor = isCalling
    ? "var(--color-accent-violet)"
    : isRejected
      ? "var(--color-error)"
      : "var(--color-success)";

  return (
    <div className="flex">
      <span
        role="status"
        aria-label={`工具 ${label} ${stateText}`}
        className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border-subtle)] bg-white/[0.03] py-[4px] pl-2 pr-2.5 text-[12px]"
      >
        <span
          aria-hidden="true"
          className="inline-flex h-4 w-4 items-center justify-center rounded-full"
          style={{ background: iconBg, color: iconColor }}
        >
          {isCalling ? (
            <Loader2 size={10} className="animate-spin" strokeWidth={2.5} />
          ) : isRejected ? (
            <X size={10} strokeWidth={2.5} />
          ) : (
            <Check size={10} strokeWidth={3} />
          )}
        </span>
        <span
          className={[
            "font-[510]",
            isRejected
              ? "text-[var(--color-text-tertiary)] line-through opacity-60"
              : "text-[var(--color-text-secondary)]",
          ].join(" ")}
        >
          {label}
        </span>
        <span className="border-l border-[var(--color-border-subtle)] pl-1.5 font-mono text-[11px] text-[var(--color-text-quaternary)]">
          {segment.name}
        </span>
      </span>
    </div>
  );
}
