"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useDocs } from "./docs-store";
import { createId, getWorkspaceInsights } from "./docs-utils";
import { useFinance } from "./finance-store";
import { accountDisplayName } from "./finance-utils";
import {
  type AgentChatMessage,
  type AgentChatSession,
  type AgentToolStep,
  DEFAULT_HERMES_CONFIG,
  type HermesAgentConfig,
  normalizeAgentSessions,
  normalizeHermesConfig,
  sendHermesTurn,
  stopHermesRun,
  submitHermesRunApproval,
  submitHermesRunClarification,
} from "./hermes-client";
import { useTodayIsoDate } from "./use-client-date";

export const HERMES_CONFIG_STORAGE_KEY = "maa-hermes-config-v1";
export const HERMES_SESSIONS_STORAGE_KEY = "maa-hermes-sessions-v1";

export type SettingsSectionId = "agent" | "data" | "trash";
export type AgentWidgetMode = "closed" | "floating" | "sidebar";

function buildInitialSession(
  title = "New Agent Session",
  customKey?: string
): AgentChatSession {
  const id = createId();
  const now = new Date().toISOString();
  return {
    id,
    sessionKey: customKey || `maa-session-${id}`,
    title,
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
}

const FALLBACK_SESSION: AgentChatSession = {
  id: "default-session",
  sessionKey: "maa-session-default",
  title: "General Assistant",
  createdAt: "2026-11-22T00:00:00.000Z",
  updatedAt: "2026-11-22T00:00:00.000Z",
  messages: [],
};

interface AgentContextValue {
  hydrated: boolean;
  config: HermesAgentConfig;
  updateConfig: (patch: Partial<HermesAgentConfig>) => void;
  resetConfig: () => void;
  sessions: AgentChatSession[];
  activeSession: AgentChatSession;
  activeSessionId: string;
  setActiveSessionId: (id: string) => void;
  createSession: (title?: string, customSessionKey?: string) => AgentChatSession;
  deleteSession: (id: string) => void;
  renameSession: (id: string, title: string) => void;
  clearSessionMessages: (id: string) => void;
  updateSession: (
    id: string,
    updater: (session: AgentChatSession) => AgentChatSession
  ) => void;
  importAgent: (
    data: { config: HermesAgentConfig; sessions: AgentChatSession[] },
    mode: "merge" | "replace"
  ) => { sessionsCount: number; configUpdated: boolean };
  isStreaming: boolean;
  activeRunId: string;
  setActiveRunId: (id: string) => void;
  runControlFeedback: string | null;
  setRunControlFeedback: (msg: string | null) => void;
  connectionState: {
    status: "idle" | "checking" | "connected" | "offline";
    detail?: string;
  };
  setConnectionState: (state: {
    status: "idle" | "checking" | "connected" | "offline";
    detail?: string;
  }) => void;
  sendMessage: (promptText: string) => Promise<void>;
  stopRun: (targetRunId?: string) => Promise<void>;
  approveRun: (
    runId: string,
    approved: boolean,
    msgId?: string
  ) => Promise<void>;
  clarifyRun: (runId: string, answer: string, msgId?: string) => Promise<void>;
  widgetMode: AgentWidgetMode;
  setWidgetMode: (mode: AgentWidgetMode) => void;
  settingsOpen: boolean;
  settingsSection: SettingsSectionId;
  openSettings: (section?: SettingsSectionId) => void;
  closeSettings: () => void;
  setSettingsSection: (section: SettingsSectionId) => void;
}

const AgentContext = createContext<AgentContextValue | null>(null);

export function AgentProvider({ children }: { children: React.ReactNode }) {
  const { docs, databases } = useDocs();
  const { accounts, transactions } = useFinance();
  const todayIso = useTodayIsoDate() ?? "";

  const [hydrated, setHydrated] = useState(false);
  const [config, setConfig] = useState<HermesAgentConfig>(
    DEFAULT_HERMES_CONFIG
  );
  const [sessions, setSessions] = useState<AgentChatSession[]>([
    FALLBACK_SESSION,
  ]);
  const [activeSessionId, setActiveSessionId] = useState<string>(
    FALLBACK_SESSION.id
  );
  const [widgetMode, setWidgetMode] = useState<AgentWidgetMode>("closed");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] =
    useState<SettingsSectionId>("agent");

  const [isStreaming, setIsStreaming] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string>("");
  const [runControlFeedback, setRunControlFeedback] = useState<string | null>(
    null
  );
  const [connectionState, setConnectionState] = useState<{
    status: "idle" | "checking" | "connected" | "offline";
    detail?: string;
  }>({ status: "idle" });

  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    try {
      const rawConfig = localStorage.getItem(HERMES_CONFIG_STORAGE_KEY);
      if (rawConfig) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setConfig(normalizeHermesConfig(JSON.parse(rawConfig)));
      }
      const rawSessions = localStorage.getItem(HERMES_SESSIONS_STORAGE_KEY);
      if (rawSessions) {
        const parsed = normalizeAgentSessions(JSON.parse(rawSessions));
        if (parsed.length > 0) {
          setSessions(parsed);
          setActiveSessionId(parsed[0].id);
        }
      }
    } catch {
      // Ignore storage access errors
    } finally {
      setHydrated(true);
    }
  }, []);

  const persistConfig = useCallback((next: HermesAgentConfig) => {
    try {
      localStorage.setItem(HERMES_CONFIG_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage quota errors
    }
  }, []);

  const persistSessions = useCallback((next: AgentChatSession[]) => {
    try {
      localStorage.setItem(HERMES_SESSIONS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage quota errors
    }
  }, []);

  const updateConfig = useCallback(
    (patch: Partial<HermesAgentConfig>) => {
      setConfig((prev) => {
        const next = normalizeHermesConfig({ ...prev, ...patch });
        persistConfig(next);
        return next;
      });
    },
    [persistConfig]
  );

  const resetConfig = useCallback(() => {
    setConfig(DEFAULT_HERMES_CONFIG);
    persistConfig(DEFAULT_HERMES_CONFIG);
  }, [persistConfig]);

  const createSession = useCallback(
    (title?: string, customSessionKey?: string): AgentChatSession => {
      const created = buildInitialSession(
        title?.trim() || "New Agent Session",
        customSessionKey
      );
      setSessions((prev) => {
        const next = [created, ...prev];
        persistSessions(next);
        return next;
      });
      setActiveSessionId(created.id);
      return created;
    },
    [persistSessions]
  );

  const deleteSession = useCallback(
    (id: string) => {
      setSessions((prev) => {
        const remaining = prev.filter((s) => s.id !== id);
        const next =
          remaining.length > 0
            ? remaining
            : [buildInitialSession("General Assistant")];
        persistSessions(next);
        setActiveSessionId((currId) => (currId === id ? next[0].id : currId));
        return next;
      });
    },
    [persistSessions]
  );

  const renameSession = useCallback(
    (id: string, title: string) => {
      const clean = title.trim() || "Untitled Session";
      setSessions((prev) => {
        const next = prev.map((s) =>
          s.id === id
            ? { ...s, title: clean, updatedAt: new Date().toISOString() }
            : s
        );
        persistSessions(next);
        return next;
      });
    },
    [persistSessions]
  );

  const clearSessionMessages = useCallback(
    (id: string) => {
      setSessions((prev) => {
        const next = prev.map((s) =>
          s.id === id
            ? {
                ...s,
                messages: [],
                activeRunId: undefined,
                lastResponseId: undefined,
                updatedAt: new Date().toISOString(),
              }
            : s
        );
        persistSessions(next);
        return next;
      });
    },
    [persistSessions]
  );

  const updateSession = useCallback(
    (
      id: string,
      updater: (session: AgentChatSession) => AgentChatSession
    ) => {
      setSessions((prev) => {
        const next = prev.map((s) => (s.id === id ? updater(s) : s));
        persistSessions(next);
        return next;
      });
    },
    [persistSessions]
  );

  const importAgent = useCallback(
    (
      data: { config: HermesAgentConfig; sessions: AgentChatSession[] },
      mode: "merge" | "replace"
    ): { sessionsCount: number; configUpdated: boolean } => {
      const normalizedSessions = normalizeAgentSessions(data.sessions);

      if (mode === "replace") {
        const nextConfig = normalizeHermesConfig(data.config);
        persistConfig(nextConfig);
        setConfig(nextConfig);

        const nextSessions =
          normalizedSessions.length > 0
            ? normalizedSessions
            : [buildInitialSession("General Assistant")];
        persistSessions(nextSessions);
        setSessions(nextSessions);
        setActiveSessionId(nextSessions[0].id);

        return {
          sessionsCount: normalizedSessions.length,
          configUpdated: true,
        };
      }

      const meaningful = normalizedSessions.filter(
        (s) => !(s.id === "default-session" && s.messages.length === 0)
      );
      const remapped: AgentChatSession[] = meaningful.map((s) => {
        const freshId = createId();
        return {
          ...s,
          id: freshId,
          sessionKey: `maa-session-${freshId}`,
          activeRunId: undefined,
          messages: s.messages.map((m) => ({
            ...m,
            id: createId(),
          })),
        };
      });

      const base =
        remapped.length > 0
          ? sessions.filter(
              (s) => !(s.id === "default-session" && s.messages.length === 0)
            )
          : sessions;
      const nextSessions =
        base.length > 0 || remapped.length > 0
          ? [...base, ...remapped]
          : [buildInitialSession("General Assistant")];

      persistSessions(nextSessions);
      setSessions(nextSessions);
      if (!nextSessions.some((s) => s.id === activeSessionId)) {
        setActiveSessionId(nextSessions[0].id);
      }

      return {
        sessionsCount: remapped.length,
        configUpdated: false,
      };
    },
    [activeSessionId, persistConfig, persistSessions, sessions]
  );

  const activeSession = useMemo(
    () =>
      sessions.find((s) => s.id === activeSessionId) ??
      sessions[0] ??
      FALLBACK_SESSION,
    [activeSessionId, sessions]
  );

  const workspaceSummaryContext = useMemo(() => {
    const insights = getWorkspaceInsights(docs, todayIso);
    const docTitles = docs
      .slice(0, 12)
      .map((d) => `"${d.title.trim() || "Untitled"}"`)
      .join(", ");
    const openTodosText = insights.openTodos
      .slice(0, 10)
      .map((t) => `- [ ] ${t.text} (in ${t.docTitle})`)
      .join("\n");
    const accountNames = accounts
      .slice(0, 10)
      .map((a) => accountDisplayName(a))
      .join(", ");

    return [
      "MAA Workspace Context Snapshot:",
      `- Documents: ${docs.length} total (${databases.length} inline databases). Recent titles: ${docTitles || "none"}.`,
      `- Tasks: ${insights.todoCompleted}/${insights.todoTotal} completed.`,
      openTodosText ? `Open To-dos:\n${openTodosText}` : "",
      `- Finance: ${accounts.length} accounts (${accountNames || "none"}), ${transactions.length} recorded transactions.`,
    ]
      .filter(Boolean)
      .join("\n");
  }, [accounts, databases.length, docs, todayIso, transactions.length]);

  const appendOrUpdateAssistantMessage = useCallback(
    (
      sessionId: string,
      assistantMsgId: string,
      updater: (msg: AgentChatMessage) => AgentChatMessage
    ) => {
      updateSession(sessionId, (session) => ({
        ...session,
        updatedAt: new Date().toISOString(),
        messages: session.messages.map((m) =>
          m.id === assistantMsgId ? updater(m) : m
        ),
      }));
    },
    [updateSession]
  );

  const sendMessage = useCallback(
    async (promptText: string) => {
      const trimmed = promptText.trim();
      if (!trimmed || isStreaming) return;

      const sessionId = activeSession.id;
      const sessionKey = activeSession.sessionKey;
      const now = new Date().toISOString();

      const userMsg: AgentChatMessage = {
        id: createId(),
        role: "user",
        content: trimmed,
        createdAt: now,
        status: "done",
      };

      const assistantMsgId = createId();
      const assistantMsg: AgentChatMessage = {
        id: assistantMsgId,
        role: "assistant",
        content: "",
        createdAt: now,
        endpointUsed: config.endpointMode,
        status: "streaming",
        toolSteps: [],
      };

      const isFirstMessage = activeSession.messages.length === 0;
      const nextTitle = isFirstMessage
        ? trimmed.slice(0, 44) + (trimmed.length > 44 ? "…" : "")
        : activeSession.title;

      updateSession(sessionId, (session) => ({
        ...session,
        title: nextTitle,
        updatedAt: now,
        messages: [...session.messages, userMsg, assistantMsg],
      }));

      setIsStreaming(true);
      setRunControlFeedback(null);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      const apiMessages: Array<{
        role: "system" | "user" | "assistant";
        content: string;
      }> = [];

      const systemParts: string[] = [];
      if (config.systemPrompt.trim()) {
        systemParts.push(config.systemPrompt.trim());
      }
      if (config.includeWorkspaceContext) {
        systemParts.push(workspaceSummaryContext);
      }
      if (systemParts.length > 0) {
        apiMessages.push({
          role: "system",
          content: systemParts.join("\n\n"),
        });
      }

      for (const m of activeSession.messages) {
        if (m.role === "user" || m.role === "assistant") {
          if (m.content.trim()) {
            apiMessages.push({ role: m.role, content: m.content });
          }
        }
      }
      apiMessages.push({ role: "user", content: trimmed });

      try {
        await sendHermesTurn({
          config,
          sessionKey,
          messages: apiMessages,
          previousResponseId: activeSession.lastResponseId,
          signal: controller.signal,
          callbacks: {
            onRunId: (runId) => {
              setActiveRunId(runId);
              updateSession(sessionId, (s) => ({
                ...s,
                activeRunId: runId,
                messages: s.messages.map((m) =>
                  m.id === assistantMsgId ? { ...m, runId } : m
                ),
              }));
            },
            onResponseId: (responseId) => {
              updateSession(sessionId, (s) => ({
                ...s,
                lastResponseId: responseId,
                messages: s.messages.map((m) =>
                  m.id === assistantMsgId ? { ...m, responseId } : m
                ),
              }));
            },
            onContentDelta: (delta) => {
              appendOrUpdateAssistantMessage(
                sessionId,
                assistantMsgId,
                (m) => ({
                  ...m,
                  content: m.content + delta,
                })
              );
            },
            onContentReplace: (fullText) => {
              appendOrUpdateAssistantMessage(
                sessionId,
                assistantMsgId,
                (m) => ({
                  ...m,
                  content: fullText,
                })
              );
            },
            onThinkingDelta: (delta) => {
              appendOrUpdateAssistantMessage(
                sessionId,
                assistantMsgId,
                (m) => ({
                  ...m,
                  thinking: (m.thinking || "") + delta,
                })
              );
            },
            onToolStep: (step: AgentToolStep) => {
              appendOrUpdateAssistantMessage(
                sessionId,
                assistantMsgId,
                (m) => {
                  const existing = m.toolSteps ?? [];
                  const idx = existing.findIndex((s) => s.id === step.id);
                  const nextSteps =
                    idx === -1
                      ? [...existing, step]
                      : existing.map((s, i) =>
                          i === idx
                            ? {
                                ...s,
                                ...step,
                                input:
                                  step.input && s.input
                                    ? s.input + step.input
                                    : step.input || s.input,
                              }
                            : s
                        );
                  return { ...m, toolSteps: nextSteps };
                }
              );
            },
            onInteractionRequired: (interaction) => {
              setActiveRunId(interaction.runId);
              appendOrUpdateAssistantMessage(
                sessionId,
                assistantMsgId,
                (m) => ({
                  ...m,
                  status: "waiting",
                  runId: interaction.runId,
                  pendingInteraction: interaction,
                })
              );
            },
          },
        });

        setConnectionState({
          status: "connected",
          detail: `Connected to ${config.baseUrl}`,
        });

        appendOrUpdateAssistantMessage(sessionId, assistantMsgId, (m) => ({
          ...m,
          status: m.pendingInteraction ? "waiting" : "done",
          content:
            m.content ||
            (m.pendingInteraction
              ? m.pendingInteraction.prompt
              : "(Completed with no text output)"),
          toolSteps: m.toolSteps?.map((s) =>
            s.status === "running" ? { ...s, status: "done" } : s
          ),
        }));
      } catch (error) {
        if (controller.signal.aborted) {
          appendOrUpdateAssistantMessage(sessionId, assistantMsgId, (m) => ({
            ...m,
            status: "stopped",
            content: m.content
              ? `${m.content}\n\n[Run stopped by user]`
              : "[Run stopped by user]",
          }));
        } else {
          const message =
            error instanceof Error
              ? error.message
              : "Request to Hermes failed.";
          setConnectionState({ status: "offline", detail: message });
          appendOrUpdateAssistantMessage(sessionId, assistantMsgId, (m) => ({
            ...m,
            status: "error",
            error: message,
          }));
        }
      } finally {
        setIsStreaming(false);
        abortControllerRef.current = null;
      }
    },
    [
      activeSession,
      appendOrUpdateAssistantMessage,
      config,
      isStreaming,
      updateSession,
      workspaceSummaryContext,
    ]
  );

  const stopRun = useCallback(
    async (targetRunId?: string) => {
      abortControllerRef.current?.abort();
      const runIdToStop =
        targetRunId?.trim() || activeRunId.trim() || activeSession.activeRunId;
      if (!runIdToStop) {
        setRunControlFeedback("Aborted active stream.");
        return;
      }
      try {
        await stopHermesRun(config, runIdToStop, activeSession.sessionKey);
        setRunControlFeedback(
          `Sent POST /v1/runs/${runIdToStop}/stop to Hermes.`
        );
      } catch (error) {
        const msg =
          error instanceof Error
            ? error.message
            : "Failed to stop remote run.";
        setRunControlFeedback(msg);
      }
    },
    [activeRunId, activeSession.activeRunId, activeSession.sessionKey, config]
  );

  const approveRun = useCallback(
    async (runId: string, approved: boolean, msgId?: string) => {
      try {
        await submitHermesRunApproval(
          config,
          runId,
          approved,
          undefined,
          activeSession.sessionKey
        );
        setRunControlFeedback(
          `Submitted ${approved ? "approval" : "denial"} via POST /v1/runs/${runId}/approval.`
        );
        if (msgId) {
          appendOrUpdateAssistantMessage(activeSession.id, msgId, (m) => ({
            ...m,
            status: "done",
            pendingInteraction: undefined,
            content: `${m.content}\n\n[${approved ? "Approved" : "Denied"} tool execution for run ${runId}]`,
          }));
        }
      } catch (error) {
        setRunControlFeedback(
          error instanceof Error
            ? error.message
            : "Failed to submit run approval."
        );
      }
    },
    [
      activeSession.id,
      activeSession.sessionKey,
      appendOrUpdateAssistantMessage,
      config,
    ]
  );

  const clarifyRun = useCallback(
    async (runId: string, answer: string, msgId?: string) => {
      const clean = answer.trim();
      if (!clean) return;
      try {
        await submitHermesRunClarification(
          config,
          runId,
          clean,
          activeSession.sessionKey
        );
        setRunControlFeedback(
          `Sent clarification via POST /v1/runs/${runId}/clarify.`
        );
        if (msgId) {
          appendOrUpdateAssistantMessage(activeSession.id, msgId, (m) => ({
            ...m,
            status: "done",
            pendingInteraction: undefined,
            content: `${m.content}\n\n[Clarification sent: "${clean}"]`,
          }));
        }
      } catch (error) {
        setRunControlFeedback(
          error instanceof Error
            ? error.message
            : "Failed to submit clarification."
        );
      }
    },
    [
      activeSession.id,
      activeSession.sessionKey,
      appendOrUpdateAssistantMessage,
      config,
    ]
  );

  const openSettings = useCallback((section: SettingsSectionId = "agent") => {
    setSettingsSection(section);
    setSettingsOpen(true);
  }, []);

  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
  }, []);

  const value = useMemo<AgentContextValue>(
    () => ({
      hydrated,
      config,
      updateConfig,
      resetConfig,
      sessions,
      activeSession,
      activeSessionId: activeSession.id,
      setActiveSessionId,
      createSession,
      deleteSession,
      renameSession,
      clearSessionMessages,
      updateSession,
      importAgent,
      isStreaming,
      activeRunId,
      setActiveRunId,
      runControlFeedback,
      setRunControlFeedback,
      connectionState,
      setConnectionState,
      sendMessage,
      stopRun,
      approveRun,
      clarifyRun,
      widgetMode,
      setWidgetMode,
      settingsOpen,
      settingsSection,
      openSettings,
      closeSettings,
      setSettingsSection,
    }),
    [
      hydrated,
      config,
      updateConfig,
      resetConfig,
      sessions,
      activeSession,
      createSession,
      deleteSession,
      renameSession,
      clearSessionMessages,
      updateSession,
      importAgent,
      isStreaming,
      activeRunId,
      runControlFeedback,
      connectionState,
      sendMessage,
      stopRun,
      approveRun,
      clarifyRun,
      widgetMode,
      settingsOpen,
      settingsSection,
      openSettings,
      closeSettings,
    ]
  );

  return (
    <AgentContext.Provider value={value}>{children}</AgentContext.Provider>
  );
}

export function useAgent(): AgentContextValue {
  const ctx = useContext(AgentContext);
  if (!ctx) {
    throw new Error("useAgent must be used within an AgentProvider");
  }
  return ctx;
}
