"use client";

import { useRouter } from "next/navigation";
import { type ChangeEvent, type DragEvent, useEffect, useId, useRef, useState } from "react";
import { Icon } from "../assets/icons";
import { useDocs } from "../lib/docs-store";
import {
  buildExportFilename,
  type ImportMode,
  type ParsedImportResult,
  parseWorkspaceImport,
  serializeWorkspaceExport,
} from "../lib/docs-transfer";
import { useFinance } from "../lib/finance-store";
import { TrashSettingsPanel } from "./TrashSettingsPanel";

const SETTINGS_SECTIONS = [
  { id: "data", label: "Import & Export", icon: "database" as const },
  { id: "trash", label: "Trash", icon: "trash" as const },
] as const;

type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]["id"];

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

/** Extensible workspace Settings modal using native <dialog> with JSON export and import. */
export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const titleId = useId();
  const baseId = useId();
  const fileInputId = useId();
  const router = useRouter();
  const { docs, databases, trashedDocs, importWorkspace } = useDocs();
  const { trashedAccounts } = useFinance();
  const trashCount = trashedDocs.length + trashedAccounts.length;

  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeSection, setActiveSection] = useState<SettingsSectionId>("data");
  const [stagedImport, setStagedImport] = useState<ParsedImportResult | null>(
    null
  );
  const [stagedFileName, setStagedFileName] = useState("");
  const [importMode, setImportMode] = useState<ImportMode>("merge");
  const [importError, setImportError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const resetTransientState = () => {
    setActiveSection("data");
    setStagedImport(null);
    setStagedFileName("");
    setImportMode("merge");
    setImportError(null);
    setFeedback(null);
    setIsDragOver(false);
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
    const json = serializeWorkspaceExport(docs, databases);
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
      `Downloaded ${filename} (${docs.length} ${docs.length === 1 ? "doc" : "docs"}, ${databases.length} ${databases.length === 1 ? "database" : "databases"}).`
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
    const result = importWorkspace(bundle, importMode);

    if (importMode === "replace") {
      const currentPath = window.location.pathname;
      if (currentPath.startsWith("/docs/db/")) {
        const currentDbId = decodeURIComponent(
          currentPath.slice("/docs/db/".length).split("/")[0] ?? ""
        );
        if (!bundle.databases.some((db) => db.id === currentDbId)) {
          router.replace("/docs");
        }
      } else if (currentPath.startsWith("/docs/")) {
        const currentDocId = decodeURIComponent(
          currentPath.slice("/docs/".length).split("/")[0] ?? ""
        );
        if (!bundle.docs.some((doc) => doc.id === currentDocId)) {
          router.replace("/docs");
        }
      }
    }

    const actionWord = importMode === "replace" ? "Replaced workspace with" : "Imported";
    setStagedImport(null);
    setStagedFileName("");
    setImportError(null);
    setFeedback(
      `${actionWord} ${result.docsCount} ${result.docsCount === 1 ? "document" : "documents"} and ${result.databasesCount} ${result.databasesCount === 1 ? "database" : "databases"}.`
    );
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

          <p className="hidden px-2 pt-3 text-xs text-muted sm:block">
            {docs.length} {docs.length === 1 ? "doc" : "docs"} ·{" "}
            {databases.length}{" "}
            {databases.length === 1 ? "database" : "databases"}
          </p>
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

            {activeSection === "trash" ? (
              <TrashSettingsPanel onFeedback={(msg) => setFeedback(msg)} />
            ) : (
              <>
                {/* Export Workspace Section */}
            <section className="rounded-lg border border-border bg-canvas/50 p-4">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-foreground">
                    Export workspace
                  </h3>
                  <p className="text-xs text-muted">
                    Download a JSON backup of all documents, nested subpages,
                    inline databases, views, and properties ({docs.length}{" "}
                    {docs.length === 1 ? "document" : "documents"},{" "}
                    {databases.length}{" "}
                    {databases.length === 1 ? "database" : "databases"}).
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
                  Upload an MAA workspace <code>.json</code> export to add
                  copied pages or restore a saved backup.
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
                          : "documents"}{" "}
                        and {stagedImport.databaseCount}{" "}
                        {stagedImport.databaseCount === 1
                          ? "database"
                          : "databases"}
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
                          Keeps existing data untouched and assigns new IDs to
                          imported pages and databases.
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
                          Replaces all current documents and databases with the
                          contents of this file.
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
