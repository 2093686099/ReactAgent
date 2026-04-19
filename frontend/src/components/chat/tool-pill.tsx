import { Loader2, Check, X } from "lucide-react";
import type { ToolSegment } from "@/lib/types";
import { getToolLabel } from "@/lib/tool-labels";

type ToolPillProps = {
  segment: ToolSegment;
};

export function ToolPill({ segment }: ToolPillProps) {
  const isRejected = segment.status === "rejected";
  const label = getToolLabel(segment.name);
  const stateText =
    segment.status === "calling" ? "调用中" : isRejected ? "已拒绝" : "已完成";

  return (
    <div className="my-1">
      <span
        role="status"
        aria-label={`工具 ${label} ${stateText}`}
        className="inline-flex items-center gap-1.5 rounded-md border border-[rgba(255,255,255,0.08)] bg-white/[0.05] px-2 py-0.5"
      >
        {segment.status === "calling" ? (
          <Loader2
            size={14}
            aria-hidden="true"
            className="animate-spin text-[var(--color-text-tertiary)]"
          />
        ) : isRejected ? (
          <X size={14} aria-hidden="true" className="text-[var(--color-text-tertiary)]" />
        ) : (
          <Check size={14} aria-hidden="true" className="text-emerald-500" />
        )}
        <span
          className={`font-mono text-[13px] text-[var(--color-text-tertiary)] ${
            isRejected ? "line-through opacity-60" : ""
          }`}
        >
          {label}
        </span>
      </span>
    </div>
  );
}
