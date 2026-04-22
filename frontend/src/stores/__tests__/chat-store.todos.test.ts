import { describe, it, expect, beforeEach } from "vitest";
import { useChatStore } from "@/stores/chat-store";
import type { Todo } from "@/lib/types";

beforeEach(() => {
  useChatStore.setState({
    messages: [],
    todos: [],
    status: "idle",
    currentTaskId: null,
    errorMessage: null,
  });
});

describe("chat-store.todos", () => {
  it("initial todos is empty array", () => {
    expect(useChatStore.getState().todos).toEqual([]);
  });

  it("setTodos writes the full list", () => {
    const list: Todo[] = [{ content: "a", status: "pending" }];
    useChatStore.getState().setTodos(list);
    expect(useChatStore.getState().todos).toEqual(list);
  });

  it("setTodos replaces (does not merge)", () => {
    const { setTodos } = useChatStore.getState();
    setTodos([
      { content: "a", status: "pending" },
      { content: "b", status: "in_progress" },
      { content: "c", status: "completed" },
    ]);
    setTodos([
      { content: "x", status: "pending" },
      { content: "y", status: "completed" },
    ]);
    const after = useChatStore.getState().todos;
    expect(after).toHaveLength(2);
    expect(after[0].content).toBe("x");
    expect(after[1].status).toBe("completed");
  });

  it("setTodos([]) clears", () => {
    const { setTodos } = useChatStore.getState();
    setTodos([{ content: "a", status: "pending" }]);
    setTodos([]);
    expect(useChatStore.getState().todos).toEqual([]);
  });
});
