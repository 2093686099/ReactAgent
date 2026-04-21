"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { ChatArea } from "@/components/chat/chat-area";
import { ChatInput } from "@/components/chat/chat-input";
import { MessageList } from "@/components/chat/message-list";
import { AppLayout } from "@/components/layout/app-layout";
import { Sidebar } from "@/components/sidebar/sidebar";
import { useAutoScroll } from "@/hooks/use-auto-scroll";
import { useSSE } from "@/hooks/use-sse";
import { invokeChat, loadHistory as apiLoadHistory, resumeChat } from "@/lib/api";
import { useChatStore } from "@/stores/chat-store";
import { useSessionStore } from "@/stores/session-store";

export default function ChatPage() {
  const messages = useChatStore((state) => state.messages);
  const status = useChatStore((state) => state.status);
  const currentTaskId = useChatStore((state) => state.currentTaskId);
  const errorMessage = useChatStore((state) => state.errorMessage);

  const addUserMessage = useChatStore((state) => state.addUserMessage);
  const addAssistantMessage = useChatStore((state) => state.addAssistantMessage);
  const setStatus = useChatStore((state) => state.setStatus);
  const setCurrentTaskId = useChatStore((state) => state.setCurrentTaskId);
  const setError = useChatStore((state) => state.setError);
  const updateHitlStatus = useChatStore((state) => state.updateHitlStatus);
  const loadHistoryAction = useChatStore((state) => state.loadHistory);

  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const sessions = useSessionStore((s) => s.sessions);
  const setActive = useSessionStore((s) => s.setActive);
  const createLocal = useSessionStore((s) => s.createLocal);
  const deleteOptimistic = useSessionStore((s) => s.deleteOptimistic);
  const restoreSession = useSessionStore((s) => s.restoreSession);
  const loadSessions = useSessionStore((s) => s.loadSessions);

  useSSE(currentTaskId, activeSessionId);

  const scrollRef = useRef<HTMLDivElement>(null);
  const { scrollToBottom, onScroll, shouldAutoScroll } = useAutoScroll(scrollRef);

  useEffect(() => {
    if (!shouldAutoScroll) {
      return;
    }
    const id = requestAnimationFrame(() => {
      scrollToBottom();
    });
    return () => cancelAnimationFrame(id);
  }, [messages, status, shouldAutoScroll, scrollToBottom]);

  const handleSwitch = async (id: string) => {
    // D-09 切换顺序：
    // ① 旧 SSE 由 useSSE effect cleanup 自然关闭（sessionId/taskId 变化触发）
    // ② 清空 chat-store
    loadHistoryAction([]);
    // ③ 切换 active
    setActive(id);
    setCurrentTaskId(null);
    // ④ 拉历史
    try {
      const hist = await apiLoadHistory(id);
      const msgs =
        hist.truncate_after_active_task && hist.messages.length > 0
          ? hist.messages.slice(0, -1)
          : hist.messages;
      loadHistoryAction(msgs);
      // ⑤ reattach
      if (hist.active_task?.task_id) {
        setCurrentTaskId(hist.active_task.task_id);
        setStatus(
          hist.active_task.status === "interrupted" ? "interrupted" : "streaming",
        );
      }
    } catch (err) {
      // 404 = session 后端不存在（本地占位未发消息 / Redis TTL 过期）→ 当作空历史，UI 已清空
      if (err instanceof Error && err.message === "HTTP 404") return;
      const m = err instanceof Error ? err.message : "加载历史失败";
      toast.error(m);
    }
  };

  const handleDelete = async (id: string) => {
    // sessions 闭包是删除前快照（state 变更在下一次 render 才反映）
    const target = sessions.find((s) => s.id === id);
    if (!target) return;
    try {
      await deleteOptimistic(id);
    } catch {
      toast.error("删除失败");
      return;
    }
    toast(`已删除 ${target.title || "新会话"}`, {
      duration: 8000,
      action: {
        label: "撤销",
        onClick: async () => {
          await restoreSession(target);
        },
      },
    });
    // 若删的是当前活跃会话，自动切到列表下一条；空列表则进入空态
    if (id === activeSessionId) {
      const next = sessions.find((s) => s.id !== id);
      if (next) {
        await handleSwitch(next.id);
      } else {
        createLocal();
        loadHistoryAction([]);
        setCurrentTaskId(null);
      }
    }
  };

  const handleNew = () => {
    createLocal();
    loadHistoryAction([]);
    setCurrentTaskId(null);
  };

  // 首次进入自动选中最近会话（P-04）—— didInitRef 保证只触发一次
  const didInitRef = useRef(false);
  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    void (async () => {
      const list = await loadSessions().catch(() => [] as typeof sessions);
      if (list.length > 0) {
        await handleSwitch(list[0].id);
      }
      // 空列表 → 保留 session-store 初始 createLocal 生成的 id
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleApprove = async (taskId: string) => {
    updateHitlStatus(taskId, "approved");
    setStatus("sending");
    try {
      await resumeChat(taskId, "approve");
      setStatus("streaming");
    } catch (error) {
      updateHitlStatus(taskId, "pending"); // 回滚乐观更新
      const message =
        error instanceof Error ? error.message : "恢复执行失败";
      setError(message);
      toast.error("审批操作失败，请重试");
    }
  };

  const handleReject = async (taskId: string) => {
    updateHitlStatus(taskId, "rejected");
    setStatus("sending");
    try {
      await resumeChat(
        taskId,
        "reject",
        "用户已主动取消此次工具调用，请确认用户意图后再继续，不要重复尝试。"
      );
      setStatus("streaming");
    } catch (error) {
      updateHitlStatus(taskId, "pending"); // 回滚乐观更新
      const message =
        error instanceof Error ? error.message : "恢复执行失败";
      setError(message);
      toast.error("审批操作失败，请重试");
    }
  };

  const handleFeedback = async (taskId: string, feedbackMessage: string) => {
    updateHitlStatus(taskId, "feedback");
    setStatus("sending");
    try {
      await resumeChat(taskId, "reject", feedbackMessage);
      setStatus("streaming");
    } catch (error) {
      updateHitlStatus(taskId, "pending"); // 回滚乐观更新
      const message =
        error instanceof Error ? error.message : "恢复执行失败";
      setError(message);
      toast.error("反馈提交失败，请重试");
    }
  };

  const handleSend = async (text: string) => {
    addUserMessage(text);
    setStatus("sending");

    try {
      const response = await invokeChat(activeSessionId, text);
      // 必须在 setCurrentTaskId（触发 useSSE）之前插入 assistant 占位，否则 token 事件会落到 user message 上被丢弃
      addAssistantMessage();
      setCurrentTaskId(response.task_id);
      setStatus("streaming");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "服务暂时不可用，请稍后重试";
      setError(message);

      if (error instanceof TypeError) {
        toast.error("发送失败，请检查网络连接");
      } else {
        toast.error("服务暂时不可用，请稍后重试");
      }
    }
  };

  return (
    <AppLayout
      sidebar={
        <Sidebar onSwitch={handleSwitch} onDelete={handleDelete} onNew={handleNew} />
      }
    >
      <ChatArea>
        <MessageList
          messages={messages}
          status={status}
          errorMessage={errorMessage}
          scrollRef={scrollRef}
          onScroll={onScroll}
          onApprove={handleApprove}
          onReject={handleReject}
          onFeedback={handleFeedback}
        />
        <ChatInput onSend={handleSend} />
      </ChatArea>
    </AppLayout>
  );
}
