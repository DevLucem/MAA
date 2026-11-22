import { createId } from "./docs-utils";

export type HermesEndpointMode = "chat" | "runs" | "responses";
export type HermesRoutingMode = "proxy" | "direct";

export interface HermesAgentConfig {
  baseUrl: string;
  apiKey: string;
  routingMode: HermesRoutingMode;
  endpointMode: HermesEndpointMode;
  model: string;
  stream: boolean;
  systemPrompt: string;
  includeWorkspaceContext: boolean;
}

export const DEFAULT_HERMES_CONFIG: HermesAgentConfig = {
  baseUrl: "http://127.0.0.1:8642",
  apiKey: "",
  routingMode: "proxy",
  endpointMode: "chat",
  model: "hermes-agent",
  stream: true,
  systemPrompt:
    "You are Hermes, an autonomous AI agent integrated into the MAA workspace. Help the user with their documents, tasks, finances, and technical workflows concisely and accurately.",
  includeWorkspaceContext: true,
};

export interface AgentToolStep {
  id: string;
  name: string;
  status: "running" | "done" | "error" | "waiting_approval";
  input?: string;
  output?: string;
}

export interface PendingRunInteraction {
  type: "approval" | "clarify";
  runId: string;
  prompt: string;
  toolName?: string;
  command?: string;
}

export interface AgentChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  runId?: string;
  responseId?: string;
  endpointUsed?: HermesEndpointMode;
  status?: "streaming" | "done" | "stopped" | "error" | "waiting";
  error?: string;
  thinking?: string;
  toolSteps?: AgentToolStep[];
  pendingInteraction?: PendingRunInteraction;
}

export interface AgentChatSession {
  id: string;
  sessionKey: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: AgentChatMessage[];
  activeRunId?: string;
  lastResponseId?: string;
}

export interface HermesRemoteSession {
  id: string;
  key?: string;
  title?: string;
  model?: string;
  updatedAt?: string;
  messageCount?: number;
}

export interface HermesJob {
  id: string;
  name: string;
  prompt?: string;
  schedule?: string;
  status: string;
  createdAt?: string;
  lastRunAt?: string;
}

export interface HermesConnectionTestResult {
  ok: boolean;
  status: number;
  latencyMs: number;
  message: string;
  sessionsCount?: number;
}

export function normalizeHermesConfig(raw: unknown): HermesAgentConfig {
  if (!raw || typeof raw !== "object") return DEFAULT_HERMES_CONFIG;
  const obj = raw as Record<string, unknown>;
  const routingMode: HermesRoutingMode =
    obj.routingMode === "direct" ? "direct" : "proxy";
  const endpointMode: HermesEndpointMode =
    obj.endpointMode === "runs" || obj.endpointMode === "responses"
      ? obj.endpointMode
      : "chat";

  return {
    baseUrl:
      typeof obj.baseUrl === "string" && obj.baseUrl.trim()
        ? obj.baseUrl.trim()
        : DEFAULT_HERMES_CONFIG.baseUrl,
    apiKey: typeof obj.apiKey === "string" ? obj.apiKey : "",
    routingMode,
    endpointMode,
    model:
      typeof obj.model === "string" && obj.model.trim()
        ? obj.model.trim()
        : DEFAULT_HERMES_CONFIG.model,
    stream: typeof obj.stream === "boolean" ? obj.stream : true,
    systemPrompt:
      typeof obj.systemPrompt === "string"
        ? obj.systemPrompt
        : DEFAULT_HERMES_CONFIG.systemPrompt,
    includeWorkspaceContext:
      typeof obj.includeWorkspaceContext === "boolean"
        ? obj.includeWorkspaceContext
        : true,
  };
}

