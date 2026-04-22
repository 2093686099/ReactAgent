import { beforeEach, describe, expect, it } from "vitest";
import type { Message } from "@/lib/types";
import { useChatStore } from "@/stores/chat-store";

beforeEach(() => {
  useChatStore.setState({
    messages: [],
    todos: [],
    status: "idle",
    currentTaskId: null,
    errorMessage: null,
    connectionStatus: "connected",
  });
});

describe("chat-store.connectionStatus", () => {
  it("initial state is connected", () => {
    expect(useChatStore.getState().connectionStatus).toBe("connected");
  });

  it("setConnectionStatus flips between reconnecting and connected", () => {
    useChatStore.getState().setConnectionStatus("reconnecting");
    expect(useChatStore.getState().connectionStatus).toBe("reconnecting");
    useChatStore.getState().setConnectionStatus("connected");
    expect(useChatStore.getState().connectionStatus).toBe("connected");
  });

  it("reset restores connectionStatus to connected", () => {
    useChatStore.getState().setConnectionStatus("reconnecting");
    useChatStore.getState().reset();
    expect(useChatStore.getState().connectionStatus).toBe("connected");
  });

  it("loadHistory restores connectionStatus to connected", () => {
    const msg: Message = {
      id: "assistant-1",
      role: "assistant",
      segments: [{ type: "text", content: "hello" }],
      timestamp: 0,
    };
    useChatStore.getState().setConnectionStatus("reconnecting");
    useChatStore.getState().loadHistory({ messages: [msg], todos: [] });
    const state = useChatStore.getState();
    expect(state.connectionStatus).toBe("connected");
    expect(state.messages).toHaveLength(1);
  });
});
