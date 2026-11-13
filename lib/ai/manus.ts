const MANUS_BASE = "https://api.manus.ai/v2";

type ManusResponse<T> = {
  ok?: boolean;
  request_id?: string;
  task_id?: string;
  task_url?: string;
  error?: { code?: string; message?: string };
  data?: T;
  task?: T;
};

async function request<T>(path: string, apiKey: string, init: RequestInit = {}): Promise<{ ok: boolean; status: number; requestId?: string; data?: T; error?: string }> {
  try {
    const response = await fetch(MANUS_BASE + path, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(30000),
      headers: {
        "content-type": "application/json",
        "x-manus-api-key": apiKey,
        ...(init.headers ?? {}),
      },
    });
    const raw = await response.text();
    let parsed: ManusResponse<T> = {};
    try { parsed = JSON.parse(raw) as ManusResponse<T>; } catch { /* response body is not trusted */ }
    const error = parsed.error?.message || (response.ok ? undefined : `Manus HTTP ${response.status}`);
    const data = parsed.data ?? parsed.task ?? (parsed.task_id ? ({ id: parsed.task_id, task_url: parsed.task_url } as T) : undefined);
    return { ok: response.ok && parsed.ok !== false, status: response.status, requestId: parsed.request_id, data, error };
  } catch (error) {
    return { ok: false, status: 0, error: error instanceof Error ? error.name : "NETWORK_ERROR" };
  }
}

export type ManusTask = {
  id: string;
  status: "running" | "stopped" | "waiting" | "error" | "deleted";
  title?: string;
  task_url?: string;
  credit_usage?: number;
  has_running_background_jobs?: boolean;
};

export async function manusHealthCheck(apiKey: string) {
  return request<{ id?: string; email?: string }>("/user.me", apiKey);
}

export async function manusCreateTask(apiKey: string, content: string, options: {
  agentProfile?: "standard" | "lite" | "max";
  locale?: string;
  projectId?: string;
  structuredOutputSchema?: Record<string, unknown>;
} = {}) {
  return request<ManusTask>("/task.create", apiKey, {
    method: "POST",
    body: JSON.stringify({
      message: { content },
      agent_profile: options.agentProfile,
      locale: options.locale,
      project_id: options.projectId,
      structured_output_schema: options.structuredOutputSchema,
      share_visibility: "private",
    }),
  });
}

export async function manusTaskDetail(apiKey: string, taskId: string) {
  return request<ManusTask>(`/task.detail?task_id=${encodeURIComponent(taskId)}`, apiKey);
}

export async function manusListMessages(apiKey: string, taskId: string, limit = 20) {
  return request<Record<string, unknown>[]>(`/task.listMessages?task_id=${encodeURIComponent(taskId)}&order=desc&limit=${Math.min(Math.max(limit, 1), 100)}`, apiKey);
}

export async function manusSendMessage(apiKey: string, taskId: string, content: string) {
  return request<Record<string, unknown>>("/task.sendMessage", apiKey, {
    method: "POST",
    body: JSON.stringify({ task_id: taskId, message: { content } }),
  });
}

export async function manusStopTask(apiKey: string, taskId: string) {
  return request<Record<string, unknown>>("/task.stop", apiKey, {
    method: "POST",
    body: JSON.stringify({ task_id: taskId }),
  });
}
