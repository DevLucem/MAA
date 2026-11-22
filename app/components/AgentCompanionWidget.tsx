"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  type FormEvent,
  type KeyboardEvent,
  useId,
  useRef,
  useState,
} from "react";
import { Icon } from "../assets/icons";
import { useAgent } from "../lib/agent-store";
import { useChatAutoScroll } from "../lib/use-chat-autoscroll";

const MINI_STARTERS = [
  "Summarize my open tasks",
  "Review my finance accounts",
  "Help me draft a new doc",
] as const;

/**
 * Mini Agent Chat panel shared between the bottom-right floating support widget
 * and the docked right-hand sidebar on non-root routes.
 */
function MiniAgentChatPanel({ mode }: { mode: "floating" | "sidebar" }) {
  const baseId = useId();
  const sessionSelectId = `${baseId}-session`;
  const promptInputId = `${baseId}-prompt`;

  const {
    sessions,
    activeSession,
    setActiveSessionId,
    createSession,
    clearSessionMessages,
    isStreaming,
    sendMessage,
    stopRun,
    approveRun,
    clarifyRun,
    setWidgetMode,
    openSettings,
  } = useAgent();

  const [input, setInput] = useState("");
  const [clarifyText, setClarifyText] = useState("");

  const formRef = useRef<HTMLFormElement | null>(null);
  const { scrollContainerRef, handleScroll } = useChatAutoScroll({
    sessionId: activeSession.id,
    messages: activeSession.messages,
    isStreaming,
    openKey: mode,
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    setInput("");
    void sendMessage(trimmed);
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
    const clean = clarifyText.trim();
    if (!clean) return;
    setClarifyText("");
    await clarifyRun(runId, clean, msgId);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface text-foreground">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between gap-1.5 border-b border-border bg-canvas/60 px-3 py-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <Icon name="bot" className="size-4 shrink-0 text-primary" />
          <label htmlFor={sessionSelectId} className="sr-only">
            Active agent session
          </label>
          <select
            id={sessionSelectId}
            value={activeSession.id}
            onChange={(e) => setActiveSessionId(e.currentTarget.value)}
            className="h-7 min-w-0 flex-1 truncate rounded-md border border-border bg-surface px-2 text-xs font-medium text-foreground focus-visible:outline-2 focus-visible:outline-primary"
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
            title="New session"
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
          >
            <Icon name="plus" className="size-3.5" />
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          {activeSession.messages.length > 0 && (
            <button
              type="button"
              onClick={() => clearSessionMessages(activeSession.id)}
              aria-label="Clear chat messages"
              title="Clear chat"
              className="inline-flex size-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
            >
              <Icon name="trash" className="size-3.5" />
            </button>
          )}

          {mode === "floating" ? (
            <button
              type="button"
              onClick={() => setWidgetMode("sidebar")}
              aria-label="Dock chat to right sidebar"
              title="Move to right sidebar"
              className="inline-flex size-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
            >
              <Icon name="panel-right" className="size-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setWidgetMode("floating")}
              aria-label="Undock chat to floating bubble window"
              title="Move to floating window"
              className="inline-flex size-7 items-center justify-center rounded-md text-primary transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary"
            >
              <Icon name="panel-right" className="size-3.5" />
            </button>
          )}

          <Link
            href="/"
            aria-label="Open full chat on Home page"
            title="Open in Home page"
            className="inline-flex size-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
          >
            <Icon name="maximize" className="size-3.5" />
          </Link>

          <button
            type="button"
            onClick={() => setWidgetMode("closed")}
            aria-label="Close chat panel"
            title="Minimize to chat bubble"
            className="inline-flex size-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
          >
            <Icon name="x" className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Messages Thread */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="scroll-region flex-1 space-y-3 p-3"
      >
        {activeSession.messages.length === 0 ? (
          <div className="flex h-full flex-col justify-center space-y-4 py-6 text-center">
            <div className="mx-auto inline-flex size-10 items-center justify-center rounded-xl border border-border bg-canvas">
              <Icon name="bot" className="size-5 text-primary" />
            </div>
            <div className="space-y-1 px-2">
              <p className="text-sm font-semibold text-foreground">
                Hermes Assistant
              </p>
              <p className="text-xs text-muted">
                Ask questions while working across Docs and Finance.
              </p>
            </div>
            <div className="flex flex-col gap-1.5 px-2">
              {MINI_STARTERS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => void sendMessage(prompt)}
                  className="rounded-lg border border-border bg-canvas px-3 py-2 text-start text-xs text-foreground transition-colors hover:border-primary/40 hover:bg-secondary/60 focus-visible:outline-2 focus-visible:outline-primary"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          activeSession.messages.map((message, index) => {
            const isLast = index === activeSession.messages.length - 1;
            const isUser = message.role === "user";

            return (
              <div
                key={message.id}
                className={`flex flex-col gap-1.5 ${
                  isLast ? "chat-initial-target" : ""
                } ${isUser ? "items-end" : "items-start"}`}
              >
                <div
                  className={`max-w-[92%] rounded-xl px-3 py-2 text-xs ${
                    isUser
                      ? "primary rounded-br-xs"
                      : "w-full rounded-bl-xs border border-border bg-canvas text-foreground"
                  }`}
                >
                  {message.thinking && (
                    <details className="mb-1.5 rounded border border-border bg-surface/60 px-2 py-1 text-[11px]">
                      <summary className="cursor-pointer font-medium text-muted select-none">
                        Reasoning
                      </summary>
                      <pre className="mt-1 whitespace-pre-wrap font-mono text-[10px] text-muted">
                        {message.thinking}
                      </pre>
                    </details>
                  )}

                  {message.toolSteps && message.toolSteps.length > 0 && (
                    <div className="mb-2 space-y-1">
                      {message.toolSteps.map((step) => (
                        <div
                          key={step.id}
                          className="flex items-center justify-between gap-1.5 rounded border border-border bg-surface px-2 py-1 font-mono text-[10px]"
                        >
                          <span className="truncate text-foreground">
                            {step.name}
                          </span>
                          <span
                            className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${
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
                      ))}
                    </div>
                  )}

                  {message.content ? (
                    <div className="whitespace-pre-wrap leading-relaxed">
                      {message.content}
                    </div>
                  ) : message.status === "streaming" ? (
                    <div className="flex items-center gap-1.5 text-[11px] text-muted">
                      <Icon
                        name="sync"
                        className="size-3 animate-spin text-primary"
                      />
                      <span>Hermes is thinking…</span>
                    </div>
                  ) : null}

                  {message.status === "error" && message.error && (
                    <div
                      role="alert"
                      className="mt-1.5 space-y-1.5 rounded border border-danger/40 bg-danger/10 p-2 text-[11px] text-danger"
                    >
                      <p>{message.error}</p>
                      <button
                        type="button"
                        onClick={() => openSettings("agent")}
                        className="inline-flex h-6 items-center gap-1 rounded border border-border bg-surface px-2 text-[10px] font-medium text-foreground hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary"
                      >
                        <Icon name="settings" className="size-3" />
                        <span>Agent Settings</span>
                      </button>
                    </div>
                  )}

                  {message.pendingInteraction && (
                    <div className="mt-2 space-y-2 rounded-lg border border-primary/40 bg-primary/10 p-2.5 text-[11px]">
                      <p className="font-semibold text-foreground">
                        {message.pendingInteraction.type === "approval"
                          ? "Approval Required"
                          : "Clarification Needed"}
                      </p>
                      <p className="text-muted">
                        {message.pendingInteraction.prompt}
                      </p>
                      {message.pendingInteraction.type === "approval" ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              void approveRun(
                                message.pendingInteraction!.runId,
                                true,
                                message.id
                              )
                            }
                            className="primary inline-flex h-7 items-center rounded px-2.5 text-[11px] font-medium hover:opacity-90 focus-visible:outline-2 focus-visible:outline-primary"
                          >
                            Approve
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
                            className="inline-flex h-7 items-center rounded border border-danger/40 bg-danger/10 px-2.5 text-[11px] font-medium text-danger hover:bg-danger/20 focus-visible:outline-2 focus-visible:outline-danger"
                          >
                            Deny
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={clarifyText}
                            onChange={(e) =>
                              setClarifyText(e.currentTarget.value)
                            }
                            placeholder="Your response…"
                            aria-label="Clarification response"
                            className="h-7 min-w-0 flex-1 rounded border border-border bg-surface px-2 text-[11px] text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              void handleClarifySubmit(
                                message.pendingInteraction!.runId,
                                message.id
                              )
                            }
                            className="primary inline-flex h-7 shrink-0 items-center rounded px-2.5 text-[11px] font-medium hover:opacity-90 focus-visible:outline-2 focus-visible:outline-primary"
                          >
                            Send
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Compact Composer */}
      <form
        ref={formRef}
        onSubmit={handleSubmit}
        className="shrink-0 border-t border-border bg-canvas/80 p-2.5"
      >
        <label htmlFor={promptInputId} className="sr-only">
          Message Hermes Agent
        </label>
        <div className="flex items-end gap-1.5 rounded-xl border border-border bg-surface p-2 focus-within:border-primary">
          <textarea
            id={promptInputId}
            name="prompt"
            value={input}
            onChange={(e) => setInput(e.currentTarget.value)}
            onKeyDown={handleTextareaKeyDown}
            placeholder="Ask Hermes… (Enter to send)"
            className="chat-composer-textarea max-h-32 min-h-8 flex-1 resize-none border-0 bg-transparent text-xs text-foreground placeholder:text-muted focus:outline-none"
          />
          {isStreaming ? (
            <button
              type="button"
              onClick={() => void stopRun()}
              aria-label="Stop current run"
              className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg border border-danger/40 bg-danger/10 text-danger transition-colors hover:bg-danger/20 focus-visible:outline-2 focus-visible:outline-danger"
            >
              <Icon name="stop" className="size-3.5" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              aria-label="Send message"
              className="primary inline-flex size-7 shrink-0 items-center justify-center rounded-lg transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-40"
            >
              <Icon name="send" className="size-3.5" />
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

/**
 * Renders the docked right-hand Agent sidebar when `pathname !== "/"` and `widgetMode === "sidebar"`.
 */
export function AgentRightSidebar() {
  const pathname = usePathname();
  const { widgetMode } = useAgent();

  if (pathname === "/" || widgetMode !== "sidebar") {
    return null;
  }

  return (
    <aside
      aria-label="Hermes Agent Sidebar"
      className="flex w-80 shrink-0 flex-col overflow-hidden border-s border-border bg-surface lg:w-96"
    >
      <MiniAgentChatPanel mode="sidebar" />
    </aside>
  );
}

/**
 * Builds a closed full-360° harmonic wave SVG path around (cx, cy) so that
 * multiple phase-shifted frames can smoothly morph, ripple, and pulse.
 */
function buildWavyRingFrame(
  cx: number,
  cy: number,
  baseRadius: number,
  freqA: number,
  ampA: number,
  freqB: number,
  ampB: number,
  phase: number
): string {
  const steps = 96;
  const points: string[] = [];

  for (let i = 0; i < steps; i++) {
    const theta = (i / steps) * Math.PI * 2;
    const wave =
      ampA * Math.sin(freqA * theta + phase) +
      ampB * Math.cos(freqB * theta - phase * 1.3);
    const r = baseRadius + wave;
    const x = (cx + r * Math.cos(theta)).toFixed(2);
    const y = (cy + r * Math.sin(theta)).toFixed(2);
    points.push(`${i === 0 ? "M" : "L"} ${x} ${y}`);
  }

  return `${points.join(" ")} Z`;
}

const RING_1_FRAMES = [
  buildWavyRingFrame(44, 44, 30.5, 6, 2.6, 4, 1.4, 0),
  buildWavyRingFrame(44, 44, 32.2, 6, 3.4, 4, 1.8, Math.PI * 0.66),
  buildWavyRingFrame(44, 44, 29.5, 6, 2.1, 4, 2.2, Math.PI * 1.33),
  buildWavyRingFrame(44, 44, 30.5, 6, 2.6, 4, 1.4, Math.PI * 2),
].join(";");

const RING_2_FRAMES = [
  buildWavyRingFrame(44, 44, 30.0, 5, 2.8, 3, 1.6, 0.8),
  buildWavyRingFrame(44, 44, 28.8, 5, 2.0, 3, 2.4, 0.8 + Math.PI * 0.66),
  buildWavyRingFrame(44, 44, 31.8, 5, 3.3, 3, 1.5, 0.8 + Math.PI * 1.33),
  buildWavyRingFrame(44, 44, 30.0, 5, 2.8, 3, 1.6, 0.8 + Math.PI * 2),
].join(";");

const RING_3_FRAMES = [
  buildWavyRingFrame(44, 44, 29.5, 7, 2.2, 5, 1.5, 1.7),
  buildWavyRingFrame(44, 44, 32.0, 7, 3.0, 5, 2.0, 1.7 + Math.PI * 0.66),
  buildWavyRingFrame(44, 44, 29.0, 7, 1.8, 5, 1.9, 1.7 + Math.PI * 1.33),
  buildWavyRingFrame(44, 44, 29.5, 7, 2.2, 5, 1.5, 1.7 + Math.PI * 2),
].join(";");

const INITIAL_RING_1 = buildWavyRingFrame(44, 44, 30.5, 6, 2.6, 4, 1.4, 0);
const INITIAL_RING_2 = buildWavyRingFrame(44, 44, 30.0, 5, 2.8, 3, 1.6, 0.8);
const INITIAL_RING_3 = buildWavyRingFrame(44, 44, 29.5, 7, 2.2, 5, 1.5, 1.7);

function AgentWavyRing() {
  const gradId1 = useId();
  const gradId2 = useId();

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 88 88"
      className="agent-wavy-ring agent-wave-pulse pointer-events-none absolute -inset-4 size-21 overflow-visible"
    >
      <defs>
        <linearGradient id={gradId1} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="50%" stopColor="#0ea5e9" />
          <stop offset="100%" stopColor="#2563eb" />
        </linearGradient>
        <linearGradient id={gradId2} x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#60a5fa" />
          <stop offset="50%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#1d4ed8" />
        </linearGradient>
      </defs>

      {/* Outer pulsing aura circle */}
      <circle
        cx="44"
        cy="44"
        r="31"
        fill="none"
        stroke={`url(#${gradId1})`}
        strokeWidth="1.5"
        opacity="0.35"
      >
        <animate
          attributeName="r"
          values="28;35;28"
          dur="2s"
          repeatCount="indefinite"
        />
        <animate
          attributeName="opacity"
          values="0.5;0.1;0.5"
          dur="2s"
          repeatCount="indefinite"
        />
      </circle>

      {/* Layer 3: Deep ambient harmonic wave ring (rotates + morphs) */}
      <g className="agent-wave-layer-3">
        <path
          d={INITIAL_RING_3}
          fill="none"
          stroke={`url(#${gradId2})`}
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.6"
        >
          <animate
            attributeName="d"
            values={RING_3_FRAMES}
            dur="2.4s"
            repeatCount="indefinite"
          />
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 44 44"
            to="360 44 44"
            dur="5.2s"
            repeatCount="indefinite"
          />
        </path>
      </g>

      {/* Layer 2: Counter-rotating electric blue harmonic wave ring */}
      <g className="agent-wave-layer-2">
        <path
          d={INITIAL_RING_2}
          fill="none"
          stroke={`url(#${gradId2})`}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.85"
        >
          <animate
            attributeName="d"
            values={RING_2_FRAMES}
            dur="1.9s"
            repeatCount="indefinite"
          />
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="360 44 44"
            to="0 44 44"
            dur="3.6s"
            repeatCount="indefinite"
          />
        </path>
      </g>

      {/* Layer 1: Primary bright cyan-blue wavy ring */}
      <g className="agent-wave-layer-1">
        <path
          d={INITIAL_RING_1}
          fill="none"
          stroke={`url(#${gradId1})`}
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <animate
            attributeName="d"
            values={RING_1_FRAMES}
            dur="1.5s"
            repeatCount="indefinite"
          />
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 44 44"
            to="360 44 44"
            dur="2.6s"
            repeatCount="indefinite"
          />
        </path>
      </g>
    </svg>
  );
}

/**
 * Renders the bottom-right floating chat bubble or expanded mini support-chat overlay
 * when `pathname !== "/"` and `widgetMode !== "sidebar"`.
 */
export function AgentFloatingWidget() {
  const pathname = usePathname();
  const { widgetMode, setWidgetMode, isStreaming, activeSession } = useAgent();

  if (pathname === "/" || widgetMode === "sidebar") {
    return null;
  }

  if (widgetMode === "closed") {
    return (
      <div className="fixed end-5 bottom-5 z-40">
        <button
          type="button"
          onClick={() => setWidgetMode("floating")}
          aria-label="Open Hermes Agent chat"
          className="primary group relative inline-flex size-13 items-center justify-center rounded-full shadow-lg transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {isStreaming && <AgentWavyRing />}
          <Icon name="bot" className="relative z-10 size-6" />
          {!isStreaming && activeSession.messages.length > 0 && (
            <span
              aria-hidden="true"
              className="absolute -top-1 -end-1 z-20 inline-flex min-w-5 items-center justify-center rounded-full border border-border bg-surface px-1 py-0.5 text-[10px] font-semibold text-foreground shadow-xs"
            >
              {activeSession.messages.length}
            </span>
          )}
        </button>
      </div>
    );
  }

  return (
    <section
      aria-label="Hermes Agent mini chat"
      className="fixed end-5 bottom-5 z-40 flex h-[min(34rem,calc(100dvh-5rem))] w-[min(23rem,calc(100dvw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl"
    >
      <MiniAgentChatPanel mode="floating" />
    </section>
  );
}
