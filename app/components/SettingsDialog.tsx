"use client";

import { useRouter } from "next/navigation";
import { type ChangeEvent, type DragEvent, useEffect, useId, useRef, useState } from "react";
import { Icon } from "../assets/icons";
import { type SettingsSectionId, useAgent } from "../lib/agent-store";
import { useDocs } from "../lib/docs-store";
import {
  buildExportFilename,
  type ImportMode,
  type ParsedImportResult,
  parseWorkspaceImport,
  serializeWorkspaceExport,
  type ThemePreference,
} from "../lib/docs-transfer";
import { useFinance } from "../lib/finance-store";
import { collectAccountSubtree } from "../lib/finance-utils";
import { useTodos } from "../lib/todos-store";
import { collectProjectSubtree } from "../lib/todos-utils";
import { useWorkspaceServer } from "../lib/workspace-server-store";
import { AgentSettingsPanel } from "./AgentSettingsPanel";
import { TrashSettingsPanel } from "./TrashSettingsPanel";

const SETTINGS_SECTIONS: ReadonlyArray<{
  id: SettingsSectionId;
  label: string;
  icon: "bot" | "database" | "trash";
}> = [
  { id: "agent", label: "Agent", icon: "bot" },
  { id: "data", label: "Import & Export", icon: "database" },
  { id: "trash", label: "Trash", icon: "trash" },
] as const;

type ThemeMode = ThemePreference;

function applyColorSchemeMeta(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  if (mode === "light" || mode === "dark") {
    document.documentElement.dataset.theme = mode;
  } else {
    delete document.documentElement.dataset.theme;
  }

  const targetContent = mode === "system" ? "light dark" : mode;
  const metas = document.querySelectorAll<HTMLMetaElement>(
    'meta[name="color-scheme"]'
  );
  if (metas.length === 0) {
    const meta = document.createElement("meta");
    meta.name = "color-scheme";
    meta.content = targetContent;
    document.head.appendChild(meta);
    return;
  }
  metas.forEach((meta) => {
    if (meta.content !== targetContent) {
      meta.content = targetContent;
    }
  });
}

