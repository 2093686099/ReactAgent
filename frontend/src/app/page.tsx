"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { ChatArea } from "@/components/chat/chat-area";
import { ChatInput } from "@/components/chat/chat-input";
import { MessageList } from "@/components/chat/message-list";
import { AppLayout } from "@/components/layout/app-layout";
import { useAutoScroll } from "@/hooks/use-auto-scroll";
import { useSSE } from "@/hooks/use-sse";
import { invokeChat, resumeChat } from "@/lib/api";
import { useChatStore } from "@/stores/chat-store";

export default function ChatPage() {
  const messages = useChatStore((state) => state.messages);
  const status = useChatStore((state) => state.status);
  const currentTaskId = useChatStore((state) => state.currentTaskId);
  const activeSessionId = useChatStore((state) => state.activeSessionId);
  const errorMessage = useChatStore((state) => state.errorMessage);

  const addUserMessage = useChatStore((state) => state.addUserMessage);
  const addAssistantMessage = useChatStore((state) => state.addAssistantMessage);
  const setStatus = useChatStore((state) => state.setStatus);
  const setCurrentTaskId = useChatStore((state) => state.setCurrentTaskId);
  const setError = useChatStore((state) => state.setError);
  const updateHitlStatus = useChatStore((state) => state.updateHitlStatus);

  useSSE(currentTaskId);

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

  const handleApprove = async (taskId: string) => {
    updateHitlStatus(taskId, "approved");
    setStatus("sending");
    try {
      await resumeChat(taskId, "approve");
      setStatus("streaming");
    } catch (error) {
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
      await resumeChat(taskId, "reject");
      setStatus("streaming");
    } catch (error) {
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
      const message =
        error instanceof Error ? error.message : "恢复执行失败";
      setError(message);
      toast.error("反馈提交失败，请重试");
    }
  };

  const handleSend = async (text: string) => {
    addUserMessage(text);
    addAssistantMessage();
    setStatus("sending");

    try {
      const response = await invokeChat(activeSessionId, text);
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
    <AppLayout>
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
