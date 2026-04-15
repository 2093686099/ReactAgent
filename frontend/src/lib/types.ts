export type TextSegment = { type: "text"; content: string };

export type ToolSegment = {
  type: "tool";
  name: string;
  status: "calling" | "done";
};

export type Segment = TextSegment | ToolSegment;

export interface Message {
  id: string;
  role: "user" | "assistant";
  segments: Segment[];
  timestamp: number;
}

export type ChatStatus = "idle" | "sending" | "streaming" | "error";

export interface InvokeResponse {
  task_id: string;
  session_id: string;
  status: string;
}
