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
};

export function MessageList({
  messages,
  status,
  errorMessage,
  scrollRef,
  onScroll,
}: MessageListProps) {
  const lastMessage = messages[messages.length - 1];
  const streamingMessageId =
    status === "streaming" && lastMessage?.role === "assistant" ? lastMessage.id : null;

  return (
    <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto">
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-6 py-6">
        {messages.length === 0 && status === "idle" ? (
          <div className="flex flex-1 items-center justify-center text-[15px] text-[var(--color-text-tertiary)]">
            你好，有什么可以帮你的？
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                isStreaming={streamingMessageId === message.id}
              />
            ))}
            {status === "sending" ? <StreamingDots /> : null}
            {status === "error" && errorMessage ? (
              <p className="text-[15px] text-[var(--color-error)]">
                Agent 执行出错：{errorMessage}
              </p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
