import { memo } from "react";
import { Sparkles } from "lucide-react";
import type { Message } from "@/lib/types";
import { TextSegment } from "@/components/chat/text-segment";

type MessageBubbleProps = {
  message: Message;
  isStreaming?: boolean;
};

function MessageBubbleInner({ message, isStreaming = false }: MessageBubbleProps) {
  if (message.role === "user") {
    const content =
      message.segments.find((segment) => segment.type === "text")?.content ?? "";
    return (
      <div className="ml-auto w-fit max-w-[85%] rounded-[12px_12px_4px_12px] border border-[var(--color-border-standard)] bg-[var(--color-bg-surface)] px-4 py-2 text-[15px] text-[var(--color-text-primary)]">
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

  return (
    <div className="mr-auto w-full max-w-full py-1">
      {message.segments.map((segment, index) => {
        if (segment.type !== "text") {
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
      {!isStreaming ? (
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
    return (
      prev.message.id === next.message.id &&
      prev.message.segments.length === next.message.segments.length
    );
  }
);
