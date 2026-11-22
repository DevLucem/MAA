"use client";

import {
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useId,
  useRef,
  useState,
} from "react";
import { Icon } from "../assets/icons";
import { useAgent } from "../lib/agent-store";
import {
  createHermesJob,
  createHermesRemoteSession,
  fetchHermesJobs,
  fetchHermesSessions,
  type HermesEndpointMode,
  type HermesJob,
  type HermesRemoteSession,
} from "../lib/hermes-client";
import { useChatAutoScroll } from "../lib/use-chat-autoscroll";

const STARTER_PROMPTS = [
  {
    title: "Summarize workspace tasks",
    prompt:
      "Review my current MAA workspace documents and open to-dos, and suggest what I should prioritize today.",
  },
  {
    title: "Financial overview & insights",
    prompt:
      "Analyze my MAA finance accounts and recent activity, and help me outline a monthly review checklist.",
  },
  {
    title: "Draft a technical specification",
    prompt:
      "Help me draft a structured technical specification document with goals, architecture, and action items.",
  },
  {
    title: "Hermes agent capabilities",
    prompt:
      "What tools, skills, and terminal/workspace actions do you currently have enabled in this Hermes gateway session?",
  },
] as const;

const ENDPOINT_BADGES: Record<
  HermesEndpointMode,
  { label: string; path: string }
> = {
  chat: { label: "Chat Completions", path: "POST /v1/chat/completions" },
  runs: { label: "Agent Runs", path: "POST /v1/runs" },
  responses: { label: "Responses", path: "POST /v1/responses" },
};

