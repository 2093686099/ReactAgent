import type { HistoryResponse, InvokeResponse, Session, SystemMeta } from "@/lib/types";

export const API_BASE = "http://localhost:8001";

type RawSession = {
  session_id: string;
  title?: string;
  created_at: number;
  last_updated: number;
  status: string;
  last_task_id?: string | null;
};

function mapSession(raw: RawSession): Session {
  return {
    id: raw.session_id,
    title: raw.title ?? "",
    created_at: raw.created_at,
    last_updated: raw.last_updated,
    status: raw.status,
    last_task_id: raw.last_task_id ?? null,
  };
}

export async function invokeChat(sessionId: string, query: string): Promise<InvokeResponse> {
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

export async function fetchSystemMeta(): Promise<SystemMeta> {
  const r = await fetch(`${API_BASE}/api/system/meta`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as SystemMeta;
}

export async function listSessions(): Promise<Session[]> {
  const r = await fetch(`${API_BASE}/api/sessions`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const body = (await r.json()) as { sessions: RawSession[] };
  return body.sessions.map(mapSession);
}

export async function createSessionAPI(
  input: { session_id?: string; title?: string; last_task_id?: string | null } = {},
): Promise<Session> {
  const r = await fetch(`${API_BASE}/api/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const body = (await r.json()) as Partial<RawSession> & { session_id: string };
  return mapSession({
    session_id: body.session_id,
    title: body.title ?? "",
    created_at: body.created_at ?? 0,
    last_updated: body.last_updated ?? 0,
    status: body.status ?? "idle",
    last_task_id: body.last_task_id ?? null,
  });
}

export async function deleteSession(sessionId: string): Promise<void> {
  const r = await fetch(`${API_BASE}/api/sessions/${sessionId}`, {
    method: "DELETE",
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
}

export async function loadHistory(sessionId: string): Promise<HistoryResponse> {
  const r = await fetch(`${API_BASE}/api/sessions/${sessionId}/messages`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as HistoryResponse;
}

export async function resumeChat(
  taskId: string,
  responseType: "approve" | "reject",
  message?: string,
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