export function normalizeAgentSessions(raw: unknown): AgentChatSession[] {
  if (!Array.isArray(raw)) return [];
  const result: AgentChatSession[] = [];
  const seenIds = new Set<string>();

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const s = item as Record<string, unknown>;
    if (typeof s.id !== "string" || !s.id || seenIds.has(s.id)) continue;
    seenIds.add(s.id);

    const rawMessages = Array.isArray(s.messages) ? s.messages : [];
    const messages: AgentChatMessage[] = rawMessages
      .filter((m): m is Record<string, unknown> =>
        Boolean(m && typeof m === "object")
      )
      .map((m) => ({
        id: typeof m.id === "string" && m.id ? m.id : createId(),
        role:
          m.role === "user" || m.role === "assistant" || m.role === "system"
            ? m.role
            : "assistant",
        content: typeof m.content === "string" ? m.content : "",
        createdAt:
          typeof m.createdAt === "string"
            ? m.createdAt
            : new Date().toISOString(),
        ...(typeof m.runId === "string" ? { runId: m.runId } : {}),
        ...(typeof m.responseId === "string"
          ? { responseId: m.responseId }
          : {}),
        ...(m.endpointUsed === "chat" ||
        m.endpointUsed === "runs" ||
        m.endpointUsed === "responses"
          ? { endpointUsed: m.endpointUsed }
          : {}),
        status:
          m.status === "error" || m.status === "stopped" ? m.status : "done",
        ...(typeof m.error === "string" ? { error: m.error } : {}),
        ...(typeof m.thinking === "string" ? { thinking: m.thinking } : {}),
        ...(Array.isArray(m.toolSteps)
          ? { toolSteps: m.toolSteps as AgentChatMessage["toolSteps"] }
          : {}),
      }));

    result.push({
      id: s.id,
      sessionKey:
        typeof s.sessionKey === "string" && s.sessionKey
          ? s.sessionKey
          : `maa-session-${s.id}`,
      title:
        typeof s.title === "string" && s.title.trim()
          ? s.title.trim()
          : "Agent Session",
      createdAt:
        typeof s.createdAt === "string"
          ? s.createdAt
          : new Date().toISOString(),
      updatedAt:
        typeof s.updatedAt === "string"
          ? s.updatedAt
          : new Date().toISOString(),
      messages,
      ...(typeof s.lastResponseId === "string"
        ? { lastResponseId: s.lastResponseId }
        : {}),
    });
  }
  return result;
}

function normalizeBaseUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "");
  return trimmed || DEFAULT_HERMES_CONFIG.baseUrl;
}

/** Builds the target URL and headers for either Next.js backend proxy or direct browser CORS mode. */
export function buildHermesRequestUrlAndHeaders(
  config: HermesAgentConfig,
  path: string,
  sessionKey?: string
): { url: string; headers: Record<string, string> } {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const baseUrl = normalizeBaseUrl(config.baseUrl);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (config.apiKey.trim()) {
    headers["Authorization"] = `Bearer ${config.apiKey.trim()}`;
  }
  if (sessionKey) {
    headers["X-Hermes-Session-Key"] = sessionKey;
  }

  if (config.routingMode === "proxy") {
    headers["X-Hermes-Base-Url"] = baseUrl;
    if (config.apiKey.trim()) {
      headers["X-Hermes-Api-Key"] = config.apiKey.trim();
    }
    return {
      url: `/api/hermes${cleanPath}`,
      headers,
    };
  }

  return {
    url: `${baseUrl}${cleanPath}`,
    headers,
  };
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const text = await response.text();
    if (!text) return `HTTP ${response.status} ${response.statusText}`;
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (
      parsed.error &&
      typeof parsed.error === "object" &&
      typeof (parsed.error as Record<string, unknown>).message === "string"
    ) {
      return (parsed.error as Record<string, unknown>).message as string;
    }
    if (typeof parsed.error === "string") return parsed.error;
    if (typeof parsed.detail === "string") return parsed.detail;
    if (typeof parsed.message === "string") return parsed.message;
    return text.slice(0, 300);
  } catch {
    return `HTTP ${response.status} ${response.statusText}`;
  }
}

