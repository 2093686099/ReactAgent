"use client";

import { useEffect } from "react";
import { API_BASE } from "@/lib/api";
import { getToolLabel } from "@/lib/tool-labels";
import type { Todo } from "@/lib/types";
import { useChatStore } from "@/stores/chat-store";
import { useUIStore } from "@/stores/ui-store";

function safeStringify(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  try {
    const s = JSON.stringify(v);
    if (s === undefined) return String(v);
    return s.length > 80 ? `${s.slice(0, 77)}...` : s;
  } catch {
    return String(v);
  }
}

function formatHitlDescription(toolName: string, args?: Record<string, unknown>): string {
  const label = getToolLabel(toolName);
  if (!args || Object.keys(args).length === 0) {
    return `Agent 想要${label}`;
  }
  const entries = Object.entries(args).slice(0, 2);
  const summary = entries.map(([, v]) => safeStringify(v)).join("、");
  return `Agent 想要${label}：${summary}`;
}

export function useSSE(taskId: string | null, sessionId: string): void {
  const appendToken = useChatStore((state) => state.appendToken);
  const addToolSegment = useChatStore((state) => state.addToolSegment);
  const updateToolSegment = useChatStore((state) => state.updateToolSegment);
  const finishMessage = useChatStore((state) => state.finishMessage);
  const addHitlSegment = useChatStore((state) => state.addHitlSegment);
  const setError = useChatStore((state) => state.setError);
  const setStatus = useChatStore((state) => state.setStatus);
  const setTodos = useChatStore((s) => s.setTodos);
  const setConnectionStatus = useChatStore((s) => s.setConnectionStatus);
  const resolveLastPendingHitl = useChatStore((s) => s.resolveLastPendingHitl);
  const autoOpenDrawer = useUIStore((s) => s.autoOpenDrawer);

  useEffect(() => {
    if (!taskId) {
      return;
    }

    let receivedTerminalEvent = false;
    const eventSource = new EventSource(
      `${API_BASE}/api/chat/stream/${taskId}?from_id=0`
    );

    eventSource.addEventListener("token", (event) => {
      setConnectionStatus("connected");
      let payload: { text?: string };
      try {
        payload = JSON.parse((event as MessageEvent).data);
      } catch {
        return; // 单帧坏数据不应中断流
      }
      if (payload.text) {
        appendToken(payload.text);
      }
    });

    eventSource.addEventListener("tool", (event) => {
      setConnectionStatus("connected");
      let payload: { name?: string; status?: "calling" | "done" };
      try {
        payload = JSON.parse((event as MessageEvent).data);
      } catch {
        return;
      }
      if (!payload.name || !payload.status) {
        return;
      }
      if (payload.status === "calling") {
        addToolSegment(payload.name, payload.status);
      } else {
        updateToolSegment(payload.name, payload.status);
      }
    });

    eventSource.addEventListener("done", () => {
      setConnectionStatus("connected");
      receivedTerminalEvent = true;
      finishMessage();
      eventSource.close();
    });

    eventSource.addEventListener("error", (event) => {
      setConnectionStatus("connected");
      const maybeMessageEvent = event as MessageEvent;
      if (maybeMessageEvent.data) {
        receivedTerminalEvent = true;
        try {
          const payload = JSON.parse(maybeMessageEvent.data) as { message?: string };
          setError(payload.message ?? "Agent 执行出错");
        } catch {
          setError("Agent 执行出错");
        }
      }
    });

    eventSource.addEventListener("hitl", (event) => {
      setConnectionStatus("connected");
      let payload: { action_requests?: Array<{ name?: string; args?: Record<string, unknown> }> };
      try {
        payload = JSON.parse((event as MessageEvent).data);
      } catch {
        // hitl 事件丢失会让用户卡死无按钮可点，必须显式提示
        setError("HITL 事件解析失败");
        return;
      }
      const actionReq = payload.action_requests?.[0];
      const toolName = actionReq?.name ?? "unknown";
      const description = formatHitlDescription(toolName, actionReq?.args);
      addHitlSegment(toolName, description, taskId);
      setStatus("interrupted");
    });

    eventSource.addEventListener("todo", (event) => {
      setConnectionStatus("connected");
      let payload: { todos?: unknown };
      try {
        payload = JSON.parse((event as MessageEvent).data);
      } catch {
        return; // 单帧坏数据不应中断流
      }
      if (!Array.isArray(payload.todos)) {
        return;
      }
      const validTodos: Todo[] = payload.todos.filter(
        (t: unknown): t is Todo =>
          typeof t === "object" &&
          t !== null &&
          typeof (t as { content?: unknown }).content === "string" &&
          ((t as { status?: unknown }).status === "pending" ||
            (t as { status?: unknown }).status === "in_progress" ||
            (t as { status?: unknown }).status === "completed"),
      );
      setTodos(validTodos);
      if (validTodos.length > 0) {
        autoOpenDrawer(sessionId);
      }
    });

    // Addresses review concern: prefer payload.tool_name so multiple pending HITL cards
    // do not collapse onto the wrong one.
    eventSource.addEventListener("hitl_resolved", (event) => {
      setConnectionStatus("connected");
      let payload: { decision?: string; tool_name?: string | null };
      try {
        payload = JSON.parse((event as MessageEvent).data);
      } catch {
        return; // 坏帧不中断流
      }
      if (payload.decision === "approve" || payload.decision === "edit") {
        resolveLastPendingHitl("approved", payload.tool_name);
      } else if (payload.decision === "reject") {
        resolveLastPendingHitl("rejected", payload.tool_name);
      }
    });

    eventSource.onerror = () => {
      if (receivedTerminalEvent) {
        setConnectionStatus("connected");
        eventSource.close();
        setStatus("idle");
        return;
      }
      // Phase 12 D-08: 未收终态事件 -> 浏览器将自动重连并携带 Last-Event-ID。
      // 不主动 close（否则截断浏览器 reconnect 路径）；不调 setError（那是真正异常路径）。
      setConnectionStatus("reconnecting");
    };

    return () => {
      eventSource.close();
    };
  }, [
    taskId,
    sessionId,
    appendToken,
    addToolSegment,
    updateToolSegment,
    addHitlSegment,
    finishMessage,
    setError,
    setStatus,
    setTodos,
    setConnectionStatus,
    resolveLastPendingHitl,
    autoOpenDrawer,
  ]);
}
