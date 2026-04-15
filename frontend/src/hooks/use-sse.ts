"use client";

import { useEffect } from "react";
import { API_BASE } from "@/lib/api";
import { useChatStore } from "@/stores/chat-store";

export function useSSE(taskId: string | null): void {
  const appendToken = useChatStore((state) => state.appendToken);
  const addToolSegment = useChatStore((state) => state.addToolSegment);
  const updateToolSegment = useChatStore((state) => state.updateToolSegment);
  const finishMessage = useChatStore((state) => state.finishMessage);
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
    finishMessage,
    setError,
    setStatus,
  ]);
}
