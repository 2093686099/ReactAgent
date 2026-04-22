import { Sparkles } from "lucide-react";
import { memo } from "react";
import { HitlCard } from "@/components/chat/hitl-card";
import { TextSegment } from "@/components/chat/text-segment";
import { ToolPill } from "@/components/chat/tool-pill";
import type { Message } from "@/lib/types";

type MessageBubbleProps = {
  message: Message;
  isStreaming?: boolean;
  isHitlSubmitting?: boolean;
  onApprove?: (taskId: string) => void;
  onReject?: (taskId: string) => void;
  onFeedback?: (taskId: string, message: string) => void;
};

function MessageBubbleInner({
  message,
  isStreaming = false,
  isHitlSubmitting = false,
  onApprove,
  onReject,
  onFeedback,
}: MessageBubbleProps) {
  if (message.role === "user") {
    const content = message.segments.find((segment) => segment.type === "text")?.content ?? "";
    return (
      <div className="flex justify-end">
        <div
          className="w-fit max-w-[85%] whitespace-pre-wrap rounded-[14px_14px_4px_14px] bg-[var(--color-bg-hover)] px-3.5 py-[9px] text-[14.5px] leading-[1.5] tracking-[-0.165px] text-[var(--color-text-primary)]"
          style={{ boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.04)" }}
        >
          {content}
        </div>
      </div>
    );
  }

  const lastTextSegmentIndex = [...message.segments]
    .reverse()
    .findIndex((segment) => segment.type === "text");
  const resolvedIndex =
    lastTextSegmentIndex === -1 ? -1 : message.segments.length - 1 - lastTextSegmentIndex;

  const visibleSegments = message.segments.filter((segment) => {
    if (segment.type === "text") {
      // 空文本占位段（如历史加载后的空尾段）不渲染
      return segment.content.length > 0;
    }
    return true;
  });

  return (
    <div className="flex items-start gap-3.5">
      <span
        className="inline-flex h-[22px] w-[22px] flex-none items-center justify-center rounded-[6px] text-white"
        style={{
          marginTop: "2px",
          background: "linear-gradient(135deg, var(--color-accent), var(--color-accent-violet))",
          boxShadow: "0 1px 2px rgba(0,0,0,0.3), inset 0 0 0 1px rgba(255,255,255,0.08)",
        }}
      >
        <Sparkles size={11} aria-hidden="true" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2.5 text-[var(--color-text-secondary)]">
        {visibleSegments.length === 0 && !isStreaming ? (
          <span className="text-[13px] text-[var(--color-text-quaternary)]">…</span>
        ) : null}
        {message.segments.map((segment, index) => {
          if (segment.type === "tool") {
            return <ToolPill key={`${message.id}-${index}`} segment={segment} />;
          }
          if (segment.type === "hitl") {
            return (
              <HitlCard
                key={`${message.id}-${index}`}
                segment={segment}
                isSubmitting={isHitlSubmitting}
                onApprove={() => onApprove?.(segment.taskId)}
                onReject={() => onReject?.(segment.taskId)}
                onFeedback={(msg) => onFeedback?.(segment.taskId, msg)}
              />
            );
          }
          if (segment.content.length === 0 && !(isStreaming && index === resolvedIndex)) {
            return null;
          }
          const streamingSegment = isStreaming && index === resolvedIndex;
          return (
            <TextSegment
              key={`${message.id}-${index}`}
              content={segment.content}
              isStreaming={streamingSegment}
            />
          );
        })}
      </div>
    </div>
  );
}

export const MessageBubble = memo(MessageBubbleInner, (prev, next) => {
  if (next.isStreaming) return false;
  if (prev.isHitlSubmitting !== next.isHitlSubmitting) return false;
  if (prev.message !== next.message) return false;
  return (
    prev.message.id === next.message.id &&
    prev.message.segments.length === next.message.segments.length
  );
});