/** Tests connectivity and authentication against the Hermes API server. */
export async function testHermesConnection(
  config: HermesAgentConfig
): Promise<HermesConnectionTestResult> {
  const startedAt = performance.now();
  const { url, headers } = buildHermesRequestUrlAndHeaders(
    config,
    "/api/sessions"
  );

  try {
    const response = await fetch(url, {
      method: "GET",
      headers,
      cache: "no-store",
    });
    const latencyMs = Math.round(performance.now() - startedAt);

    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        status: response.status,
        latencyMs,
        message:
          "Hermes server is reachable, but authentication failed (401/403). Check your API_SERVER_KEY Bearer token.",
      };
    }

    if (response.status === 502) {
      const errMsg = await readErrorMessage(response);
      return {
        ok: false,
        status: 502,
        latencyMs,
        message: errMsg,
      };
    }

    if (!response.ok) {
      // Fallback check to /v1/models in case /api/sessions is disabled on a minimal build
      const fallback = buildHermesRequestUrlAndHeaders(config, "/v1/models");
      const modelRes = await fetch(fallback.url, {
        method: "GET",
        headers: fallback.headers,
        cache: "no-store",
      });
      const totalLatency = Math.round(performance.now() - startedAt);
      if (modelRes.ok) {
        return {
          ok: true,
          status: modelRes.status,
          latencyMs: totalLatency,
          message: `Connected to Hermes at ${normalizeBaseUrl(config.baseUrl)} (${totalLatency} ms).`,
        };
      }
      const errMsg = await readErrorMessage(response);
      return {
        ok: false,
        status: response.status,
        latencyMs: totalLatency,
        message: errMsg,
      };
    }

    let sessionsCount: number | undefined;
    try {
      const data = (await response.json()) as unknown;
      if (Array.isArray(data)) {
        sessionsCount = data.length;
      } else if (
        data &&
        typeof data === "object" &&
        Array.isArray((data as Record<string, unknown>).sessions)
      ) {
        sessionsCount = ((data as Record<string, unknown>).sessions as unknown[])
          .length;
      } else if (
        data &&
        typeof data === "object" &&
        Array.isArray((data as Record<string, unknown>).data)
      ) {
        sessionsCount = ((data as Record<string, unknown>).data as unknown[])
          .length;
      }
    } catch {
      // Ignore JSON parsing on health check
    }

    return {
      ok: true,
      status: response.status,
      latencyMs,
      sessionsCount,
      message: `Connected to Hermes at ${normalizeBaseUrl(config.baseUrl)} (${latencyMs} ms)${
        typeof sessionsCount === "number"
          ? ` · ${sessionsCount} active ${sessionsCount === 1 ? "session" : "sessions"}`
          : ""
      }.`,
    };
  } catch (error) {
    const latencyMs = Math.round(performance.now() - startedAt);
    const reason =
      error instanceof Error ? error.message : "Network request failed";
    return {
      ok: false,
      status: 0,
      latencyMs,
      message:
        config.routingMode === "direct"
          ? `Direct browser request to ${normalizeBaseUrl(config.baseUrl)} failed (${reason}). Check that "hermes gateway" is running and API_SERVER_CORS_ORIGINS includes ${typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"}, or switch to Backend Proxy mode.`
          : `Could not reach Hermes at ${normalizeBaseUrl(config.baseUrl)} (${reason}). Run "hermes gateway" with API_SERVER_ENABLED=true.`,
    };
  }
}

