"use client";

import { ChevronsUpDown, Search, Settings2, Sparkles, SquarePen, Wrench } from "lucide-react";
import { useEffect, useState } from "react";
import { groupSessions } from "@/lib/time-group";
import { getToolLabel } from "@/lib/tool-labels";
import type { SystemMeta } from "@/lib/types";
import { useSessionStore } from "@/stores/session-store";
import { useSystemMetaStore } from "@/stores/system-meta-store";
import { SessionGroup } from "./session-group";

interface Props {
  onSwitch: (id: string) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
}

// Provider → 人类可读名。未知 provider 时回退到 capitalize。
const PROVIDER_LABEL: Record<string, string> = {
  openai: "OpenAI",
  qwen: "通义千问",
  ollama: "Ollama",
  modelscope: "ModelScope",
  tencent: "腾讯混元",
};

function formatModelName(meta: SystemMeta["llm"]): string {
  if (!meta.model) return PROVIDER_LABEL[meta.provider] ?? meta.provider;
  // MiniMax/MiniMax-M2.5 → MiniMax-M2.5
  const short = meta.model.includes("/") ? meta.model.split("/").pop()! : meta.model;
  return short;
}

export function Sidebar({ onSwitch, onDelete, onNew }: Props) {
  const sessions = useSessionStore((s) => s.sessions);
  const activeId = useSessionStore((s) => s.activeSessionId);
  const loadSessions = useSessionStore((s) => s.loadSessions);
  const meta = useSystemMetaStore((s) => s.meta);
  const loadMeta = useSystemMetaStore((s) => s.load);
  const [query, setQuery] = useState("");

  useEffect(() => {
    void loadSessions().catch(() => {});
  }, [loadSessions]);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  const filtered = query.trim()
    ? sessions.filter((s) =>
        (s.title || "新会话").toLowerCase().includes(query.trim().toLowerCase()),
      )
    : sessions;
  const groups = groupSessions(filtered);

  const modelDisplay = meta ? formatModelName(meta.llm) : "—";
  const agentStatus = meta ? "在线" : "连接中";
  const tools = meta?.tools ?? [];

  return (
    <aside className="flex h-screen min-h-0 flex-col bg-[var(--color-bg-deepest)]">
      {/* Agent 卡片 */}
      <div className="border-b border-[var(--color-border-subtle)] px-2.5 pb-2 pt-2.5">
        <div className="flex items-center gap-2.5 rounded-[7px] border border-[var(--color-border-standard)] bg-[var(--color-bg-surface)] p-2">
          <span
            className="inline-flex h-7 w-7 flex-none items-center justify-center rounded-[7px] text-white"
            style={{
              background:
                "linear-gradient(135deg, var(--color-accent), var(--color-accent-violet))",
              boxShadow: "0 1px 2px rgba(0,0,0,0.3), inset 0 0 0 1px rgba(255,255,255,0.1)",
            }}
          >
            <Sparkles size={13} aria-hidden="true" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[12.5px] font-[510] text-[var(--color-text-primary)]">
              ReAct Agent
            </span>
            <span className="mt-px flex items-center gap-1.5 truncate text-[10.5px] text-[var(--color-text-quaternary)]">
              <PulseDot online={meta !== null} />
              <span className="truncate">
                {agentStatus} · {modelDisplay}
              </span>
            </span>
          </div>
          <button
            type="button"
            aria-label="切换 Agent"
            title="切换 Agent（暂未实现）"
            className="inline-flex h-5 w-5 flex-none items-center justify-center rounded-[4px] text-[var(--color-text-quaternary)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
          >
            <ChevronsUpDown size={12} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* 新建 + 搜索 */}
      <div className="flex flex-col gap-1.5 p-2.5">
        <button
          type="button"
          onClick={onNew}
          className="flex w-full items-center gap-2 rounded-[6px] border border-[var(--color-border-standard)] bg-[var(--color-bg-surface)] px-2.5 py-1.5 text-[12.5px] font-[510] text-[var(--color-text-primary)] transition-[border-color] duration-150 hover:border-[var(--color-border-focus)]"
        >
          <SquarePen size={13} aria-hidden="true" />
          <span className="flex-1 text-left">新建会话</span>
        </button>
        <label className="flex items-center gap-2 rounded-[6px] border border-[var(--color-border-subtle)] bg-white/[0.02] px-2.5 py-1.5">
          <Search
            size={12}
            aria-hidden="true"
            className="flex-none text-[var(--color-text-quaternary)]"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索会话与消息..."
            className="min-w-0 flex-1 border-none bg-transparent text-[12.5px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-quaternary)] focus:outline-none"
          />
        </label>
      </div>

      {/* Sessions 列表 */}
      <div className="nice-scroll flex-1 min-h-0 overflow-y-auto px-2.5">
        {groups.length === 0 ? (
          <div className="px-2.5 py-6 text-center text-[12px] text-[var(--color-text-quaternary)]">
            {query.trim() ? "没有匹配的会话" : "暂无会话"}
          </div>
        ) : (
          groups.map((g) => (
            <SessionGroup
              key={g.group}
              label={g.label}
              items={g.items}
              activeId={activeId}
              onSelect={onSwitch}
              onDelete={onDelete}
            />
          ))
        )}
      </div>

      {/* 已连接工具 */}
      <div className="border-t border-[var(--color-border-subtle)] px-2.5 py-3">
        <div className="flex items-center justify-between px-1 pb-2 text-[10.5px] font-[510] uppercase tracking-[0.04em] text-[var(--color-text-quaternary)]">
          <span className="inline-flex items-center gap-1.5">
            <Wrench size={11} aria-hidden="true" />
            已连接工具
          </span>
          <span className="rounded-[3px] bg-white/[0.03] px-1.5 py-px font-mono text-[10px] font-normal">
            {tools.length}
          </span>
        </div>
        {tools.length === 0 ? (
          <div className="px-2 py-2 text-[11px] text-[var(--color-text-quaternary)]">
            {meta ? "未连接工具" : "加载中..."}
          </div>
        ) : (
          <div className="nice-scroll flex max-h-[180px] flex-col gap-px overflow-y-auto">
            {tools.map((tool) => (
              <div
                key={`${tool.category}:${tool.name}`}
                className="flex items-center gap-2 rounded-[4px] px-2 py-1.5 text-[var(--color-text-tertiary)] transition-colors hover:bg-white/[0.03]"
                title={getToolLabel(tool.name)}
              >
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 flex-none rounded-full"
                  style={{
                    background: tool.hitl ? "#f59e0b" : "var(--color-success)",
                  }}
                />
                <span className="flex-1 truncate font-mono text-[11.5px]">{tool.name}</span>
                {tool.hitl ? (
                  <span
                    className="rounded-[3px] border px-1.5 py-px text-[9.5px] font-[510]"
                    style={{
                      background: "rgba(245,158,11,0.1)",
                      color: "#f59e0b",
                      borderColor: "rgba(245,158,11,0.2)",
                    }}
                  >
                    需审批
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer 用户行 */}
      <div className="flex items-center gap-2.5 border-t border-[var(--color-border-subtle)] p-2.5">
        <span
          className="inline-flex h-[26px] w-[26px] items-center justify-center rounded-[6px] text-[11.5px] font-[590] text-white"
          style={{
            background: "linear-gradient(135deg, #4c4d8a, #7170ff)",
            boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)",
          }}
        >
          W
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[12.5px] font-[510] text-[var(--color-text-primary)]">
            Wenhua
          </span>
          <span className="truncate text-[10.5px] text-[var(--color-text-quaternary)]">
            Pro Plan
          </span>
        </div>
        <button
          type="button"
          aria-label="设置"
          title="设置（暂未实现）"
          className="inline-flex h-6 w-6 flex-none items-center justify-center rounded-[4px] text-[var(--color-text-quaternary)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-secondary)]"
        >
          <Settings2 size={13} aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}

function PulseDot({ online }: { online: boolean }) {
  if (!online) {
    return (
      <span
        aria-hidden="true"
        className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-text-quaternary)]"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="inline-block h-1.5 w-1.5 rounded-full"
      style={{
        background: "var(--color-success)",
        animation: "status-pulse-green 1.8s ease-out infinite",
        boxShadow: "0 0 0 0 rgba(16,185,129,0.6)",
      }}
    />
  );
}

