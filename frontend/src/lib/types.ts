export type TextSegment = { type: "text"; content: string };

export type ToolSegment = {
  type: "tool";
  name: string;
  status: "calling" | "done" | "rejected";
};

export type HitlStatus = "pending" | "approved" | "rejected" | "feedback";

export type HitlSegment = {
  type: "hitl";
  toolName: string;
  description: string;
  status: HitlStatus;
  taskId: string;
};

export type Segment = TextSegment | ToolSegment | HitlSegment;

export interface Message {
  id: string;
  role: "user" | "assistant";
  segments: Segment[];
  timestamp: number;
}

export type Todo = {
  content: string;
  status: "pending" | "in_progress" | "completed";
};

export type ChatStatus = "idle" | "sending" | "streaming" | "interrupted" | "error";

export interface InvokeResponse {
  task_id: string;
  session_id: string;
  status: string;
}

export interface Session {
  id: string;
  title: string;
  created_at: number;
  last_updated: number; // 后端秒级 float
  status: string; // "idle" | "running" | ...
  last_task_id?: string | null;
}

export interface ActiveTask {
  task_id: string;
  status: string;
}

export interface HistoryResponse {
  messages: Message[];
  todos: Todo[];
  active_task: ActiveTask | null;
  truncate_after_active_task: boolean;
}

export type ToolCategory = "custom" | "researcher" | "data_analyst";

export interface ToolMeta {
  name: string;
  category: ToolCategory;
  hitl: boolean;
}

export interface SystemMeta {
  llm: { provider: string; model: string | null };
  tools: ToolMeta[];
}
