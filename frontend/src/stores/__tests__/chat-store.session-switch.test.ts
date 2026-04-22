import { describe, it, expect, beforeEach } from "vitest";
import { useChatStore } from "@/stores/chat-store";
import type { Message, Todo } from "@/lib/types";

beforeEach(() => {
  useChatStore.setState({
    messages: [],
    todos: [],
    status: "idle",
    currentTaskId: null,
    errorMessage: null,
  });
});

function mkMsg(id: string, role: "user" | "assistant"): Message {
  return { id, role, segments: [{ type: "text", content: "" }], timestamp: 0 };
}

describe("chat-store.session-switch 联动 todos", () => {
  it("loadHistory 注入 messages + todos", () => {
    useChatStore.getState().loadHistory({
      messages: [mkMsg("m1", "user"), mkMsg("m2", "assistant")],
      todos: [
        { content: "a", status: "pending" },
        { content: "b", status: "in_progress" },
      ],
    });
    const s = useChatStore.getState();
    expect(s.messages).toHaveLength(2);
    expect(s.todos).toHaveLength(2);
  });

  it("loadHistory 空态 → todos 为空数组", () => {
    useChatStore.getState().loadHistory({ messages: [], todos: [] });
    expect(useChatStore.getState().todos).toEqual([]);
  });

  it("reset 清空 todos", () => {
    const { setTodos, reset } = useChatStore.getState();
    setTodos([
      { content: "a", status: "pending" },
      { content: "b", status: "completed" },
    ]);
    reset();
    expect(useChatStore.getState().todos).toEqual([]);
  });

  it("loadHistory 是整体替换而非 merge", () => {
    const { setTodos, loadHistory } = useChatStore.getState();
    setTodos([
      { content: "a", status: "pending" },
      { content: "b", status: "pending" },
      { content: "c", status: "pending" },
    ]);
    loadHistory({ messages: [], todos: [{ content: "only_one", status: "completed" }] });
    const todos = useChatStore.getState().todos;
    expect(todos).toHaveLength(1);
    expect(todos[0].content).toBe("only_one");
  });

  it("loadHistory 清空 currentTaskId（烟雾测试，与老语义兼容）", () => {
    useChatStore.setState({ currentTaskId: "t-old" });
    useChatStore.getState().loadHistory({ messages: [], todos: [] });
    expect(useChatStore.getState().currentTaskId).toBeNull();
  });
});
