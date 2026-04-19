"use client";

import { useState } from "react";
import { Check, X, MessageSquare, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { HitlSegment } from "@/lib/types";
import { getToolLabel } from "@/lib/tool-labels";

type HitlCardProps = {
  segment: HitlSegment;
  onApprove: () => void;
  onReject: () => void;
  onFeedback: (message: string) => void;
  isSubmitting?: boolean;
};

export function HitlCard({
  segment,
  onApprove,
  onReject,
  onFeedback,
  isSubmitting = false,
}: HitlCardProps) {
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const toolLabel = getToolLabel(segment.toolName);

  if (segment.status !== "pending") {
    const config = {
      approved: {
        icon: <Check size={14} aria-hidden="true" className="text-[var(--color-success)]" />,
        label: `已批准 ${toolLabel}`,
      },
      rejected: {
        icon: <X size={14} aria-hidden="true" className="text-[var(--color-error)]" />,
        label: `已拒绝 ${toolLabel}`,
      },
      feedback: {
        icon: (
          <MessageSquare
            size={14}
            aria-hidden="true"
            className="text-[var(--color-text-secondary)]"
          />
        ),
        label: `已反馈 ${toolLabel}`,
      },
    }[segment.status];

    return (
      <div className="my-1">
        <span
          role="status"
          aria-label={config.label}
          className="inline-flex items-center gap-1.5 rounded-md border border-[rgba(255,255,255,0.08)] bg-white/[0.05] px-2 py-0.5 text-[13px] text-[var(--color-text-tertiary)]"
        >
          {config.icon}
          {config.label}
        </span>
      </div>
    );
  }

  const FEEDBACK_MAX = 500;

  return (
    <div
      role="group"
      aria-label={`审批请求：${toolLabel}`}
      className="my-2 rounded-lg border border-[var(--color-border-standard)] bg-white/[0.03] p-4 shadow-[rgba(0,0,0,0.2)_0_0_0_1px]"
    >
      <div className="flex items-center gap-2">
        <Shield size={16} aria-hidden="true" className="text-[var(--color-accent)]" />
        <span className="text-[14px] font-[510] text-[var(--color-text-primary)]">
          需要审批
        </span>
      </div>

      <p className="mt-2 text-[15px] tracking-[-0.165px] text-[var(--color-text-secondary)]">
        {segment.description}
      </p>

      {showFeedback ? (
        <div className="mt-3">
          <Textarea
            className="border-[var(--color-border-standard)] bg-[rgba(255,255,255,0.02)] text-[15px] tracking-[-0.165px] text-[var(--color-text-secondary)] placeholder:text-[var(--color-text-quaternary)]"
            placeholder="告诉 Agent 你的修改意见..."
            rows={3}
            maxLength={FEEDBACK_MAX}
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
            disabled={isSubmitting}
          />
          <div className="mt-1 text-right text-[12px] text-[var(--color-text-quaternary)]">
            {feedbackText.length} / {FEEDBACK_MAX}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Button
              size="sm"
              className="bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)]"
              disabled={!feedbackText.trim() || isSubmitting}
              onClick={() => onFeedback(feedbackText.trim())}
            >
              发送反馈
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={isSubmitting}
              onClick={() => {
                setShowFeedback(false);
                setFeedbackText("");
              }}
            >
              取消
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-2">
          <Button
            size="sm"
            className="bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)]"
            disabled={isSubmitting}
            onClick={onApprove}
          >
            <Check size={14} aria-hidden="true" />
            批准
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-[var(--color-text-secondary)] hover:bg-white/[0.05]"
            disabled={isSubmitting}
            onClick={() => setShowFeedback(true)}
          >
            <MessageSquare size={14} aria-hidden="true" />
            反馈
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-[var(--color-error)] hover:bg-[var(--color-error)]/10"
            disabled={isSubmitting}
            onClick={onReject}
          >
            <X size={14} aria-hidden="true" />
            拒绝
          </Button>
        </div>
      )}
    </div>
  );
}