/** Home page Agentic Chat UI powered by the Hermes Built-in API Server. */
export function AgentChatHome() {
  const baseId = useId();
  const promptInputId = `${baseId}-prompt`;
  const endpointSelectId = `${baseId}-endpoint-select`;
  const sessionSelectId = `${baseId}-session-select`;
  const jobNameInputId = `${baseId}-job-name`;
  const jobPromptInputId = `${baseId}-job-prompt`;
  const jobScheduleInputId = `${baseId}-job-schedule`;

  const {
    config,
    updateConfig,
    sessions,
    activeSession,
    setActiveSessionId,
    createSession,
    deleteSession,
    clearSessionMessages,
    isStreaming,
    setRunControlFeedback,
    connectionState,
    setConnectionState,
    sendMessage,
    stopRun,
    approveRun,
    clarifyRun,
    openSettings,
  } = useAgent();

  const [input, setInput] = useState("");
  const [clarifyText, setClarifyText] = useState("");

  // Side drawer state for /api/sessions & /api/jobs management
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<"sessions" | "jobs">(
    "sessions"
  );
  const [remoteSessions, setRemoteSessions] = useState<HermesRemoteSession[]>(
    []
  );
  const [remoteJobs, setRemoteJobs] = useState<HermesJob[]>([]);
  const [loadingRemote, setLoadingRemote] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [newJobName, setNewJobName] = useState("");
  const [newJobPrompt, setNewJobPrompt] = useState("");
  const [newJobSchedule, setNewJobSchedule] = useState("");

  const formRef = useRef<HTMLFormElement | null>(null);
  const { scrollContainerRef, handleScroll } = useChatAutoScroll({
    sessionId: activeSession.id,
    messages: activeSession.messages,
    isStreaming,
    openKey: "home",
  });

  const refreshRemoteData = useCallback(async () => {
    setLoadingRemote(true);
    setRemoteError(null);
    try {
      const [sessList, jobList] = await Promise.allSettled([
        fetchHermesSessions(config),
        fetchHermesJobs(config),
      ]);
      if (sessList.status === "fulfilled") {
        setRemoteSessions(sessList.value);
      }
      if (jobList.status === "fulfilled") {
        setRemoteJobs(jobList.value);
      }
      if (sessList.status === "rejected" && jobList.status === "rejected") {
        const err =
          sessList.reason instanceof Error
            ? sessList.reason.message
            : "Could not query /api/sessions or /api/jobs";
        setRemoteError(err);
      } else {
        setConnectionState({
          status: "connected",
          detail: `Connected to ${config.baseUrl}`,
        });
      }
    } finally {
      setLoadingRemote(false);
    }
  }, [config, setConnectionState]);

  const handleFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const promptText = input.trim();
    if (!promptText || isStreaming) return;
    setInput("");
    void sendMessage(promptText);
  };

  // IME-safe Enter-to-submit per `ime-safe-enter-submit` guidance
  const handleTextareaKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (event.nativeEvent.isComposing || event.keyCode === 229) {
        return;
      }
      formRef.current?.requestSubmit();
    }
  };

  const handleClarifySubmit = async (runId: string, msgId?: string) => {
    const answer = clarifyText.trim();
    if (!answer) return;
    setClarifyText("");
    await clarifyRun(runId, answer, msgId);
  };

  const handleSyncCurrentSessionToHermes = async () => {
    setRemoteError(null);
    try {
      const created = await createHermesRemoteSession(config, {
        sessionKey: activeSession.sessionKey,
        title: activeSession.title,
        model: config.model,
      });
      setRemoteSessions((prev) => [
        created,
        ...prev.filter((s) => s.id !== created.id),
      ]);
      setRunControlFeedback(
        `Registered session "${activeSession.sessionKey}" via POST /api/sessions.`
      );
    } catch (error) {
      setRemoteError(
        error instanceof Error
          ? error.message
          : "Failed to create remote session via POST /api/sessions."
      );
    }
  };

  const handleCreateRemoteJob = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newJobName.trim() || !newJobPrompt.trim()) return;
    setRemoteError(null);
    try {
      const job = await createHermesJob(config, {
        name: newJobName.trim(),
        prompt: newJobPrompt.trim(),
        schedule: newJobSchedule.trim() || undefined,
        sessionKey: activeSession.sessionKey,
      });
      setRemoteJobs((prev) => [job, ...prev]);
      setNewJobName("");
      setNewJobPrompt("");
      setNewJobSchedule("");
      setRunControlFeedback(`Created job "${job.name}" via POST /api/jobs.`);
    } catch (error) {
      setRemoteError(
        error instanceof Error
          ? error.message
          : "Failed to create job via POST /api/jobs."
      );
    }
  };

  const endpointMeta = ENDPOINT_BADGES[config.endpointMode];

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      {/* Agent Top Sub-header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface/60 px-4 py-2.5 sm:px-6">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <label htmlFor={sessionSelectId} className="sr-only">
              Active agent session
            </label>
            <select
              id={sessionSelectId}
              value={activeSession.id}
              onChange={(e) => setActiveSessionId(e.currentTarget.value)}
              className="h-8 max-w-52 rounded-md border border-border bg-canvas px-2.5 text-xs font-medium text-foreground focus-visible:outline-2 focus-visible:outline-primary"
            >
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title} ({s.messages.length})
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => createSession()}
              aria-label="New agent session"
              className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-canvas text-muted transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
            >
              <Icon name="plus" className="size-3.5" />
            </button>

            {activeSession.messages.length > 0 && (
              <button
                type="button"
                onClick={() => clearSessionMessages(activeSession.id)}
                aria-label="Clear current session messages"
                className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-canvas px-2 text-xs text-muted transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
              >
                <Icon name="trash" className="size-3.5" />
                <span className="hidden md:inline">Clear</span>
              </button>
            )}
          </div>
        </div>

        {/* Right Controls: Sessions/Jobs Drawer */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            aria-expanded={inspectorOpen}
            onClick={() => {
              const next = !inspectorOpen;
              setInspectorOpen(next);
              if (next) void refreshRemoteData();
            }}
            className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
              inspectorOpen
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border bg-canvas text-muted hover:bg-secondary hover:text-foreground"
            }`}
          >
            <Icon name="database" className="size-3.5" />
            <span>Sessions &amp; Jobs</span>
          </button>
        </div>
      </div>

      {/* Main Split Area: Chat Thread + Optional Sessions & Jobs Inspector */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Chat Column */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Scrollable Message History */}
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="scroll-region flex-1 px-4 py-6 sm:px-6"
          >
            <div className="mx-auto max-w-3xl space-y-6">
              {connectionState.status === "offline" &&
                connectionState.detail && (
                  <div
                    role="alert"
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger/40 bg-danger/10 p-4 text-xs text-foreground"
                  >
                    <div className="space-y-1">
                      <p className="font-semibold text-danger">
                        Hermes API Server Unreachable
                      </p>
                      <p className="text-muted">{connectionState.detail}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => openSettings("agent")}
                      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-xs font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      <Icon name="settings" className="size-3.5" />
                      <span>Configure Agent</span>
                    </button>
                  </div>
                )}

              {activeSession.messages.length === 0 ? (
                <div className="space-y-8 py-6">
                  {/* Welcome Hero */}
                  <div className="space-y-3 text-center">
                    <div className="mx-auto inline-flex size-12 items-center justify-center rounded-2xl border border-border bg-surface shadow-sm">
                      <Icon name="bot" className="size-6 text-primary" />
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">
                      Hermes Workspace Agent
                    </h1>
                    <p className="mx-auto max-w-lg text-sm text-muted">
                      Ask questions about your Docs and Finance data or launch
                      multi-step agent runs.
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-2 pt-1 text-xs text-muted">
                      <span className="rounded-full border border-border bg-surface px-2.5 py-1 font-mono text-[11px]">
                        {endpointMeta.path}
                      </span>
                      <span className="rounded-full border border-border bg-surface px-2.5 py-1 font-mono text-[11px]">
                        Model: {config.model}
                      </span>
                      <button
                        type="button"
                        onClick={() => openSettings("agent")}
                        className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary"
                      >
                        <Icon name="settings" className="size-3" />
                        <span>Configure in Settings → Agent</span>
                      </button>
                    </div>
                  </div>

                  {/* Starter Prompts Grid */}
                  <section aria-label="Suggested prompts">
                    <h2 className="sr-only">Suggested starter prompts</h2>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {STARTER_PROMPTS.map((item) => (
                        <button
                          key={item.title}
                          type="button"
                          onClick={() => void sendMessage(item.prompt)}
                          className="flex flex-col items-start gap-1 rounded-xl border border-border bg-surface p-4 text-start transition-colors hover:border-primary/40 hover:bg-secondary/60 focus-visible:outline-2 focus-visible:outline-primary"
                        >
                          <span className="text-sm font-semibold text-foreground">
                            {item.title}
                          </span>
                          <span className="line-clamp-2 text-xs text-muted">
                            {item.prompt}
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>
                </div>
              ) : (
                <div className="space-y-4">
                  {activeSession.messages.map((message, index) => {
                    const isLast =
                      index === activeSession.messages.length - 1;
                    const isUser = message.role === "user";

                    return (
                      <div
                        key={message.id}
                        className={`flex flex-col gap-2 ${
                          isLast ? "chat-initial-target" : ""
                        } ${isUser ? "items-end" : "items-start"}`}
                      >
                        <div
                          className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm sm:max-w-[82%] ${
                            isUser
                              ? "primary rounded-br-sm"
                              : "w-full rounded-bl-sm border border-border bg-surface text-foreground"
                          }`}
                        >
                          {/* Assistant Header Metadata */}
                          {!isUser && (
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-1.5 text-[11px] text-muted">
                              <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
                                <Icon
                                  name="bot"
                                  className="size-3.5 text-primary"
                                />
                                <span>Hermes</span>
                              </span>
                              <div className="flex items-center gap-2 font-mono text-[10px]">
                                {message.endpointUsed && (
                                  <span>
                                    {ENDPOINT_BADGES[message.endpointUsed].path}
                                  </span>
                                )}
                                {message.runId && (
                                  <span className="rounded bg-secondary px-1.5 py-0.5 text-secondary-foreground">
                                    run: {message.runId}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Thinking / Reasoning Collapsible */}
                          {message.thinking && (
                            <details className="mb-2.5 rounded-lg border border-border bg-canvas/60 px-3 py-2 text-xs">
                              <summary className="cursor-pointer font-medium text-muted select-none">
                                Agent reasoning
                              </summary>
                              <pre className="mt-1.5 whitespace-pre-wrap font-mono text-[11px] text-muted">
                                {message.thinking}
                              </pre>
                            </details>
                          )}

                          {/* Tool Execution Steps */}
                          {message.toolSteps && message.toolSteps.length > 0 && (
                            <div className="mb-3 space-y-1.5">
                              {message.toolSteps.map((step) => (
                                <div
                                  key={step.id}
                                  className="rounded-lg border border-border bg-canvas/70 px-3 py-2 text-xs"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-mono font-medium text-foreground">
                                      Tool: {step.name}
                                    </span>
                                    <span
                                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                        step.status === "done"
                                          ? "bg-success/15 text-success"
                                          : step.status === "error"
                                            ? "bg-danger/15 text-danger"
                                            : "bg-primary/15 text-primary"
                                      }`}
                                    >
                                      {step.status}
                                    </span>
                                  </div>
                                  {step.input && (
                                    <pre className="mt-1 overflow-x-auto font-mono text-[11px] text-muted">
                                      {step.input}
                                    </pre>
                                  )}
                                  {step.output && (
                                    <pre className="mt-1 overflow-x-auto border-t border-border pt-1 font-mono text-[11px] text-foreground">
                                      {step.output}
                                    </pre>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Message Content */}
                          {message.content ? (
                            <div className="whitespace-pre-wrap leading-relaxed">
                              {message.content}
                            </div>
                          ) : message.status === "streaming" ? (
                            <div className="flex items-center gap-2 text-xs text-muted">
                              <Icon
                                name="sync"
                                className="size-3.5 animate-spin text-primary"
                              />
                              <span>Hermes is thinking…</span>
                            </div>
                          ) : null}

                          {/* Error Banner inside Message */}
                          {message.status === "error" && message.error && (
                            <div
                              role="alert"
                              className="mt-2 rounded-lg border border-danger/40 bg-danger/10 p-3 text-xs text-danger"
                            >
                              <p className="font-semibold">Request failed</p>
                              <p className="mt-0.5">{message.error}</p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => openSettings("agent")}
                                  className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-surface px-2.5 text-xs font-medium text-foreground hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary"
                                >
                                  <Icon name="settings" className="size-3.5" />
                                  <span>Open Agent Settings</span>
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Interactive Approval / Clarification Card for /v1/runs */}
                          {message.pendingInteraction && (
                            <div className="mt-3 space-y-2.5 rounded-xl border border-primary/40 bg-primary/10 p-3.5 text-xs">
                              <p className="font-semibold text-foreground">
                                {message.pendingInteraction.type === "approval"
                                  ? "Tool Execution Approval Required"
                                  : "Agent Clarification Requested"}
                              </p>
                              <p className="text-muted">
                                {message.pendingInteraction.prompt}
                              </p>
                              {message.pendingInteraction.command && (
                                <pre className="overflow-x-auto rounded bg-surface p-2 font-mono text-[11px] text-foreground">
                                  {message.pendingInteraction.command}
                                </pre>
                              )}

                              {message.pendingInteraction.type ===
                              "approval" ? (
                                <div className="flex flex-wrap items-center gap-2 pt-1">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void approveRun(
                                        message.pendingInteraction!.runId,
                                        true,
                                        message.id
                                      )
                                    }
                                    className="primary inline-flex h-8 items-center rounded-md px-3 text-xs font-medium hover:opacity-90 focus-visible:outline-2 focus-visible:outline-primary"
                                  >
                                    Approve Action
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void approveRun(
                                        message.pendingInteraction!.runId,
                                        false,
                                        message.id
                                      )
                                    }
                                    className="inline-flex h-8 items-center rounded-md border border-danger/40 bg-danger/10 px-3 text-xs font-medium text-danger hover:bg-danger/20 focus-visible:outline-2 focus-visible:outline-danger"
                                  >
                                    Deny
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 pt-1">
                                  <input
                                    type="text"
                                    value={clarifyText}
                                    onChange={(e) =>
                                      setClarifyText(e.currentTarget.value)
                                    }
                                    placeholder="Type your answer…"
                                    aria-label="Clarification response"
                                    className="h-8 flex-1 rounded-md border border-border bg-surface px-2.5 text-xs text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                                  />
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void handleClarifySubmit(
                                        message.pendingInteraction!.runId,
                                        message.id
                                      )
                                    }
                                    className="primary inline-flex h-8 items-center rounded-md px-3 text-xs font-medium hover:opacity-90 focus-visible:outline-2 focus-visible:outline-primary"
                                  >
                                    Submit Answer
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Chat Composer Footer */}
          <div className="shrink-0 border-t border-border bg-surface/80 px-4 py-3 sm:px-6">
            <form
              ref={formRef}
              onSubmit={handleFormSubmit}
              className="mx-auto max-w-3xl space-y-2"
            >
              <label htmlFor={promptInputId} className="sr-only">
                Message Hermes Agent
              </label>
              <div className="rounded-xl border border-border bg-canvas p-2.5 shadow-sm focus-within:border-primary">
                <textarea
                  id={promptInputId}
                  name="prompt"
                  value={input}
                  onChange={(e) => setInput(e.currentTarget.value)}
                  onKeyDown={handleTextareaKeyDown}
                  placeholder="Ask Hermes anything, run a task, or analyze your workspace… (Enter to send, Shift+Enter for newline)"
                  className="chat-composer-textarea resize-none border-0 bg-transparent text-sm text-foreground placeholder:text-muted focus:outline-none"
                />

                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2">
                  {/* Left Composer Controls: Endpoint selector + Workspace Context pill */}
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1">
                      <label htmlFor={endpointSelectId} className="sr-only">
                        Hermes API Endpoint
                      </label>
                      <select
                        id={endpointSelectId}
                        value={config.endpointMode}
                        onChange={(e) =>
                          updateConfig({
                            endpointMode: e.currentTarget
                              .value as HermesEndpointMode,
                          })
                        }
                        className="h-7 rounded-md border border-border bg-surface px-2 font-mono text-[11px] text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                      >
                        <option value="chat">POST /v1/chat/completions</option>
                        <option value="runs">POST /v1/runs</option>
                        <option value="responses">POST /v1/responses</option>
                      </select>
                    </div>

                    <button
                      type="button"
                      aria-pressed={config.includeWorkspaceContext}
                      onClick={() =>
                        updateConfig({
                          includeWorkspaceContext:
                            !config.includeWorkspaceContext,
                        })
                      }
                      className={`inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
                        config.includeWorkspaceContext
                          ? "border-primary/40 bg-primary/10 text-foreground"
                          : "border-border bg-surface text-muted hover:text-foreground"
                      }`}
                    >
                      <span>
                        Workspace context:{" "}
                        {config.includeWorkspaceContext ? "On" : "Off"}
                      </span>
                    </button>
                  </div>

                  {/* Right Composer Controls: Stop or Send */}
                  <div className="flex items-center gap-2">
                    {isStreaming ? (
                      <button
                        type="button"
                        onClick={() => void stopRun()}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-danger/40 bg-danger/10 px-3 text-xs font-medium text-danger transition-colors hover:bg-danger/20 focus-visible:outline-2 focus-visible:outline-danger"
                      >
                        <Icon name="stop" className="size-3.5" />
                        <span>Stop run</span>
                      </button>
                    ) : (
                      <button
                        type="submit"
                        disabled={!input.trim()}
                        className="primary inline-flex h-8 items-center gap-1.5 rounded-lg px-3.5 text-xs font-medium transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-40"
                      >
                        <Icon name="send" className="size-3.5" />
                        <span>Send</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>

        {/* Right Side Inspector: GET/POST /api/sessions & GET/POST /api/jobs */}
        {inspectorOpen && (
          <aside
            aria-label="Hermes Sessions and Jobs"
            className="flex w-80 shrink-0 flex-col border-s border-border bg-surface sm:w-96"
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div
                role="tablist"
                aria-label="Hermes management tabs"
                className="flex items-center gap-1"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={inspectorTab === "sessions"}
                  onClick={() => setInspectorTab("sessions")}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
                    inspectorTab === "sessions"
                      ? "bg-secondary text-foreground"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  /api/sessions
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={inspectorTab === "jobs"}
                  onClick={() => setInspectorTab("jobs")}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
                    inspectorTab === "jobs"
                      ? "bg-secondary text-foreground"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  /api/jobs
                </button>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="Refresh Hermes sessions and jobs"
                  onClick={() => void refreshRemoteData()}
                  className="inline-flex size-7 items-center justify-center rounded-md text-muted hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <Icon
                    name="sync"
                    className={`size-3.5 ${loadingRemote ? "animate-spin" : ""}`}
                  />
                </button>
                <button
                  type="button"
                  aria-label="Close Sessions and Jobs panel"
                  onClick={() => setInspectorOpen(false)}
                  className="inline-flex size-7 items-center justify-center rounded-md text-muted hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <Icon name="x" className="size-3.5" />
                </button>
              </div>
            </div>

            <div className="scroll-region flex-1 space-y-4 p-4">
              {remoteError && (
                <div
                  role="alert"
                  className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-xs text-danger"
                >
                  {remoteError}
                </div>
              )}

              {inspectorTab === "sessions" ? (
                <div className="space-y-4">
                  <div className="rounded-lg border border-border bg-canvas/60 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <h3 className="text-xs font-semibold text-foreground">
                          Active Session Key
                        </h3>
                        <p className="font-mono text-[11px] text-muted">
                          {activeSession.sessionKey}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleSyncCurrentSessionToHermes()}
                        className="primary inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-[11px] font-medium hover:opacity-90 focus-visible:outline-2 focus-visible:outline-primary"
                      >
                        <Icon name="upload" className="size-3" />
                        <span>POST /api/sessions</span>
                      </button>
                    </div>
                  </div>

                  {/* Local Sessions List */}
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold text-foreground">
                      Workspace Sessions ({sessions.length})
                    </h3>
                    <ul className="space-y-1.5">
                      {sessions.map((s) => (
                        <li
                          key={s.id}
                          className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs ${
                            s.id === activeSession.id
                              ? "border-primary bg-primary/5"
                              : "border-border bg-canvas/40"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => setActiveSessionId(s.id)}
                            className="min-w-0 flex-1 text-start focus-visible:outline-2 focus-visible:outline-primary"
                          >
                            <p className="truncate font-medium text-foreground">
                              {s.title}
                            </p>
                            <p className="truncate font-mono text-[10px] text-muted">
                              {s.sessionKey} · {s.messages.length} msgs
                            </p>
                          </button>
                          {sessions.length > 1 && (
                            <button
                              type="button"
                              aria-label={`Delete session ${s.title}`}
                              onClick={() => deleteSession(s.id)}
                              className="inline-flex size-6 items-center justify-center rounded text-muted hover:bg-secondary hover:text-danger focus-visible:outline-2 focus-visible:outline-primary"
                            >
                              <Icon name="trash" className="size-3.5" />
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Remote Hermes Sessions (/api/sessions) */}
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold text-foreground">
                      Remote Hermes Sessions ({remoteSessions.length})
                    </h3>
                    {remoteSessions.length === 0 ? (
                      <p className="rounded-lg border border-border bg-canvas/40 p-3 text-xs text-muted">
                        No remote sessions returned from{" "}
                        <code>GET /api/sessions</code>.
                      </p>
                    ) : (
                      <ul className="space-y-1.5">
                        {remoteSessions.map((rs) => (
                          <li
                            key={rs.id}
                            className="flex items-center justify-between gap-2 rounded-lg border border-border bg-canvas/50 px-3 py-2 text-xs"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium text-foreground">
                                {rs.title || rs.id}
                              </p>
                              <p className="truncate font-mono text-[10px] text-muted">
                                {rs.key || rs.id}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                createSession(
                                  rs.title || `Hermes ${rs.id}`,
                                  rs.key || rs.id
                                )
                              }
                              className="inline-flex h-7 shrink-0 items-center rounded-md border border-border bg-surface px-2 text-[11px] font-medium text-foreground hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary"
                            >
                              Use Key
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Create Job Form (POST /api/jobs) */}
                  <form
                    onSubmit={(e) => void handleCreateRemoteJob(e)}
                    className="space-y-2.5 rounded-lg border border-border bg-canvas/60 p-3"
                  >
                    <h3 className="text-xs font-semibold text-foreground">
                      Schedule / Queue Job (<code>POST /api/jobs</code>)
                    </h3>

                    <div className="space-y-1">
                      <label
                        htmlFor={jobNameInputId}
                        className="block text-[11px] font-medium text-foreground"
                      >
                        Job Name
                      </label>
                      <input
                        id={jobNameInputId}
                        type="text"
                        required
                        value={newJobName}
                        onChange={(e) => setNewJobName(e.currentTarget.value)}
                        placeholder="Daily Workspace Summary"
                        className="h-8 w-full rounded-md border border-border bg-surface px-2.5 text-xs text-foreground placeholder:text-muted focus-visible:outline-2 focus-visible:outline-primary"
                      />
                    </div>

                    <div className="space-y-1">
                      <label
                        htmlFor={jobPromptInputId}
                        className="block text-[11px] font-medium text-foreground"
                      >
                        Agent Prompt / Task
                      </label>
                      <input
                        id={jobPromptInputId}
                        type="text"
                        required
                        value={newJobPrompt}
                        onChange={(e) => setNewJobPrompt(e.currentTarget.value)}
                        placeholder="Summarize open tasks and check git status"
                        className="h-8 w-full rounded-md border border-border bg-surface px-2.5 text-xs text-foreground placeholder:text-muted focus-visible:outline-2 focus-visible:outline-primary"
                      />
                    </div>

                    <div className="space-y-1">
                      <label
                        htmlFor={jobScheduleInputId}
                        className="block text-[11px] font-medium text-foreground"
                      >
                        Cron / Schedule (optional)
                      </label>
                      <input
                        id={jobScheduleInputId}
                        type="text"
                        value={newJobSchedule}
                        onChange={(e) =>
                          setNewJobSchedule(e.currentTarget.value)
                        }
                        autoCorrect="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        placeholder="0 9 * * *"
                        className="h-8 w-full rounded-md border border-border bg-surface px-2.5 font-mono text-xs text-foreground placeholder:text-muted focus-visible:outline-2 focus-visible:outline-primary"
                      />
                    </div>

                    <button
                      type="submit"
                      className="primary inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md px-3 text-xs font-medium hover:opacity-90 focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      <Icon name="plus" className="size-3.5" />
                      <span>Create Hermes Job</span>
                    </button>
                  </form>

                  {/* Jobs List (GET /api/jobs) */}
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold text-foreground">
                      Hermes Jobs ({remoteJobs.length})
                    </h3>
                    {remoteJobs.length === 0 ? (
                      <p className="rounded-lg border border-border bg-canvas/40 p-3 text-xs text-muted">
                        No jobs returned from <code>GET /api/jobs</code>.
                      </p>
                    ) : (
                      <ul className="space-y-1.5">
                        {remoteJobs.map((job) => (
                          <li
                            key={job.id}
                            className="rounded-lg border border-border bg-canvas/50 p-3 text-xs"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-foreground">
                                {job.name}
                              </span>
                              <span className="rounded-full bg-secondary px-2 py-0.5 font-mono text-[10px] text-secondary-foreground">
                                {job.status}
                              </span>
                            </div>
                            {job.prompt && (
                              <p className="mt-1 line-clamp-2 text-[11px] text-muted">
                                {job.prompt}
                              </p>
                            )}
                            {job.schedule && (
                              <p className="mt-1 font-mono text-[10px] text-muted">
                                Schedule: {job.schedule}
                              </p>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
