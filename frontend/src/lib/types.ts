export type TextSegment = { type: "text"; content: string };

export type ToolSegment = {
  type: "tool";
  name: string;
  status: "calling" | "done";
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

export type ChatStatus = "idle" | "sending" | "streaming" | "interrupted" | "error";

export interface InvokeResponse {
  task_id: string;
  session_id: string;
  status: string;
}
