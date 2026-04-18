import { create } from "zustand";
import type { ChatStatus, HitlStatus, Message, ToolSegment } from "@/lib/types";

type ChatState = {
  messages: Message[];
  status: ChatStatus;
  currentTaskId: string | null;
  activeSessionId: string;
  errorMessage: string | null;
  addUserMessage: (text: string) => void;
  addAssistantMessage: () => void;
  appendToken: (text: string) => void;
  addToolSegment: (name: string, status: ToolSegment["status"]) => void;
  updateToolSegment: (name: string, status: ToolSegment["status"]) => void;
  finishMessage: () => void;
  setError: (message: string) => void;
  addHitlSegment: (toolName: string, description: string, taskId: string) => void;
  updateHitlStatus: (taskId: string, status: HitlStatus) => void;
  setStatus: (status: ChatStatus) => void;
  setCurrentTaskId: (taskId: string | null) => void;
  reset: () => void;
};

function createSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `session-${Date.now()}`;
}

function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}`;
}

let tokenBuffer = "";
let rafId = 0;

function flushTokenBuffer(set: (fn: (state: ChatState) => Partial<ChatState>) => void) {
  if (!tokenBuffer) {
    rafId = 0;
    return;
  }

  const chunk = tokenBuffer;
  tokenBuffer = "";
  rafId = 0;

  set((state) => {
    if (!state.messages.length) {
      return {};
    }

    const nextMessages = [...state.messages];
    const lastMessage = nextMessages[nextMessages.length - 1];
    if (lastMessage.role !== "assistant") {
      return {};
    }

    const lastSegmentIndex = lastMessage.segments.length - 1;
    if (lastSegmentIndex < 0) {
      return {};
    }

    const lastSegment = lastMessage.segments[lastSegmentIndex];
    if (lastSegment.type !== "text") {
      return {};
    }

    const updatedMessage: Message = {
      ...lastMessage,
      segments: [
        ...lastMessage.segments.slice(0, lastSegmentIndex),
        { ...lastSegment, content: `${lastSegment.content}${chunk}` },
      ],
    };

    nextMessages[nextMessages.length - 1] = updatedMessage;
    return { messages: nextMessages };
  });
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  status: "idle",
  currentTaskId: null,
  activeSessionId: createSessionId(),
  errorMessage: null,

  addUserMessage: (text) =>
    set((state) => ({
      messages: [
        ...state.messages,
        {
          id: createId("user"),
          role: "user",
          segments: [{ type: "text", content: text }],
          timestamp: Date.now(),
        },
      ],
      errorMessage: null,
    })),

  addAssistantMessage: () =>
    set((state) => ({
      messages: [
        ...state.messages,
        {
          id: createId("assistant"),
          role: "assistant",
          segments: [{ type: "text", content: "" }],
          timestamp: Date.now(),
        },
      ],
      errorMessage: null,
    })),

  appendToken: (text) => {
    tokenBuffer += text;
    if (!rafId) {
      rafId = requestAnimationFrame(() => flushTokenBuffer(set));
    }
  },

  addToolSegment: (name, status) =>
    set((state) => {
      if (!state.messages.length) {
        return {};
      }

      const nextMessages = [...state.messages];
      const lastMessage = nextMessages[nextMessages.length - 1];
      if (lastMessage.role !== "assistant") {
        return {};
      }

      const updatedMessage: Message = {
        ...lastMessage,
        segments: [
          ...lastMessage.segments,
          { type: "tool", name, status },
          { type: "text", content: "" },
        ],
      };
      nextMessages[nextMessages.length - 1] = updatedMessage;
      return { messages: nextMessages };
    }),

  updateToolSegment: (name, status) =>
    set((state) => {
      if (!state.messages.length) {
        return {};
      }

      const nextMessages = [...state.messages];
      const lastMessage = nextMessages[nextMessages.length - 1];
      if (lastMessage.role !== "assistant") {
        return {};
      }

      const segments = lastMessage.segments.map((segment) => {
        if (segment.type === "tool" && segment.name === name) {
          return { ...segment, status };
        }
        return segment;
      });

      nextMessages[nextMessages.length - 1] = { ...lastMessage, segments };
      return { messages: nextMessages };
    }),

  addHitlSegment: (toolName, description, taskId) =>
    set((state) => {
      if (!state.messages.length) {
        return {};
      }

      const nextMessages = [...state.messages];
      const lastMessage = nextMessages[nextMessages.length - 1];
      if (lastMessage.role !== "assistant") {
        return {};
      }

      const updatedMessage: Message = {
        ...lastMessage,
        segments: [
          ...lastMessage.segments,
          { type: "hitl", toolName, description, status: "pending", taskId },
          { type: "text", content: "" },
        ],
      };
      nextMessages[nextMessages.length - 1] = updatedMessage;
      return { messages: nextMessages };
    }),

  updateHitlStatus: (taskId, status) =>
    set((state) => {
      if (!state.messages.length) {
        return {};
      }

      const nextMessages = [...state.messages];
      const lastMessage = nextMessages[nextMessages.length - 1];
      if (lastMessage.role !== "assistant") {
        return {};
      }

      // 同一 taskId 在 Agent 重新规划后可能产生多次 HITL，只更新最后一个 pending
      let targetIndex = -1;
      for (let i = lastMessage.segments.length - 1; i >= 0; i--) {
        const segment = lastMessage.segments[i];
        if (
          segment.type === "hitl" &&
          segment.taskId === taskId &&
          segment.status === "pending"
        ) {
          targetIndex = i;
          break;
        }
      }
      if (targetIndex === -1) {
        return {};
      }

      const segments = lastMessage.segments.map((segment, index) => {
        if (index === targetIndex && segment.type === "hitl") {
          return { ...segment, status };
        }
        return segment;
      });

      nextMessages[nextMessages.length - 1] = { ...lastMessage, segments };
      return { messages: nextMessages };
    }),

  finishMessage: () => {
    if (rafId) {
      cancelAnimationFrame(rafId);
    }
    flushTokenBuffer(set);
    set({ status: "idle", currentTaskId: null });
  },

  setError: (message) => {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    tokenBuffer = "";
    set({ status: "error", currentTaskId: null, errorMessage: message });
  },

  setStatus: (status) => set({ status }),

  setCurrentTaskId: (taskId) => set({ currentTaskId: taskId }),

  reset: () => {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    tokenBuffer = "";
    set({
      messages: [],
      status: "idle",
      currentTaskId: null,
      errorMessage: null,
      activeSessionId: createSessionId(),
    });
  },
}));
