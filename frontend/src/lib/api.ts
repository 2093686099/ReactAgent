import type { InvokeResponse } from "@/lib/types";

export const API_BASE = "http://localhost:8001";

export async function invokeChat(
  sessionId: string,
  query: string
): Promise<InvokeResponse> {
  const response = await fetch(`${API_BASE}/api/chat/invoke`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, query }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }

  return response.json() as Promise<InvokeResponse>;
}

export async function resumeChat(
  taskId: string,
  responseType: "approve" | "reject",
  message?: string
): Promise<InvokeResponse> {
  const body: Record<string, unknown> = {
    task_id: taskId,
    response_type: responseType,
  };
  if (responseType === "reject" && message) {
    body.args = { message };
  }
  const response = await fetch(`${API_BASE}/api/chat/resume`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }

  return response.json() as Promise<InvokeResponse>;
}
