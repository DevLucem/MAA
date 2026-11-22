"use client";

import { type FormEvent, useId, useState } from "react";
import { Icon } from "../assets/icons";
import { useAgent } from "../lib/agent-store";
import {
  DEFAULT_HERMES_CONFIG,
  type HermesConnectionTestResult,
  type HermesEndpointMode,
  type HermesRoutingMode,
  testHermesConnection,
} from "../lib/hermes-client";

interface AgentSettingsPanelProps {
  onFeedback: (message: string) => void;
}

const ENDPOINT_OPTIONS: Array<{
  value: HermesEndpointMode;
  label: string;
  endpoint: string;
  description: string;
}> = [
  {
    value: "chat",
    label: "Chat Completions (OpenAI-compatible)",
    endpoint: "POST /v1/chat/completions",
    description:
      "Standard multi-turn chat requests with SSE streaming and inline tool progress updates.",
  },
  {
    value: "runs",
    label: "Agent Runs (Interactive Run Control)",
    endpoint: "POST /v1/runs",
    description:
      "Streaming-friendly agent runs with run control (/v1/runs/{id}/stop, /approval, and /clarify).",
  },
  {
    value: "responses",
    label: "Multi-turn Responses",
    endpoint: "POST /v1/responses",
    description:
      "Stateful multi-turn responses API maintaining response chains across turns.",
  },
];

const ROUTING_OPTIONS: Array<{
  value: HermesRoutingMode;
  label: string;
  description: string;
}> = [
  {
    value: "proxy",
    label: "Route through MAA backend proxy (/api/hermes)",
    description:
      "Recommended. Avoids browser CORS restrictions so API_SERVER_CORS_ORIGINS is not required.",
  },
  {
    value: "direct",
    label: "Call Hermes directly from browser",
    description:
      "Requires API_SERVER_CORS_ORIGINS=http://localhost:3000 in ~/.hermes/.env.",
  },
];