/** GET /api/sessions */
export async function fetchHermesSessions(
  config: HermesAgentConfig
): Promise<HermesRemoteSession[]> {
  const { url, headers } = buildHermesRequestUrlAndHeaders(
    config,
    "/api/sessions"
  );
  const response = await fetch(url, {
    method: "GET",
    headers,
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  const raw = (await response.json()) as unknown;
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object"
      ? ((raw as Record<string, unknown>).sessions as unknown[]) ||
        ((raw as Record<string, unknown>).data as unknown[]) ||
        []
      : [];

  return list
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .map((item, index) => ({
      id:
        (typeof item.id === "string" && item.id) ||
        (typeof item.session_id === "string" && item.session_id) ||
        (typeof item.key === "string" && item.key) ||
        `session-${index + 1}`,
      key:
        (typeof item.key === "string" && item.key) ||
        (typeof item.session_key === "string" && item.session_key) ||
        (typeof item.id === "string" && item.id) ||
        undefined,
      title:
        (typeof item.title === "string" && item.title) ||
        (typeof item.name === "string" && item.name) ||
        undefined,
      model: typeof item.model === "string" ? item.model : undefined,
      updatedAt:
        (typeof item.updated_at === "string" && item.updated_at) ||
        (typeof item.updatedAt === "string" && item.updatedAt) ||
        (typeof item.created_at === "string" && item.created_at) ||
        undefined,
      messageCount:
        typeof item.message_count === "number"
          ? item.message_count
          : typeof item.messageCount === "number"
            ? item.messageCount
            : undefined,
    }));
}

/** POST /api/sessions */
export async function createHermesRemoteSession(
  config: HermesAgentConfig,
  payload: { sessionKey: string; title?: string; model?: string }
): Promise<HermesRemoteSession> {
  const { url, headers } = buildHermesRequestUrlAndHeaders(
    config,
    "/api/sessions",
    payload.sessionKey
  );
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      session_key: payload.sessionKey,
      key: payload.sessionKey,
      title: payload.title || "MAA Session",
      model: payload.model || config.model,
    }),
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  const data = (await response.json()) as Record<string, unknown>;
  return {
    id:
      (typeof data.id === "string" && data.id) ||
      (typeof data.session_id === "string" && data.session_id) ||
      payload.sessionKey,
    key:
      (typeof data.key === "string" && data.key) ||
      (typeof data.session_key === "string" && data.session_key) ||
      payload.sessionKey,
    title:
      (typeof data.title === "string" && data.title) ||
      payload.title ||
      "MAA Session",
  };
}

/** GET /api/jobs */
export async function fetchHermesJobs(
  config: HermesAgentConfig
): Promise<HermesJob[]> {
  const { url, headers } = buildHermesRequestUrlAndHeaders(config, "/api/jobs");
  const response = await fetch(url, {
    method: "GET",
    headers,
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  const raw = (await response.json()) as unknown;
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object"
      ? ((raw as Record<string, unknown>).jobs as unknown[]) ||
        ((raw as Record<string, unknown>).data as unknown[]) ||
        []
      : [];

  return list
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .map((item, idx) => ({
      id:
        (typeof item.id === "string" && item.id) ||
        (typeof item.job_id === "string" && item.job_id) ||
        `job-${idx + 1}`,
      name:
        (typeof item.name === "string" && item.name) ||
        (typeof item.title === "string" && item.title) ||
        (typeof item.prompt === "string" && item.prompt.slice(0, 48)) ||
        `Job ${idx + 1}`,
      prompt:
        (typeof item.prompt === "string" && item.prompt) ||
        (typeof item.command === "string" && item.command) ||
        undefined,
      schedule:
        (typeof item.schedule === "string" && item.schedule) ||
        (typeof item.cron === "string" && item.cron) ||
        undefined,
      status:
        (typeof item.status === "string" && item.status) ||
        (item.enabled === false ? "paused" : "active"),
      createdAt:
        (typeof item.created_at === "string" && item.created_at) ||
        (typeof item.createdAt === "string" && item.createdAt) ||
        undefined,
      lastRunAt:
        (typeof item.last_run_at === "string" && item.last_run_at) ||
        (typeof item.lastRunAt === "string" && item.lastRunAt) ||
        undefined,
    }));
}

/** POST /api/jobs */
export async function createHermesJob(
  config: HermesAgentConfig,
  payload: { name: string; prompt: string; schedule?: string; sessionKey?: string }
): Promise<HermesJob> {
  const { url, headers } = buildHermesRequestUrlAndHeaders(
    config,
    "/api/jobs",
    payload.sessionKey
  );
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: payload.name,
      prompt: payload.prompt,
      ...(payload.schedule ? { schedule: payload.schedule, cron: payload.schedule } : {}),
      ...(payload.sessionKey ? { session_key: payload.sessionKey } : {}),
    }),
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  const item = (await response.json()) as Record<string, unknown>;
  return {
    id:
      (typeof item.id === "string" && item.id) ||
      (typeof item.job_id === "string" && item.job_id) ||
      `job-${Date.now()}`,
    name:
      (typeof item.name === "string" && item.name) || payload.name,
    prompt:
      (typeof item.prompt === "string" && item.prompt) || payload.prompt,
    schedule:
      (typeof item.schedule === "string" && item.schedule) ||
      payload.schedule,
    status: (typeof item.status === "string" && item.status) || "scheduled",
  };
}