/** Extensible workspace Settings modal using native <dialog> with Agent, JSON export/import, and Trash sections. */
export function SettingsDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const titleId = useId();
  const baseId = useId();
  const fileInputId = useId();
  const router = useRouter();
  const {
    settingsSection: activeSection,
    setSettingsSection: setActiveSection,
    config: agentConfig,
    sessions: agentSessions,
    importAgent,
  } = useAgent();
  const {
    docs,
    databases,
    trashedDocs,
    trashedDatabases,
    importWorkspace,
  } = useDocs();
  const { trashedAccounts, getExportSnapshot, importFinance } = useFinance();
  const {
    trashedProjects,
    getExportSnapshot: getTodosExportSnapshot,
    importTodos,
  } = useTodos();
  const {
    saveStatus,
    saveError,
    loadError,
    lastSavedAt,
    reloadFromServer,
  } = useWorkspaceServer();
  const trashCount =
    trashedDocs.length + trashedAccounts.length + trashedProjects.length;
  const financeSnapshot = getExportSnapshot();
  const todosSnapshot = getTodosExportSnapshot();

  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [themeMode, setThemeMode] = useState<ThemeMode>("system");
  const [systemIsDark, setSystemIsDark] = useState(false);
  const [stagedImport, setStagedImport] = useState<ParsedImportResult | null>(
    null
  );
  const [stagedFileName, setStagedFileName] = useState("");
  const [importMode, setImportMode] = useState<ImportMode>("merge");
  const [importError, setImportError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const resetTransientState = () => {
    setStagedImport(null);
    setStagedFileName("");
    setImportMode("merge");
    setImportError(null);
    setFeedback(null);
    setIsDragOver(false);
  };

  useEffect(() => {
    const readStoredTheme = (): ThemeMode => {
      try {
        const stored = localStorage.getItem("color-scheme");
        if (stored === "light" || stored === "dark") return stored;
      } catch {
        // Ignore storage errors
      }
      return "system";
    };

    const initial = readStoredTheme();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setThemeMode(initial);
    applyColorSchemeMeta(initial);

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    setSystemIsDark(mediaQuery.matches);

    const handleMediaChange = (event: MediaQueryListEvent) => {
      setSystemIsDark(event.matches);
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === "color-scheme" || event.key === null) {
        const next = readStoredTheme();
        setThemeMode(next);
        applyColorSchemeMeta(next);
      }
    };

    mediaQuery.addEventListener("change", handleMediaChange);
    window.addEventListener("storage", handleStorage);

    // Keep <meta name="color-scheme"> in sync when Next.js reconciles <head> on route transitions.
    const headObserver = new MutationObserver(() => {
      applyColorSchemeMeta(readStoredTheme());
    });
    headObserver.observe(document.head, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["content"],
    });

    return () => {
      mediaQuery.removeEventListener("change", handleMediaChange);
      window.removeEventListener("storage", handleStorage);
      headObserver.disconnect();
    };
  }, []);

  const handleSelectTheme = (next: ThemeMode) => {
    setThemeMode(next);
    applyColorSchemeMeta(next);
    try {
      if (next === "system") {
        localStorage.removeItem("color-scheme");
      } else {
        localStorage.setItem("color-scheme", next);
      }
    } catch {
      // Ignore storage restriction errors
    }
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Progressive enhancement fallback for browsers without native dialog `closedby="any"` (Safari).
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if ("closedBy" in HTMLDialogElement.prototype) return;

    const isOutside = (event: PointerEvent) => {
      const rect = dialog.getBoundingClientRect();
      return (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      );
    };

    let pressedOutside = false;
    const handlePointerDown = (event: PointerEvent) => {
      pressedOutside = isOutside(event);
    };
    const handlePointerUp = (event: PointerEvent) => {
      if (pressedOutside && isOutside(event)) {
        dialog.close();
      }
      pressedOutside = false;
    };

    dialog.addEventListener("pointerdown", handlePointerDown);
    dialog.addEventListener("pointerup", handlePointerUp);
    return () => {
      dialog.removeEventListener("pointerdown", handlePointerDown);
      dialog.removeEventListener("pointerup", handlePointerUp);
    };
  }, []);

  const handleNativeClose = () => {
    if (dialogRef.current) {
      dialogRef.current.returnValue = "";
    }
    resetTransientState();
    onClose();
  };

  const handleExportJson = () => {
    const allExportDocs = [...docs, ...trashedDocs];
    const allExportDbs = [...databases, ...trashedDatabases];
    const currentFinance = getExportSnapshot();
    const currentTodos = getTodosExportSnapshot();
    const json = serializeWorkspaceExport({
      docs: allExportDocs,
      databases: allExportDbs,
      finance: currentFinance,
      todos: currentTodos,
      agent: {
        config: agentConfig,
        sessions: agentSessions,
      },
      theme: themeMode,
    });
    const filename = buildExportFilename();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);

    setImportError(null);
    setFeedback(
      `Downloaded ${filename} (${allExportDocs.length} ${allExportDocs.length === 1 ? "doc" : "docs"}, ${allExportDbs.length} ${allExportDbs.length === 1 ? "database" : "databases"}, ${currentFinance.accounts.length} finance ${currentFinance.accounts.length === 1 ? "account" : "accounts"}, ${currentFinance.transactions.length} ${currentFinance.transactions.length === 1 ? "transaction" : "transactions"}, ${currentTodos.projects.length} todo ${currentTodos.projects.length === 1 ? "project" : "projects"}, ${currentTodos.tasks.length} ${currentTodos.tasks.length === 1 ? "task" : "tasks"}, ${agentSessions.length} agent ${agentSessions.length === 1 ? "session" : "sessions"}, settings & theme).`
    );
  };

  const handleReadFile = async (file: File) => {
    setFeedback(null);
    setImportError(null);

    try {
      const text = await file.text();
      const parsed = parseWorkspaceImport(text);
      if (!parsed.ok) {
        setStagedImport(null);
        setStagedFileName("");
        setImportError(parsed.error);
        return;
      }
      setStagedImport(parsed.data);
      setStagedFileName(file.name);
      setImportMode("merge");
    } catch {
      setStagedImport(null);
      setStagedFileName("");
      setImportError("Could not read the selected file.");
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    void handleReadFile(file);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    void handleReadFile(file);
  };

  const handleApplyImport = () => {
    if (!stagedImport) return;
    const { bundle } = stagedImport;
    const docsResult = importWorkspace(bundle, importMode);

    const summaryParts: string[] = [
      `${docsResult.docsCount} ${docsResult.docsCount === 1 ? "document" : "documents"}`,
      `${docsResult.databasesCount} ${docsResult.databasesCount === 1 ? "database" : "databases"}`,
    ];

    if (bundle.finance) {
      const finResult = importFinance(bundle.finance, importMode);
      summaryParts.push(
        `${finResult.accountsCount} finance ${finResult.accountsCount === 1 ? "account" : "accounts"}`,
        `${finResult.transactionsCount} ${finResult.transactionsCount === 1 ? "transaction" : "transactions"}`
      );
      if (finResult.recurringCount > 0) {
        summaryParts.push(
          `${finResult.recurringCount} recurring ${finResult.recurringCount === 1 ? "rule" : "rules"}`
        );
      }
    }

    if (bundle.todos) {
      const todosResult = importTodos(bundle.todos, importMode);
      summaryParts.push(
        `${todosResult.projectsCount} todo ${todosResult.projectsCount === 1 ? "project" : "projects"}`,
        `${todosResult.tasksCount} ${todosResult.tasksCount === 1 ? "task" : "tasks"}`
      );
    }

    if (bundle.agent) {
      const agentResult = importAgent(bundle.agent, importMode);
      summaryParts.push(
        `${agentResult.sessionsCount} agent ${agentResult.sessionsCount === 1 ? "session" : "sessions"}${
          agentResult.configUpdated ? " & Agent config" : ""
        }`
      );
    }

    if (importMode === "replace" && bundle.theme) {
      handleSelectTheme(bundle.theme);
      summaryParts.push(`theme (${bundle.theme})`);
    }

    if (importMode === "replace") {
      const currentPath = window.location.pathname;
      if (currentPath.startsWith("/docs/db/")) {
        const currentDbId = decodeURIComponent(
          currentPath.slice("/docs/db/".length).split("/")[0] ?? ""
        );
        if (
          !bundle.databases.some((db) => !db.trashedAt && db.id === currentDbId)
        ) {
          router.replace("/docs");
        }
      } else if (currentPath.startsWith("/docs/")) {
        const currentDocId = decodeURIComponent(
          currentPath.slice("/docs/".length).split("/")[0] ?? ""
        );
        if (
          !bundle.docs.some((doc) => !doc.trashedAt && doc.id === currentDocId)
        ) {
          router.replace("/docs");
        }
      } else if (currentPath.startsWith("/finance/") && bundle.finance) {
        const currentAccountId = decodeURIComponent(
          currentPath.slice("/finance/".length).split("/")[0] ?? ""
        );
        const hiddenFinanceIds = new Set<string>();
        for (const acc of bundle.finance.accounts) {
          if (acc.trashedAt) {
            for (const id of collectAccountSubtree(
              bundle.finance.accounts,
              acc.id
            )) {
              hiddenFinanceIds.add(id);
            }
          }
        }
        const hasActiveAccount = bundle.finance.accounts.some(
          (a) => a.id === currentAccountId && !hiddenFinanceIds.has(a.id)
        );
        if (!hasActiveAccount) {
          router.replace("/finance");
        }
      } else if (currentPath.startsWith("/todos/project/") && bundle.todos) {
        const currentProjectId = decodeURIComponent(
          currentPath.slice("/todos/project/".length).split("/")[0] ?? ""
        );
        const hiddenTodoProjectIds = new Set<string>();
        for (const proj of bundle.todos.projects) {
          if (proj.trashedAt) {
            for (const id of collectProjectSubtree(
              bundle.todos.projects,
              proj.id
            )) {
              hiddenTodoProjectIds.add(id);
            }
          }
        }
        const hasActiveProject = bundle.todos.projects.some(
          (p) => p.id === currentProjectId && !hiddenTodoProjectIds.has(p.id)
        );
        if (!hasActiveProject) {
          router.replace("/todos");
        }
      }
    }

    const actionWord =
      importMode === "replace" ? "Replaced workspace with" : "Imported";
    setStagedImport(null);
    setStagedFileName("");
    setImportError(null);
    setFeedback(`${actionWord} ${summaryParts.join(", ")}.`);
  };

  const currentSectionMeta =
    SETTINGS_SECTIONS.find((section) => section.id === activeSection) ??
    SETTINGS_SECTIONS[0];

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      {...({ closedby: "any" } as Record<string, string>)}
      onClose={handleNativeClose}
      className="settings-dialog m-auto w-[min(92vw,46rem)] max-h-[min(86dvh,40rem)] overflow-hidden rounded-xl border border-border bg-surface p-0 text-foreground shadow-2xl"
    >
      <div className="flex h-[min(82dvh,36rem)] flex-col sm:flex-row">
        {/* Left Navigation Column */}
        <div className="flex w-full shrink-0 flex-col justify-between border-b border-border bg-canvas/40 p-3 sm:w-52 sm:border-e sm:border-b-0">
          <div>
            <p className="px-2 pb-1.5 text-[11px] font-semibold tracking-wider text-muted uppercase">
              Settings
            </p>
            <div role="tablist" aria-label="Settings sections" className="space-y-0.5">
              {SETTINGS_SECTIONS.map((section) => {
                const isActive = section.id === activeSection;
                return (
                  <button
                    key={section.id}
                    id={`${baseId}-tab-${section.id}`}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    aria-controls={`${baseId}-panel-${section.id}`}
                    onClick={() => {
                      setActiveSection(section.id);
                      setFeedback(null);
                      setImportError(null);
                    }}
                    className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-start text-sm transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
                      isActive
                        ? "bg-secondary font-medium text-foreground"
                        : "text-muted hover:bg-secondary/70 hover:text-foreground"
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Icon name={section.icon} className="size-4 shrink-0" />
                      <span className="truncate">{section.label}</span>
                    </span>
                    {section.id === "trash" && trashCount > 0 && (
                      <span className="inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-canvas px-1.5 py-0.5 text-[10px] font-semibold text-muted">
                        {trashCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2.5 pt-3">
            <div
              role="group"
              aria-label="Theme preference"
              className="grid grid-cols-3 gap-1 rounded-lg border border-border bg-surface/80 p-1"
            >
              {(
                [
                  {
                    id: "light" as const,
                    label: "Light theme",
                    title: "Light",
                    icon: "sun" as const,
                  },
                  {
                    id: "system" as const,
                    label: `System theme (Currently ${systemIsDark ? "dark" : "light"})`,
                    title: `System (Currently ${systemIsDark ? "dark" : "light"})`,
                    icon: "monitor" as const,
                  },
                  {
                    id: "dark" as const,
                    label: "Dark theme",
                    title: "Dark",
                    icon: "moon" as const,
                  },
                ] as const
              ).map((option) => {
                const isSelected = themeMode === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-label={option.label}
                    aria-pressed={isSelected}
                    title={option.title}
                    onClick={() => handleSelectTheme(option.id)}
                    className={`inline-flex h-7 items-center justify-center rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
                      isSelected
                        ? "bg-secondary text-foreground shadow-2xs"
                        : "text-muted hover:bg-secondary/60 hover:text-foreground"
                    }`}
                  >
                    <Icon name={option.icon} className="size-3.5" />
                  </button>
                );
              })}
            </div>

            <p className="hidden px-2 text-xs text-muted sm:block">
              {docs.length} {docs.length === 1 ? "doc" : "docs"} ·{" "}
              {databases.length}{" "}
              {databases.length === 1 ? "database" : "databases"}
            </p>
          </div>
        </div>

        {/* Right Content Pane */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3.5">
            <h2 id={titleId} className="text-base font-semibold text-foreground">
              {currentSectionMeta.label}
            </h2>
            <button
              type="button"
              aria-label="Close settings"
              onClick={() => dialogRef.current?.close()}
              className="inline-flex size-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
            >
              <Icon name="x" className="size-4" />
            </button>
          </div>

          <div
            role="tabpanel"
            id={`${baseId}-panel-${activeSection}`}
            aria-labelledby={`${baseId}-tab-${activeSection}`}
            className="scroll-region flex-1 space-y-5 p-5"
          >
            {feedback && (
              <div
                role="status"
                aria-live="polite"
                className="rounded-lg border border-primary/30 bg-primary/10 px-3.5 py-2.5 text-xs text-foreground"
              >
                {feedback}
              </div>
            )}

            {activeSection === "agent" ? (
              <AgentSettingsPanel onFeedback={(msg) => setFeedback(msg)} />
            ) : activeSection === "trash" ? (
              <TrashSettingsPanel onFeedback={(msg) => setFeedback(msg)} />
            ) : (
              <>
                {/* Server Storage Section */}
                <section className="rounded-lg border border-border bg-canvas/50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">
                        Server storage (data/store.json)
                      </h3>
                      <p className="mt-1 text-xs leading-relaxed text-muted">
                        Docs, databases, finance records, tasks, and agent configuration auto-save to the server. UI preferences such as theme, sidebar expansion, active tabs, and recent routes stay in your browser.
                      </p>
                      <p className="mt-2 text-xs font-medium text-foreground">
                        {saveStatus === "saving"
                          ? "Saving…"
                          : saveStatus === "error" || loadError
                            ? `Sync error: ${saveError || loadError}`
                            : lastSavedAt
                              ? `Saved · ${new Date(lastSavedAt).toLocaleTimeString()}`
                              : "Saved"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        void reloadFromServer().then((ok) => {
                          if (ok) {
                            setImportError(null);
                            setFeedback("Reloaded workspace state from server.");
                          }
                        });
                      }}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      Reload from server
                    </button>
                  </div>
                </section>

                {/* Export Workspace Section */}
            <section className="rounded-lg border border-border bg-canvas/50 p-4">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-foreground">
                    Export workspace
                  </h3>
                  <p className="text-xs text-muted">
                    Download a full JSON backup of all documents &amp; databases
                    (including Trash), Finance accounts, transactions &amp;
                    recurring rules, Todos projects &amp; tasks, Agent settings
                    &amp; chat sessions, and theme preference (
                    {docs.length + trashedDocs.length}{" "}
                    {docs.length + trashedDocs.length === 1
                      ? "doc"
                      : "docs"}
                    , {databases.length + trashedDatabases.length}{" "}
                    {databases.length + trashedDatabases.length === 1
                      ? "database"
                      : "databases"}
                    , {financeSnapshot.accounts.length} finance{" "}
                    {financeSnapshot.accounts.length === 1
                      ? "account"
                      : "accounts"}
                    , {financeSnapshot.transactions.length}{" "}
                    {financeSnapshot.transactions.length === 1
                      ? "transaction"
                      : "transactions"}
                    , {todosSnapshot.projects.length} todo{" "}
                    {todosSnapshot.projects.length === 1
                      ? "project"
                      : "projects"}
                    , {todosSnapshot.tasks.length}{" "}
                    {todosSnapshot.tasks.length === 1 ? "task" : "tasks"}
                    , {agentSessions.length} agent{" "}
                    {agentSessions.length === 1 ? "session" : "sessions"}).
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleExportJson}
                  className="primary inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md px-3.5 text-xs font-medium transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <Icon name="download" className="size-4" />
                  <span>Download JSON</span>
                </button>
              </div>
            </section>

            {/* Import Workspace Section */}
            <section className="space-y-3 rounded-lg border border-border bg-canvas/50 p-4">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-foreground">
                  Import workspace
                </h3>
                <p className="text-xs text-muted">
                  Upload an MAA workspace <code>.json</code> backup to merge
                  pages, finance &amp; chat history or restore your full
                  workspace.
                </p>
              </div>

              <input
                ref={fileInputRef}
                id={fileInputId}
                type="file"
                accept=".json,application/json"
                onChange={handleFileChange}
                className="sr-only"
              />

              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
                className={`flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-5 text-center transition-colors ${
                  isDragOver
                    ? "border-primary bg-primary/10"
                    : "border-border bg-surface/60"
                }`}
              >
                <p className="text-xs text-muted">
                  Drag and drop a JSON export file here, or browse from disk.
                </p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-xs font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <Icon name="upload" className="size-3.5" />
                  <span>Choose JSON file</span>
                </button>
              </div>

              {importError && (
                <div
                  role="alert"
                  className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger"
                >
                  {importError}
                </div>
              )}

              {stagedImport && (
                <div className="space-y-3 rounded-lg border border-border bg-surface p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-foreground">
                        {stagedFileName}
                      </p>
                      <p className="text-xs text-muted">
                        Ready to import {stagedImport.docCount}{" "}
                        {stagedImport.docCount === 1
                          ? "document"
                          : "documents"}
                        {stagedImport.trashedDocCount > 0
                          ? ` (${stagedImport.trashedDocCount} in trash)`
                          : ""}
                        , {stagedImport.databaseCount}{" "}
                        {stagedImport.databaseCount === 1
                          ? "database"
                          : "databases"}
                        {stagedImport.hasFinance
                          ? `, ${stagedImport.financeAccountCount} finance ${
                              stagedImport.financeAccountCount === 1
                                ? "account"
                                : "accounts"
                            }${
                              stagedImport.financeTrashedAccountCount > 0
                                ? ` (${stagedImport.financeTrashedAccountCount} in trash)`
                                : ""
                            }, ${stagedImport.financeTransactionCount} ${
                              stagedImport.financeTransactionCount === 1
                                ? "transaction"
                                : "transactions"
                            }, ${stagedImport.financeRecurringCount} recurring ${
                              stagedImport.financeRecurringCount === 1
                                ? "rule"
                                : "rules"
                            }`
                          : ""}
                        {stagedImport.hasTodos
                          ? `, ${stagedImport.todoProjectCount} todo ${
                              stagedImport.todoProjectCount === 1
                                ? "project"
                                : "projects"
                            }${
                              stagedImport.todoTrashedProjectCount > 0
                                ? ` (${stagedImport.todoTrashedProjectCount} in trash)`
                                : ""
                            }, ${stagedImport.todoTaskCount} ${
                              stagedImport.todoTaskCount === 1
                                ? "task"
                                : "tasks"
                            }`
                          : ""}
                        {stagedImport.hasAgent
                          ? `, ${stagedImport.agentSessionCount} agent ${
                              stagedImport.agentSessionCount === 1
                                ? "session"
                                : "sessions"
                            } & Hermes config`
                          : ""}
                        {stagedImport.hasTheme && stagedImport.bundle.theme
                          ? `, theme (${stagedImport.bundle.theme})`
                          : ""}
                        .
                      </p>
                    </div>
                  </div>

                  {stagedImport.warnings.length > 0 && (
                    <ul className="space-y-1 text-xs text-muted">
                      {stagedImport.warnings.map((warning) => (
                        <li key={warning}>• {warning}</li>
                      ))}
                    </ul>
                  )}

                  <fieldset className="space-y-2">
                    <legend className="sr-only">Import mode</legend>

                    <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-border px-3 py-2 transition-colors hover:bg-secondary/40">
                      <input
                        type="radio"
                        name={`${baseId}-import-mode`}
                        value="merge"
                        checked={importMode === "merge"}
                        onChange={() => setImportMode("merge")}
                        className="mt-0.5 accent-primary"
                      />
                      <span className="space-y-0.5 text-xs">
                        <span className="block font-medium text-foreground">
                          Merge (add as copy)
                        </span>
                        <span className="block text-muted">
                          Keeps existing data, Agent config, and theme untouched;
                          assigns new IDs to imported pages, databases, finance
                          items, and chat sessions.
                        </span>
                      </span>
                    </label>

                    <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-border px-3 py-2 transition-colors hover:bg-secondary/40">
                      <input
                        type="radio"
                        name={`${baseId}-import-mode`}
                        value="replace"
                        checked={importMode === "replace"}
                        onChange={() => setImportMode("replace")}
                        className="mt-0.5 accent-primary"
                      />
                      <span className="space-y-0.5 text-xs">
                        <span className="block font-medium text-foreground">
                          Replace workspace
                        </span>
                        <span className="block text-muted">
                          Replaces all current workspace data (documents,
                          databases, Trash, Finance, Todos, Agent config &amp;
                          sessions, and theme) with the contents of this file.
                        </span>
                      </span>
                    </label>
                  </fieldset>

                  <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setStagedImport(null);
                        setStagedFileName("");
                        setImportError(null);
                      }}
                      className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium text-muted transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      Cancel
                    </button>

                    <button
                      type="button"
                      onClick={handleApplyImport}
                      className={`inline-flex h-8 items-center rounded-md px-3 text-xs font-medium transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 ${
                        importMode === "replace"
                          ? "bg-danger text-danger-foreground focus-visible:outline-danger"
                          : "primary focus-visible:outline-primary"
                      }`}
                    >
                      {importMode === "replace"
                        ? "Replace workspace"
                        : "Import data"}
                    </button>
                  </div>
                </div>
              )}
            </section>
            </>
            )}
          </div>
        </div>
      </div>
    </dialog>
  );
}