/** Hermes Agent configuration panel inside Settings -> Agent section. */
export function AgentSettingsPanel({ onFeedback }: AgentSettingsPanelProps) {
  const baseId = useId();
  const baseUrlId = `${baseId}-base-url`;
  const baseUrlHelpId = `${baseId}-base-url-help`;
  const apiKeyId = `${baseId}-api-key`;
  const apiKeyHelpId = `${baseId}-api-key-help`;
  const toggleWarningId = `${baseId}-toggle-warning`;
  const modelId = `${baseId}-model`;
  const systemPromptId = `${baseId}-system-prompt`;
  const streamId = `${baseId}-stream`;
  const workspaceContextId = `${baseId}-workspace-ctx`;

  const { config, updateConfig, resetConfig } = useAgent();

  const [showApiKey, setShowApiKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] =
    useState<HermesConnectionTestResult | null>(null);
  const [copiedEnv, setCopiedEnv] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);

  const validateBaseUrl = (value: string): boolean => {
    const trimmed = value.trim();
    if (!trimmed) {
      setUrlError("Please enter the Hermes API Server URL (e.g. http://127.0.0.1:8642).");
      return false;
    }
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        setUrlError("URL must start with http:// or https://.");
        return false;
      }
      setUrlError(null);
      return true;
    } catch {
      setUrlError("Please enter a valid URL including http:// or https://.");
      return false;
    }
  };

  const handleTestConnection = async () => {
    if (!validateBaseUrl(config.baseUrl)) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testHermesConnection(config);
      setTestResult(result);
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!validateBaseUrl(config.baseUrl)) return;
    onFeedback("Saved Hermes agent configuration.");
  };

  const envSnippet = `API_SERVER_ENABLED=true
API_SERVER_KEY=${config.apiKey.trim() || "your-secret-key"}${
    config.routingMode === "direct"
      ? "\nAPI_SERVER_CORS_ORIGINS=http://localhost:3000"
      : ""
  }`;

  const handleCopyEnv = async () => {
    try {
      await navigator.clipboard.writeText(envSnippet);
      setCopiedEnv(true);
      window.setTimeout(() => setCopiedEnv(false), 1800);
    } catch {
      // Ignore clipboard failure
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {/* Hermes API Server Connection */}
      <section className="space-y-4 rounded-lg border border-border bg-canvas/50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-0.5">
            <h3 className="text-sm font-semibold text-foreground">
              Hermes Built-in API Server
            </h3>
            <p className="text-xs text-muted">
              Connect to your local or remote{" "}
              <code className="rounded bg-secondary px-1 py-0.5 font-mono text-[11px]">
                hermes gateway
              </code>{" "}
              instance using Bearer token authentication.
            </p>
          </div>

          <button
            type="button"
            disabled={testing}
            onClick={() => void handleTestConnection()}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-xs font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
          >
            <Icon
              name="sync"
              className={`size-3.5 ${testing ? "animate-spin" : ""}`}
            />
            <span>{testing ? "Testing…" : "Test connection"}</span>
          </button>
        </div>

        {testResult && (
          <div
            role={testResult.ok ? "status" : "alert"}
            aria-live="polite"
            className={`rounded-md border px-3 py-2.5 text-xs ${
              testResult.ok
                ? "border-success/40 bg-success/10 text-foreground"
                : "border-danger/40 bg-danger/10 text-danger"
            }`}
          >
            <p className="font-medium">{testResult.message}</p>
          </div>
        )}

        {/* Base URL */}
        <div className="space-y-1">
          <label
            htmlFor={baseUrlId}
            className="block text-xs font-medium text-foreground"
          >
            API Server Base URL
          </label>
          <p id={baseUrlHelpId} className="text-[11px] text-muted">
            Defaults to <code>http://127.0.0.1:8642</code> when running{" "}
            <code>hermes gateway</code> locally.
          </p>
          <input
            id={baseUrlId}
            name="baseUrl"
            type="url"
            required
            value={config.baseUrl}
            aria-invalid={urlError ? "true" : undefined}
            aria-describedby={
              urlError ? `${baseUrlHelpId} ${baseId}-url-error` : baseUrlHelpId
            }
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="http://127.0.0.1:8642"
            onChange={(e) => {
              if (urlError) setUrlError(null);
              updateConfig({ baseUrl: e.currentTarget.value });
            }}
            onBlur={(e) => validateBaseUrl(e.currentTarget.value)}
            className="h-9 w-full rounded-md border border-border bg-surface px-3 font-mono text-xs text-foreground placeholder:text-muted focus-visible:outline-2 focus-visible:outline-primary"
          />
          {urlError && (
            <p
              id={`${baseId}-url-error`}
              role="alert"
              className="text-xs text-danger"
            >
              {urlError}
            </p>
          )}
        </div>

        {/* Bearer Token / API_SERVER_KEY */}
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor={apiKeyId}
              className="block text-xs font-medium text-foreground"
            >
              Bearer Token (<code>API_SERVER_KEY</code>)
            </label>
            <button
              type="button"
              aria-pressed={showApiKey}
              aria-describedby={toggleWarningId}
              onClick={() => setShowApiKey((prev) => !prev)}
              className="rounded px-1.5 py-0.5 text-[11px] font-medium text-muted transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
            >
              {showApiKey ? "Hide key" : "Show key"}
            </button>
            <span id={toggleWarningId} className="sr-only">
              Warning: this will display your API key on the screen.
            </span>
          </div>
          <p id={apiKeyHelpId} className="text-[11px] text-muted">
            Sent as <code>Authorization: Bearer &lt;API_SERVER_KEY&gt;</code>.
          </p>
          <input
            id={apiKeyId}
            name="apiKey"
            type={showApiKey ? "text" : "password"}
            value={config.apiKey}
            aria-describedby={apiKeyHelpId}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="your-secret-key"
            onChange={(e) => updateConfig({ apiKey: e.currentTarget.value })}
            className="h-9 w-full rounded-md border border-border bg-surface px-3 font-mono text-xs text-foreground placeholder:text-muted focus-visible:outline-2 focus-visible:outline-primary"
          />
        </div>

        {/* Model Name */}
        <div className="space-y-1">
          <label
            htmlFor={modelId}
            className="block text-xs font-medium text-foreground"
          >
            Agent Model Identifier
          </label>
          <input
            id={modelId}
            name="model"
            type="text"
            value={config.model}
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="hermes-agent"
            onChange={(e) => updateConfig({ model: e.currentTarget.value })}
            className="h-9 w-full rounded-md border border-border bg-surface px-3 font-mono text-xs text-foreground placeholder:text-muted focus-visible:outline-2 focus-visible:outline-primary"
          />
        </div>
      </section>

      {/* Endpoint & Routing Mode */}
      <section className="space-y-4 rounded-lg border border-border bg-canvas/50 p-4">
        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold text-foreground">
            Primary Hermes Endpoint
          </legend>
          <p className="text-[11px] text-muted">
            Choose which Hermes endpoint powers conversation turns on the Home
            page. You can also switch endpoints directly from the chat composer.
          </p>

          <div className="space-y-2 pt-1">
            {ENDPOINT_OPTIONS.map((option) => (
              <label
                key={option.value}
                className="flex cursor-pointer items-start gap-2.5 rounded-md border border-border bg-surface/60 px-3 py-2.5 transition-colors hover:bg-secondary/40"
              >
                <input
                  type="radio"
                  name={`${baseId}-endpoint-mode`}
                  value={option.value}
                  checked={config.endpointMode === option.value}
                  onChange={() => updateConfig({ endpointMode: option.value })}
                  className="mt-0.5 accent-primary"
                />
                <span className="min-w-0 flex-1 space-y-0.5 text-xs">
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-foreground">
                      {option.label}
                    </span>
                    <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-secondary-foreground">
                      {option.endpoint}
                    </code>
                  </span>
                  <span className="block text-muted">{option.description}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-2 border-t border-border pt-3">
          <legend className="text-xs font-semibold text-foreground">
            Request Routing &amp; CORS
          </legend>
          <div className="space-y-2 pt-1">
            {ROUTING_OPTIONS.map((option) => (
              <label
                key={option.value}
                className="flex cursor-pointer items-start gap-2.5 rounded-md border border-border bg-surface/60 px-3 py-2 transition-colors hover:bg-secondary/40"
              >
                <input
                  type="radio"
                  name={`${baseId}-routing-mode`}
                  value={option.value}
                  checked={config.routingMode === option.value}
                  onChange={() => updateConfig({ routingMode: option.value })}
                  className="mt-0.5 accent-primary"
                />
                <span className="space-y-0.5 text-xs">
                  <span className="block font-medium text-foreground">
                    {option.label}
                  </span>
                  <span className="block text-muted">{option.description}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      {/* Behavior & System Instructions */}
      <section className="space-y-3 rounded-lg border border-border bg-canvas/50 p-4">
        <h3 className="text-xs font-semibold text-foreground">
          Agent Behavior &amp; Context
        </h3>

        <div className="space-y-2">
          <div className="flex items-start gap-2.5">
            <input
              id={streamId}
              name="stream"
              type="checkbox"
              checked={config.stream}
              onChange={(e) =>
                updateConfig({ stream: e.currentTarget.checked })
              }
              className="mt-0.5 size-4 rounded border-border accent-primary"
            />
            <label
              htmlFor={streamId}
              className="cursor-pointer space-y-0.5 text-xs"
            >
              <span className="block font-medium text-foreground">
                Enable SSE streaming responses
              </span>
              <span className="block text-muted">
                Streams token deltas and live tool execution progress as Hermes
                works.
              </span>
            </label>
          </div>

          <div className="flex items-start gap-2.5">
            <input
              id={workspaceContextId}
              name="includeWorkspaceContext"
              type="checkbox"
              checked={config.includeWorkspaceContext}
              onChange={(e) =>
                updateConfig({
                  includeWorkspaceContext: e.currentTarget.checked,
                })
              }
              className="mt-0.5 size-4 rounded border-border accent-primary"
            />
            <label
              htmlFor={workspaceContextId}
              className="cursor-pointer space-y-0.5 text-xs"
            >
              <span className="block font-medium text-foreground">
                Include MAA workspace context (Docs &amp; Finance summary)
              </span>
              <span className="block text-muted">
                Provides Hermes with an up-to-date overview of your documents,
                open to-dos, and finance accounts.
              </span>
            </label>
          </div>
        </div>

        <div className="space-y-1 pt-1">
          <label
            htmlFor={systemPromptId}
            className="block text-xs font-medium text-foreground"
          >
            System Instructions
          </label>
          <textarea
            id={systemPromptId}
            name="systemPrompt"
            value={config.systemPrompt}
            onChange={(e) =>
              updateConfig({ systemPrompt: e.currentTarget.value })
            }
            placeholder="Optional system prompt sent to Hermes…"
            className="auto-fit-textarea w-full rounded-md border border-border bg-surface p-2.5 text-xs text-foreground placeholder:text-muted focus-visible:outline-2 focus-visible:outline-primary"
          />
        </div>
      </section>

      {/* Quick Setup Guide for ~/.hermes/.env */}
      <section className="space-y-2.5 rounded-lg border border-border bg-canvas/50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-semibold text-foreground">
              Hermes Gateway Setup Reference
            </h3>
            <p className="text-[11px] text-muted">
              Add to <code>~/.hermes/.env</code> and start with{" "}
              <code>hermes gateway</code>.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleCopyEnv()}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-surface px-2.5 text-[11px] font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary"
          >
            <Icon name="copy" className="size-3.5" />
            <span>{copiedEnv ? "Copied .env" : "Copy .env"}</span>
          </button>
        </div>

        <pre className="overflow-x-auto rounded-md border border-border bg-surface p-2.5 font-mono text-[11px] leading-relaxed text-foreground">
          <code>{envSnippet}</code>
        </pre>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <button
            type="button"
            onClick={() => {
              resetConfig();
              setTestResult(null);
              setUrlError(null);
              onFeedback(
                `Reset Agent settings to defaults (${DEFAULT_HERMES_CONFIG.baseUrl}).`
              );
            }}
            className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium text-muted transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
          >
            Reset to defaults
          </button>

          <button
            type="submit"
            className="primary inline-flex h-8 items-center gap-1.5 rounded-md px-3.5 text-xs font-medium transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Save changes
          </button>
        </div>
      </section>
    </form>
  );
}