/** POST /v1/runs/{id}/stop */
export async function stopHermesRun(
  config: HermesAgentConfig,
  runId: string,
  sessionKey?: string
): Promise<void> {
  const { url, headers } = buildHermesRequestUrlAndHeaders(
    config,
    `/v1/runs/${encodeURIComponent(runId)}/stop`,
    sessionKey
  );
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ run_id: runId }),
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
}

/** POST /v1/runs/{id}/approval */
export async function submitHermesRunApproval(
  config: HermesAgentConfig,
  runId: string,
  approved: boolean,
  reason?: string,
  sessionKey?: string
): Promise<unknown> {
  const { url, headers } = buildHermesRequestUrlAndHeaders(
    config,
    `/v1/runs/${encodeURIComponent(runId)}/approval`,
    sessionKey
  );
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      approved,
      decision: approved ? "approve" : "deny",
      ...(reason ? { reason, comment: reason } : {}),
    }),
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  try {
    return await response.json();
  } catch {
    return { ok: true };
  }
}

/** POST /v1/runs/{id}/clarify */
export async function submitHermesRunClarification(
  config: HermesAgentConfig,
  runId: string,
  answer: string,
  sessionKey?: string
): Promise<unknown> {
  const { url, headers } = buildHermesRequestUrlAndHeaders(
    config,
    `/v1/runs/${encodeURIComponent(runId)}/clarify`,
    sessionKey
  );
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      answer,
      response: answer,
      message: answer,
      content: answer,
    }),
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  try {
    return await response.json();
  } catch {
    return { ok: true };
  }
}

export interface StreamCallbacks {
  onRunId?: (runId: string) => void;
  onResponseId?: (responseId: string) => void;
  onContentDelta?: (delta: string) => void;
  onContentReplace?: (fullText: string) => void;
  onThinkingDelta?: (delta: string) => void;
  onToolStep?: (step: AgentToolStep) => void;
  onInteractionRequired?: (interaction: PendingRunInteraction) => void;
}

function extractTextFromUnknownResponse(data: Record<string, unknown>): string {
  // 1. OpenAI /v1/chat/completions format
  if (Array.isArray(data.choices) && data.choices.length > 0) {
    const first = data.choices[0] as Record<string, unknown>;
    const msg = first.message as Record<string, unknown> | undefined;
    if (msg && typeof msg.content === "string") {
      return msg.content;
    }
    if (typeof first.text === "string") {
      return first.text;
    }
  }
  // 2. OpenAI /v1/responses format
  if (typeof data.output_text === "string" && data.output_text) {
    return data.output_text;
  }
  if (Array.isArray(data.output)) {
    const parts: string[] = [];
    for (const item of data.output) {
      if (!item || typeof item !== "object") continue;
      const obj = item as Record<string, unknown>;
      if (typeof obj.content === "string") {
        parts.push(obj.content);
      } else if (Array.isArray(obj.content)) {
        for (const sub of obj.content) {
          if (
            sub &&
            typeof sub === "object" &&
            typeof (sub as Record<string, unknown>).text === "string"
          ) {
            parts.push((sub as Record<string, unknown>).text as string);
          }
        }
      } else if (typeof obj.text === "string") {
        parts.push(obj.text);
      }
    }
    if (parts.length > 0) return parts.join("\n");
  }
  // 3. Hermes /v1/runs format
  if (typeof data.response === "string") return data.response;
  if (typeof data.result === "string") return data.result;
  if (typeof data.content === "string") return data.content;
  if (typeof data.output === "string") return data.output;
  if (
    data.message &&
    typeof data.message === "object" &&
    typeof (data.message as Record<string, unknown>).content === "string"
  ) {
    return (data.message as Record<string, unknown>).content as string;
  }
  return "";
}

