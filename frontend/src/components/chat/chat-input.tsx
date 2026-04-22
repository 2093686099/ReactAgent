"use client";

import { ArrowUp, Loader2, Paperclip, ShieldCheck, Wrench } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useChatStore } from "@/stores/chat-store";
import { useSystemMetaStore } from "@/stores/system-meta-store";

type ChatInputProps = {
  onSend: (text: string) => Promise<void> | void;
};

const MAX_HEIGHT = 200;

export function ChatInput({ onSend }: ChatInputProps) {
  const status = useChatStore((state) => state.status);
  const meta = useSystemMetaStore((s) => s.meta);
  const loadMeta = useSystemMetaStore((s) => s.load);
  const [value, setValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isComposing = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  const disabled = isSubmitting || status === "sending" || status === "streaming";
  const canSend = value.trim().length > 0 && !disabled;

  const toolCount = meta?.tools.length ?? 0;
  const hasHitl = meta ? meta.tools.some((t) => t.hitl) : false;

  const adjustHeight = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  };

  const handleSubmit = async () => {
    const text = value.trim();
    if (!text || disabled) return;

    setIsSubmitting(true);
    try {
      await onSend(text);
      setValue("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="px-6 pb-5 pt-3">
      <div
        className={[
          "group mx-auto max-w-[720px] rounded-[12px] border bg-[var(--color-bg-surface)]",
          "border-[var(--color-border-standard)]",
          "transition-[border-color,box-shadow] duration-150",
          "focus-within:border-[var(--color-border-focus)]",
          "focus-within:shadow-[0_0_0_3px_rgba(113,112,255,0.08)]",
        ].join(" ")}
      >
        {/* Row 1: 附件 + textarea + 发送 */}
        <div className="flex items-end gap-1 px-3 pb-2 pt-2">
          <button
            type="button"
            aria-label="附件（暂未实现）"
            title="附件"
            disabled
            className="inline-flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[6px] text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-[var(--color-text-tertiary)]"
          >
            <Paperclip size={14} aria-hidden="true" />
          </button>
          <textarea
            ref={textareaRef}
            value={value}
            placeholder="回复 Agent，或输入 / 查看命令..."
            disabled={disabled}
            rows={1}
            onChange={(e) => {
              setValue(e.target.value);
              adjustHeight();
            }}
            onInput={adjustHeight}
            onCompositionStart={() => {
              isComposing.current = true;
            }}
            onCompositionEnd={() => {
              isComposing.current = false;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !isComposing.current) {
                e.preventDefault();
                void handleSubmit();
              }
            }}
            className="min-h-[26px] max-h-[200px] flex-1 resize-none border-none bg-transparent px-1 py-[5px] text-[14.5px] leading-[1.5] tracking-[-0.165px] text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-quaternary)] disabled:cursor-not-allowed"
          />
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!canSend}
            aria-label="发送"
            title="发送 (Enter)"
            className={[
              "inline-flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[6px] transition-colors",
              canSend
                ? "bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)]"
                : "bg-white/[0.04] text-[var(--color-text-quaternary)]",
              disabled ? "cursor-not-allowed" : "",
            ].join(" ")}
          >
            {isSubmitting || status === "sending" ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <ArrowUp size={14} />
            )}
          </button>
        </div>

        {/* Row 2: footer chips + 快捷键提示 */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border-subtle)] px-2.5 pb-2 pt-1.5">
          <div className="flex flex-none flex-nowrap items-center gap-1.5">
            <FooterChip
              title={
                meta
                  ? `已连接 ${toolCount} 个工具（${meta.tools.map((t) => t.name).join("、") || "无"}）`
                  : "加载工具列表中..."
              }
            >
              <Wrench size={10} strokeWidth={2.5} aria-hidden="true" />
              <span>工具 {meta ? toolCount : "—"}</span>
            </FooterChip>
            <FooterChip
              title={hasHitl ? "存在需审批工具，调用时将中断等待确认" : "当前无需人工审批的工具"}
            >
              <ShieldCheck size={10} strokeWidth={2.5} aria-hidden="true" />
              <span>{hasHitl ? "HITL 开启" : "HITL 关闭"}</span>
            </FooterChip>
          </div>
          <div className="flex flex-none items-center gap-2 whitespace-nowrap text-[10.5px] text-[var(--color-text-quaternary)]">
            <span>
              <KbdMini>Enter</KbdMini> 发送
            </span>
            <span>
              <KbdMini>⇧ Enter</KbdMini> 换行
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function FooterChip({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className="inline-flex flex-none items-center gap-1 whitespace-nowrap rounded-[4px] border border-[var(--color-border-subtle)] bg-white/[0.03] px-[7px] py-[2px] text-[10.5px] text-[var(--color-text-quaternary)]"
    >
      {children}
    </span>
  );
}

function KbdMini({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="mr-0.5 whitespace-nowrap rounded-[3px] border border-[var(--color-border-subtle)] bg-white/[0.04] px-1 py-px font-mono text-[9.5px]">
      {children}
    </kbd>
  );
}
