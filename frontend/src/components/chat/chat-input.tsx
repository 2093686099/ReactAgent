"use client";

import { useRef, useState } from "react";
import { ArrowUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useChatStore } from "@/stores/chat-store";

type ChatInputProps = {
  onSend: (text: string) => Promise<void> | void;
};

const MAX_HEIGHT = 200;

export function ChatInput({ onSend }: ChatInputProps) {
  const status = useChatStore((state) => state.status);
  const [value, setValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isComposing = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const disabled = isSubmitting || status === "sending" || status === "streaming";
  const canSend = value.trim().length > 0 && !disabled;

  const adjustHeight = () => {
    const element = textareaRef.current;
    if (!element) {
      return;
    }
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, MAX_HEIGHT)}px`;
  };

  const handleSubmit = async () => {
    const text = value.trim();
    if (!text || disabled) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onSend(text);
      setValue("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "44px";
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="border-t border-[var(--color-border-subtle)] px-6 pb-6 pt-4">
      <div className="mx-auto w-full max-w-3xl">
        <div className="relative">
          <Textarea
            ref={textareaRef}
            value={value}
            placeholder="输入消息..."
            onChange={(event) => {
              setValue(event.target.value);
              adjustHeight();
            }}
            onInput={adjustHeight}
            onCompositionStart={() => {
              isComposing.current = true;
            }}
            onCompositionEnd={() => {
              isComposing.current = false;
            }}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !isComposing.current
              ) {
                event.preventDefault();
                void handleSubmit();
              }
            }}
            className="min-h-11 max-h-[200px] resize-none rounded-lg border border-[var(--color-border-standard)] bg-white/[0.02] px-3.5 py-3 pr-12 text-[15px] font-normal text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus-visible:border-[var(--color-border-focus)] focus-visible:ring-0"
          />

          <Button
            type="button"
            size="icon"
            onClick={() => {
              void handleSubmit();
            }}
            disabled={!canSend}
            className="absolute bottom-2 right-2 h-8 w-8 rounded-md bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] disabled:bg-transparent disabled:text-[var(--color-text-quaternary)]"
          >
            {disabled ? <Loader2 className="animate-spin" size={16} /> : <ArrowUp size={16} />}
          </Button>
        </div>
      </div>
    </div>
  );
}