function processSseEventPayload(
  eventName: string | null,
  rawJson: string,
  callbacks: StreamCallbacks
) {
  const trimmed = rawJson.trim();
  if (!trimmed || trimmed === "[DONE]") return;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    callbacks.onContentDelta?.(trimmed);
    return;
  }

  // Capture run_id / response_id if present
  const runId =
    (typeof parsed.run_id === "string" && parsed.run_id) ||
    (typeof parsed.runId === "string" && parsed.runId) ||
    (parsed.object === "run" && typeof parsed.id === "string" ? parsed.id : undefined);
  if (runId) {
    callbacks.onRunId?.(runId);
  }

  if (typeof parsed.id === "string" && parsed.id.startsWith("resp_")) {
    callbacks.onResponseId?.(parsed.id);
  }
  if (
    parsed.response &&
    typeof parsed.response === "object" &&
    typeof (parsed.response as Record<string, unknown>).id === "string"
  ) {
    callbacks.onResponseId?.(
      (parsed.response as Record<string, unknown>).id as string
    );
  }

  const evtType =
    (typeof parsed.type === "string" && parsed.type) ||
    (typeof parsed.event === "string" && parsed.event) ||
    eventName ||
    "";

  // Check for approval or clarification prompts in /v1/runs stream
  if (
    evtType.includes("approval") ||
    parsed.status === "waiting_approval" ||
    parsed.requires_approval === true
  ) {
    const activeRunId = runId || (typeof parsed.id === "string" ? parsed.id : "current");
    callbacks.onInteractionRequired?.({
      type: "approval",
      runId: activeRunId,
      prompt:
        (typeof parsed.prompt === "string" && parsed.prompt) ||
        (typeof parsed.message === "string" && parsed.message) ||
        "Hermes requests your approval before executing this tool action.",
      toolName:
        (typeof parsed.tool === "string" && parsed.tool) ||
        (typeof parsed.tool_name === "string" && parsed.tool_name) ||
        undefined,
      command:
        (typeof parsed.command === "string" && parsed.command) ||
        (typeof parsed.input === "string" && parsed.input) ||
        undefined,
    });
    return;
  }

  if (
    evtType.includes("clarif") ||
    parsed.status === "waiting_clarification" ||
    parsed.requires_clarification === true
  ) {
    const activeRunId = runId || (typeof parsed.id === "string" ? parsed.id : "current");
    callbacks.onInteractionRequired?.({
      type: "clarify",
      runId: activeRunId,
      prompt:
        (typeof parsed.question === "string" && parsed.question) ||
        (typeof parsed.prompt === "string" && parsed.prompt) ||
        (typeof parsed.message === "string" && parsed.message) ||
        "Hermes needs additional clarification to continue.",
    });
    return;
  }

  // Tool progress events
  if (
    evtType.includes("tool") ||
    typeof parsed.tool_name === "string" ||
    typeof parsed.tool === "string"
  ) {
    const toolName =
      (typeof parsed.tool_name === "string" && parsed.tool_name) ||
      (typeof parsed.tool === "string" && parsed.tool) ||
      (typeof parsed.name === "string" && parsed.name) ||
      "tool";
    const stepId =
      (typeof parsed.tool_call_id === "string" && parsed.tool_call_id) ||
      (typeof parsed.id === "string" && parsed.id) ||
      `tool-${toolName}`;
    const isDone =
      evtType.includes("end") ||
      evtType.includes("done") ||
      evtType.includes("result") ||
      parsed.status === "completed" ||
      parsed.status === "done";
    const isErr = evtType.includes("error") || parsed.status === "error";

    callbacks.onToolStep?.({
      id: stepId,
      name: toolName,
      status: isErr ? "error" : isDone ? "done" : "running",
      input:
        typeof parsed.arguments === "string"
          ? parsed.arguments
          : typeof parsed.input === "string"
            ? parsed.input
            : undefined,
      output:
        typeof parsed.output === "string"
          ? parsed.output
          : typeof parsed.result === "string"
            ? parsed.result
            : undefined,
    });
  }

  // OpenAI /v1/chat/completions streaming delta
  if (Array.isArray(parsed.choices) && parsed.choices.length > 0) {
    const choice = parsed.choices[0] as Record<string, unknown>;
    const delta = choice.delta as Record<string, unknown> | undefined;
    if (delta) {
      if (typeof delta.reasoning_content === "string" && delta.reasoning_content) {
        callbacks.onThinkingDelta?.(delta.reasoning_content);
      } else if (typeof delta.thinking === "string" && delta.thinking) {
        callbacks.onThinkingDelta?.(delta.thinking);
      }
      if (typeof delta.content === "string" && delta.content) {
        callbacks.onContentDelta?.(delta.content);
      }
      if (Array.isArray(delta.tool_calls)) {
        for (const tc of delta.tool_calls) {
          if (!tc || typeof tc !== "object") continue;
          const callObj = tc as Record<string, unknown>;
          const fn = callObj.function as Record<string, unknown> | undefined;
          const name =
            (fn && typeof fn.name === "string" && fn.name) || "tool_call";
          const args =
            fn && typeof fn.arguments === "string" ? fn.arguments : undefined;
          callbacks.onToolStep?.({
            id:
              (typeof callObj.id === "string" && callObj.id) ||
              `tc-${callObj.index ?? 0}`,
            name,
            status: "running",
            input: args,
          });
        }
      }
      return;
    }
    const message = choice.message as Record<string, unknown> | undefined;
    if (message && typeof message.content === "string") {
      callbacks.onContentReplace?.(message.content);
      return;
    }
  }

  // OpenAI /v1/responses streaming delta
  if (evtType === "response.output_text.delta" && typeof parsed.delta === "string") {
    callbacks.onContentDelta?.(parsed.delta);
    return;
  }
  if (evtType === "response.output_text.done" && typeof parsed.text === "string") {
    callbacks.onContentReplace?.(parsed.text);
    return;
  }

  // Hermes /v1/runs streaming delta
  if (typeof parsed.delta === "string") {
    callbacks.onContentDelta?.(parsed.delta);
    return;
  }
  if (typeof parsed.text === "string" && !parsed.choices) {
    callbacks.onContentDelta?.(parsed.text);
    return;
  }
  if (typeof parsed.content === "string") {
    callbacks.onContentDelta?.(parsed.content);
    return;
  }
  const extracted = extractTextFromUnknownResponse(parsed);
  if (extracted) {
    callbacks.onContentReplace?.(extracted);
  }
}

