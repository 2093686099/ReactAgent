import { Sparkles } from "lucide-react";
import type { RefObject } from "react";
import { MessageBubble } from "@/components/chat/message-bubble";
import { StreamingDots } from "@/components/chat/streaming-dots";
import type { ChatStatus, Message } from "@/lib/types";

type MessageListProps = {
  messages: Message[];
  status: ChatStatus;
  errorMessage: string | null;
  scrollRef: RefObject<HTMLDivElement | null>;
  onScroll: () => void;
  onApprove?: (taskId: string) => void;
  onReject?: (taskId: string) => void;
  onFeedback?: (taskId: string, message: string) => void;
};

export function MessageList({
  messages,
  status,
  errorMessage,
  scrollRef,
  onScroll,
  onApprove,
  onReject,
  onFeedback,
}: MessageListProps) {
  const lastMessage = messages[messages.length - 1];
  const streamingMessageId =
    status === "streaming" && lastMessage?.role === "assistant" ? lastMessage.id : null;
  const isHitlSubmitting = status === "sending";

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="nice-scroll flex-1 overflow-y-auto overflow-x-hidden"
    >
      <div className="mx-auto flex min-h-full w-full max-w-[720px] flex-col gap-[22px] px-6 pb-6 pt-7">
        {messages.length === 0 && status === "idle" ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3.5 py-20 text-[var(--color-text-tertiary)]">
            <span
              className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] text-white"
              style={{
                background:
                  "linear-gradient(135deg, var(--color-accent), var(--color-accent-violet))",
                boxShadow:
                  "0 4px 16px rgba(113,112,255,0.2), inset 0 0 0 1px rgba(255,255,255,0.1)",
              }}
            >
              <Sparkles size={18} aria-hidden="true" />
            </span>
            <span className="text-[15px] tracking-[-0.165px] text-[var(--color-text-secondary)]">
              你好，有什么可以帮你的？
            </span>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                isStreaming={streamingMessageId === message.id}
                isHitlSubmitting={isHitlSubmitting}
                onApprove={onApprove}
                onReject={onReject}
                onFeedback={onFeedback}
              />
            ))}
            {status === "sending" ? (
              <div className="flex items-start gap-3.5">
                <span
                  className="inline-flex h-[22px] w-[22px] flex-none items-center justify-center rounded-[6px] text-white"
                  style={{
                    background:
                      "linear-gradient(135deg, var(--color-accent), var(--color-accent-violet))",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.3), inset 0 0 0 1px rgba(255,255,255,0.08)",
                  }}
                >
                  <Sparkles size={11} aria-hidden="true" />
                </span>
                <StreamingDots />
              </div>
            ) : null}
            {status === "error" && errorMessage ? (
              <p className="text-[14px] text-[var(--color-error)]">
                Agent 执行出错：{errorMessage}
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
