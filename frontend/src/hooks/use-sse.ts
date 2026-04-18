"use client";

import { useEffect } from "react";
import { API_BASE } from "@/lib/api";
import { useChatStore } from "@/stores/chat-store";

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
  if (!args || Object.keys(args).length === 0) {
    return `Agent 想要调用 ${toolName}`;
  }
  const entries = Object.entries(args).slice(0, 2);
  const summary = entries.map(([, v]) => safeStringify(v)).join("、");
  return `Agent 想要调用 ${toolName}：${summary}`;
}

export function useSSE(taskId: string | null): void {
  const appendToken = useChatStore((state) => state.appendToken);
  const addToolSegment = useChatStore((state) => state.addToolSegment);
  const updateToolSegment = useChatStore((state) => state.updateToolSegment);
  const finishMessage = useChatStore((state) => state.finishMessage);
  const addHitlSegment = useChatStore((state) => state.addHitlSegment);
  const setError = useChatStore((state) => state.setError);
  const setStatus = useChatStore((state) => state.setStatus);

  useEffect(() => {
    if (!taskId) {
      return;
    }

    let receivedTerminalEvent = false;
    const eventSource = new EventSource(
      `${API_BASE}/api/chat/stream/${taskId}?from_id=0`
    );

    eventSource.addEventListener("token", (event) => {
      const payload = JSON.parse((event as MessageEvent).data) as { text?: string };
      if (payload.text) {
        appendToken(payload.text);
      }
    });

    eventSource.addEventListener("tool", (event) => {
      const payload = JSON.parse((event as MessageEvent).data) as {
        name?: string;
        status?: "calling" | "done";
      };
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
      receivedTerminalEvent = true;
      finishMessage();
      eventSource.close();
    });

    eventSource.addEventListener("error", (event) => {
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
      const payload = JSON.parse((event as MessageEvent).data);
      const actionReq = payload.action_requests?.[0];
      const toolName = actionReq?.name ?? "unknown";
      const description = formatHitlDescription(toolName, actionReq?.args);
      addHitlSegment(toolName, description, taskId);
      setStatus("interrupted");
    });

    eventSource.onerror = () => {
      eventSource.close();
      if (!receivedTerminalEvent) {
        setError("流式连接中断，请检查后端日志或模型配置");
      } else {
        setStatus("idle");
      }
    };

    return () => {
      eventSource.close();
    };
  }, [
    taskId,
    appendToken,
    addToolSegment,
    updateToolSegment,
    addHitlSegment,
    finishMessage,
    setError,
    setStatus,
  ]);
}