/** Sends a multi-turn or streaming request to Hermes using the configured endpoint (/v1/chat/completions, /v1/runs, or /v1/responses). */
export async function sendHermesTurn(params: {
  config: HermesAgentConfig;
  sessionKey: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  previousResponseId?: string;
  signal?: AbortSignal;
  callbacks: StreamCallbacks;
}): Promise<void> {
  const { config, sessionKey, messages, previousResponseId, signal, callbacks } =
    params;

  let endpointPath = "/v1/chat/completions";
  let bodyPayload: Record<string, unknown>;

  const latestUserMsg =
    [...messages].reverse().find((m) => m.role === "user")?.content ?? "";

  if (config.endpointMode === "runs") {
    endpointPath = "/v1/runs";
    bodyPayload = {
      model: config.model || "hermes-agent",
      input: latestUserMsg,
      prompt: latestUserMsg,
      messages,
      session_key: sessionKey,
      stream: config.stream,
    };
  } else if (config.endpointMode === "responses") {
    endpointPath = "/v1/responses";
    bodyPayload = {
      model: config.model || "hermes-agent",
      input: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: config.stream,
      ...(previousResponseId ? { previous_response_id: previousResponseId } : {}),
    };
  } else {
    endpointPath = "/v1/chat/completions";
    bodyPayload = {
      model: config.model || "hermes-agent",
      messages,
      stream: config.stream,
    };
  }

  const { url, headers } = buildHermesRequestUrlAndHeaders(
    config,
    endpointPath,
    sessionKey
  );
  if (config.stream) {
    headers["Accept"] = "text/event-stream, application/json";
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(bodyPayload),
    signal,
  });

  const headerRunId =
    response.headers.get("x-hermes-run-id") ||
    response.headers.get("x-run-id");
  if (headerRunId) {
    callbacks.onRunId?.(headerRunId);
  }

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const contentType = response.headers.get("content-type") || "";
  const isEventStream =
    contentType.includes("text/event-stream") ||
    (config.stream && !contentType.includes("application/json"));

  if (!isEventStream || !response.body) {
    const data = (await response.json()) as Record<string, unknown>;
    const runId =
      (typeof data.run_id === "string" && data.run_id) ||
      (typeof data.runId === "string" && data.runId) ||
      (config.endpointMode === "runs" && typeof data.id === "string"
        ? data.id
        : undefined);
    if (runId) {
      callbacks.onRunId?.(runId);
    }
    if (typeof data.id === "string" && config.endpointMode === "responses") {
      callbacks.onResponseId?.(data.id);
    }

    if (
      data.status === "waiting_approval" ||
      data.requires_approval === true
    ) {
      callbacks.onInteractionRequired?.({
        type: "approval",
        runId: runId || "current",
        prompt:
          (typeof data.prompt === "string" && data.prompt) ||
          "Hermes requests your approval before proceeding.",
      });
    } else if (
      data.status === "waiting_clarification" ||
      data.requires_clarification === true
    ) {
      callbacks.onInteractionRequired?.({
        type: "clarify",
        runId: runId || "current",
        prompt:
          (typeof data.question === "string" && data.question) ||
          (typeof data.prompt === "string" && data.prompt) ||
          "Hermes needs clarification.",
      });
    }

    const text = extractTextFromUnknownResponse(data);
    if (text) {
      callbacks.onContentReplace?.(text);
    } else if (
      config.endpointMode === "runs" &&
      runId &&
      (data.status === "queued" || data.status === "running" || response.status === 202)
    ) {
      // Async 202 Accepted run: poll or stream /v1/runs/{id}
      await pollOrStreamHermesRun(config, runId, sessionKey, signal, callbacks);
    }
    return;
  }

  // Parse SSE stream
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent: string | null = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) {
        currentEvent = null;
        continue;
      }
      if (trimmedLine.startsWith("event:")) {
        currentEvent = trimmedLine.slice("event:".length).trim();
        continue;
      }
      if (trimmedLine.startsWith("data:")) {
        const dataPayload = trimmedLine.slice("data:".length).trim();
        processSseEventPayload(currentEvent, dataPayload, callbacks);
      }
    }
  }

  if (buffer.trim().startsWith("data:")) {
    processSseEventPayload(
      currentEvent,
      buffer.trim().slice("data:".length).trim(),
      callbacks
    );
  }
}

