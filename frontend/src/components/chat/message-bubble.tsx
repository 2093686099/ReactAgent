import { memo } from "react";
import { Sparkles } from "lucide-react";
import type { Message } from "@/lib/types";
import { TextSegment } from "@/components/chat/text-segment";
import { ToolPill } from "@/components/chat/tool-pill";
import { HitlCard } from "@/components/chat/hitl-card";

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
    const content =
      message.segments.find((segment) => segment.type === "text")?.content ?? "";
    return (
      <div className="ml-auto w-fit max-w-[85%] rounded-[12px_12px_4px_12px] border border-[var(--color-border-standard)] bg-[var(--color-bg-surface)] px-4 py-2 text-[15px] tracking-[-0.165px] text-[var(--color-text-primary)]">
        {content}
      </div>
    );
  }

  const lastTextSegmentIndex = [...message.segments]
    .reverse()
    .findIndex((segment) => segment.type === "text");
  const resolvedIndex =
    lastTextSegmentIndex === -1
      ? -1
      : message.segments.length - 1 - lastTextSegmentIndex;

  const hasPendingHitl = message.segments.some(
    (s) => s.type === "hitl" && s.status === "pending"
  );

  return (
    <div className="mr-auto w-full max-w-full py-1">
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
        const streamingSegment = isStreaming && index === resolvedIndex;
        return (
          <TextSegment
            key={`${message.id}-${index}`}
            content={segment.content}
            isStreaming={streamingSegment}
          />
        );
      })}
      {!isStreaming && !hasPendingHitl ? (
        <div className="mt-2 text-[var(--color-text-quaternary)]">
          <Sparkles size={16} />
        </div>
      ) : null}
    </div>
  );
}

export const MessageBubble = memo(
  MessageBubbleInner,
  (prev, next) => {
    if (next.isStreaming) return false;
    // isHitlSubmitting 控制按钮禁用状态，必须跟随 re-render
    if (prev.isHitlSubmitting !== next.isHitlSubmitting) return false;
    // 引用变化即重渲染（store 是 immutable，segment 状态变化会产生新 message 引用）
    if (prev.message !== next.message) return false;
    return (
      prev.message.id === next.message.id &&
      prev.message.segments.length === next.message.segments.length
    );
  }
);
