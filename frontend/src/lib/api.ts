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