async function pollOrStreamHermesRun(
  config: HermesAgentConfig,
  runId: string,
  sessionKey: string,
  signal: AbortSignal | undefined,
  callbacks: StreamCallbacks
): Promise<void> {
  const { url, headers } = buildHermesRequestUrlAndHeaders(
    config,
    `/v1/runs/${encodeURIComponent(runId)}`,
    sessionKey
  );

  for (let attempt = 0; attempt < 60; attempt++) {
    if (signal?.aborted) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (signal?.aborted) return;

    const res = await fetch(url, {
      method: "GET",
      headers,
      signal,
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(await readErrorMessage(res));
    }
    const data = (await res.json()) as Record<string, unknown>;
    const text = extractTextFromUnknownResponse(data);
    if (text) {
      callbacks.onContentReplace?.(text);
    }

    if (data.status === "waiting_approval" || data.requires_approval === true) {
      callbacks.onInteractionRequired?.({
        type: "approval",
        runId,
        prompt:
          (typeof data.prompt === "string" && data.prompt) ||
          "Hermes is waiting for tool approval.",
      });
      return;
    }
    if (
      data.status === "waiting_clarification" ||
      data.requires_clarification === true
    ) {
      callbacks.onInteractionRequired?.({
        type: "clarify",
        runId,
        prompt:
          (typeof data.question === "string" && data.question) ||
          "Hermes is waiting for your clarification.",
      });
      return;
    }
    if (
      data.status === "completed" ||
      data.status === "done" ||
      data.status === "succeeded" ||
      data.status === "stopped" ||
      data.status === "cancelled" ||
      data.status === "failed" ||
      data.status === "error"
    ) {
      if (data.status === "failed" || data.status === "error") {
        throw new Error(
          (typeof data.error === "string" && data.error) ||
            "Hermes run failed."
        );
      }
      return;
    }
  }
}
