"use client";

import { Check, MessageSquare, X } from "lucide-react";
import { useEffect, useState } from "react";
import { getToolLabel } from "@/lib/tool-labels";
import type { HitlSegment } from "@/lib/types";

type HitlCardProps = {
  segment: HitlSegment;
  onApprove: () => void;
  onReject: () => void;
  onFeedback: (message: string) => void;
  isSubmitting?: boolean;
};

const FEEDBACK_MAX = 500;

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

  // 键盘快捷键：Y 批准 / N 拒绝 / F 展开反馈
  const pending = segment.status === "pending";
  useEffect(() => {
    if (!pending || showFeedback || isSubmitting) return;
    const handler = (e: KeyboardEvent) => {
      // 聚焦输入控件时不触发
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === "y") {
        e.preventDefault();
        onApprove();
      } else if (key === "n") {
        e.preventDefault();
        onReject();
      } else if (key === "f") {
        e.preventDefault();
        setShowFeedback(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [pending, showFeedback, isSubmitting, onApprove, onReject]);

  if (segment.status !== "pending") {
    const doneConfigs: Record<
      "approved" | "rejected" | "feedback",
      { icon: React.ReactNode; label: string; cls: string }
    > = {
      approved: {
        icon: <Check size={12} strokeWidth={3} aria-hidden="true" />,
        label: `已批准 · ${toolLabel}`,
        cls: "text-[var(--color-success)] border-[rgba(16,185,129,0.2)] bg-[rgba(16,185,129,0.06)]",
      },
      rejected: {
        icon: <X size={12} strokeWidth={2.5} aria-hidden="true" />,
        label: `已拒绝 · ${toolLabel}`,
        cls: "text-[var(--color-error)] border-[rgba(239,68,68,0.2)] bg-[rgba(239,68,68,0.06)]",
      },
      feedback: {
        icon: <MessageSquare size={12} aria-hidden="true" />,
        label: `已反馈 · ${toolLabel}`,
        cls: "text-[var(--color-text-tertiary)] border-[var(--color-border-subtle)] bg-white/[0.03]",
      },
    };
    const config = doneConfigs[segment.status];

    return (
      <div className="flex">
        <span
          role="status"
          aria-label={config.label}
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[3px] text-[12px] ${config.cls}`}
        >
          {config.icon}
          {config.label}
        </span>
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-label={`审批请求：${toolLabel}`}
      className="relative overflow-hidden rounded-[10px]"
      style={{
        background: "linear-gradient(180deg, rgba(245,158,11,0.06), rgba(245,158,11,0.02))",
        border: "1px solid rgba(245,158,11,0.22)",
        animation: "hitl-glow 2.6s ease-in-out infinite",
      }}
    >
      {/* 左侧渐变色条 */}
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-[2px]"
        style={{
          background: "linear-gradient(180deg, #f59e0b, #d97706)",
        }}
      />

      <div className="p-4">
        {/* Header 行 */}
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <span
            className="inline-flex items-center gap-1.5 rounded-full border py-[2px] pl-1.5 pr-2 text-[11.5px] font-[510]"
            style={{
              background: "rgba(245,158,11,0.12)",
              color: "#f59e0b",
              borderColor: "rgba(245,158,11,0.25)",
            }}
          >
            <span
              aria-hidden="true"
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{
                background: "#f59e0b",
                animation: "hitl-dot 1.6s ease-out infinite",
              }}
            />
            需要审批
          </span>
          <span className="rounded-[3px] border border-[var(--color-border-subtle)] bg-white/[0.04] px-1.5 py-px font-mono text-[11.5px] text-[var(--color-text-secondary)]">
            {segment.toolName}
          </span>
          <span className="ml-auto whitespace-nowrap font-mono text-[10.5px] text-[var(--color-text-quaternary)]">
            Y / N / F
          </span>
        </div>

        {/* Body 文本 */}
        <p className="my-2.5 text-[14px] leading-[1.55] tracking-[-0.165px] text-[var(--color-text-secondary)]">
          {segment.description}
        </p>

        {showFeedback ? (
          <div>
            <textarea
              autoFocus
              className="block w-full resize-none rounded-[6px] border border-[var(--color-border-standard)] bg-black/20 px-3 py-2.5 font-sans text-[14px] tracking-[-0.165px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-quaternary)] focus:border-[rgba(245,158,11,0.35)] focus:outline-none"
              placeholder="告诉 Agent 你的修改意见..."
              rows={3}
              maxLength={FEEDBACK_MAX}
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              disabled={isSubmitting}
              style={{ minHeight: 68 }}
            />
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[11px] text-[var(--color-text-quaternary)]">
                {feedbackText.length} / {FEEDBACK_MAX}
              </span>
              <div className="flex items-center gap-2">
                <HitlBtn
                  variant="ghost"
                  disabled={isSubmitting}
                  onClick={() => {
                    setShowFeedback(false);
                    setFeedbackText("");
                  }}
                >
                  取消
                </HitlBtn>
                <HitlBtn
                  variant="primary"
                  disabled={!feedbackText.trim() || isSubmitting}
                  onClick={() => onFeedback(feedbackText.trim())}
                >
                  发送反馈
                </HitlBtn>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <HitlBtn variant="primary" disabled={isSubmitting} onClick={onApprove}>
              <Check size={13} strokeWidth={2.5} aria-hidden="true" />
              批准
              <KbdInline>Y</KbdInline>
            </HitlBtn>
            <HitlBtn variant="ghost" disabled={isSubmitting} onClick={() => setShowFeedback(true)}>
              <MessageSquare size={13} aria-hidden="true" />
              反馈
              <KbdInline>F</KbdInline>
            </HitlBtn>
            <HitlBtn variant="danger" disabled={isSubmitting} onClick={onReject}>
              <X size={13} strokeWidth={2.5} aria-hidden="true" />
              拒绝
              <KbdInline>N</KbdInline>
            </HitlBtn>
          </div>
        )}
      </div>
    </div>
  );
}

function HitlBtn({
  children,
  variant,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  variant: "primary" | "ghost" | "danger";
  disabled?: boolean;
  onClick?: () => void;
}) {
  const base =
    "inline-flex items-center gap-1.5 rounded-[6px] border px-2.5 py-1.5 text-[12.5px] font-[510] leading-none transition-colors disabled:cursor-not-allowed disabled:opacity-50";
  const styles = {
    primary:
      "border-transparent bg-[var(--color-accent)] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] hover:bg-[var(--color-accent-hover)]",
    ghost:
      "border-[var(--color-border-standard)] bg-transparent text-[var(--color-text-secondary)] hover:border-[var(--color-border-focus)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]",
    danger:
      "border-[var(--color-border-standard)] bg-transparent text-[var(--color-text-secondary)] hover:border-[rgba(239,68,68,0.3)] hover:bg-[rgba(239,68,68,0.1)] hover:text-[var(--color-error)]",
  }[variant];
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={`${base} ${styles}`}>
      {children}
    </button>
  );
}

function KbdInline({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      className="ml-0.5 rounded-[3px] px-1 py-px font-mono text-[10px] text-white/60"
      style={{ background: "rgba(0,0,0,0.25)" }}
    >
      {children}
    </kbd>
  );
}
