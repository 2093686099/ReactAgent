import { beforeEach, describe, expect, it } from "vitest";
import type { Message } from "@/lib/types";
import { useChatStore } from "@/stores/chat-store";

function makeAssistantMessage(segments: Message["segments"]): Message {
  return {
    id: "assistant-1",
    role: "assistant",
    segments,
    timestamp: 0,
  };
}

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

describe("chat-store.resolveLastPendingHitl", () => {
  it("no-op when no messages", () => {
    const before = useChatStore.getState().messages;
    useChatStore.getState().resolveLastPendingHitl("approved", "maps_search");
    expect(useChatStore.getState().messages).toBe(before);
    expect(useChatStore.getState().messages).toEqual([]);
  });

  it("no-op when last message is user", () => {
    useChatStore.setState({
      messages: [
        {
          id: "user-1",
          role: "user",
          segments: [{ type: "text", content: "hello" }],
          timestamp: 0,
        },
      ],
    });
    const before = useChatStore.getState().messages;
    useChatStore.getState().resolveLastPendingHitl("approved", "maps_search");
    expect(useChatStore.getState().messages).toBe(before);
  });

  it("no-op when no pending hitl exists", () => {
    useChatStore.setState({
      messages: [
        makeAssistantMessage([
          { type: "text", content: "" },
          {
            type: "hitl",
            toolName: "maps_search",
            description: "desc",
            status: "approved",
            taskId: "t1",
          },
          { type: "text", content: "" },
        ]),
      ],
    });
    const before = useChatStore.getState().messages;
    useChatStore.getState().resolveLastPendingHitl("approved", "maps_search");
    expect(useChatStore.getState().messages).toBe(before);
  });

  it("resolves the pending hitl whose toolName matches the payload hint", () => {
    useChatStore.setState({
      messages: [
        makeAssistantMessage([
          { type: "text", content: "" },
          {
            type: "hitl",
            toolName: "maps_search",
            description: "maps",
            status: "pending",
            taskId: "t1",
          },
          {
            type: "hitl",
            toolName: "weather_lookup",
            description: "weather",
            status: "pending",
            taskId: "t2",
          },
          { type: "text", content: "" },
        ]),
      ],
    });

    useChatStore
      .getState()
      .resolveLastPendingHitl("approved", "maps_search");

    const segments = useChatStore.getState().messages[0].segments;
    expect(segments[1].type === "hitl" && segments[1].status).toBe("approved");
    expect(segments[2].type === "hitl" && segments[2].status).toBe("pending");
  });

  it("falls back to the most recent pending hitl when toolName is missing", () => {
    useChatStore.setState({
      messages: [
        makeAssistantMessage([
          { type: "text", content: "" },
          {
            type: "hitl",
            toolName: "maps_search",
            description: "maps",
            status: "pending",
            taskId: "t1",
          },
          {
            type: "hitl",
            toolName: "weather_lookup",
            description: "weather",
            status: "pending",
            taskId: "t2",
          },
          { type: "text", content: "" },
        ]),
      ],
    });

    useChatStore.getState().resolveLastPendingHitl("approved");

    const segments = useChatStore.getState().messages[0].segments;
    expect(segments[1].type === "hitl" && segments[1].status).toBe("pending");
    expect(segments[2].type === "hitl" && segments[2].status).toBe("approved");
  });

  it("reject decision backfills preceding same-tool tool pill to rejected", () => {
    useChatStore.setState({
      messages: [
        makeAssistantMessage([
          { type: "text", content: "" },
          { type: "tool", name: "maps_search", status: "done" },
          {
            type: "hitl",
            toolName: "maps_search",
            description: "maps",
            status: "pending",
            taskId: "t1",
          },
          { type: "text", content: "" },
        ]),
      ],
    });

    useChatStore
      .getState()
      .resolveLastPendingHitl("rejected", "maps_search");

    const segments = useChatStore.getState().messages[0].segments;
    expect(segments[1].type === "tool" && segments[1].status).toBe("rejected");
    expect(segments[2].type === "hitl" && segments[2].status).toBe("rejected");
  });

  it("multiple pending hitl with different tools leaves non-target cards untouched", () => {
    useChatStore.setState({
      messages: [
        makeAssistantMessage([
          { type: "text", content: "" },
          {
            type: "hitl",
            toolName: "maps_search",
            description: "maps",
            status: "pending",
            taskId: "t1",
          },
          {
            type: "hitl",
            toolName: "weather_lookup",
            description: "weather",
            status: "pending",
            taskId: "t2",
          },
          { type: "text", content: "" },
        ]),
      ],
    });

    useChatStore
      .getState()
      .resolveLastPendingHitl("approved", "weather_lookup");

    const segments = useChatStore.getState().messages[0].segments;
    expect(segments[1].type === "hitl" && segments[1].status).toBe("pending");
    expect(segments[2].type === "hitl" && segments[2].status).toBe("approved");
  });

  it("idempotent: second call is a no-op", () => {
    useChatStore.setState({
      messages: [
        makeAssistantMessage([
          { type: "text", content: "" },
          {
            type: "hitl",
            toolName: "maps_search",
            description: "maps",
            status: "pending",
            taskId: "t1",
          },
          { type: "text", content: "" },
        ]),
      ],
    });

    useChatStore
      .getState()
      .resolveLastPendingHitl("approved", "maps_search");
    const first = useChatStore.getState().messages;
    useChatStore
      .getState()
      .resolveLastPendingHitl("approved", "maps_search");

    const second = useChatStore.getState().messages;
    expect(second).toBe(first);
    expect(second[0].segments[1].type === "hitl" && second[0].segments[1].status).toBe(
      "approved",
    );
  });
});
