"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useAgent } from "../lib/agent-store";
import { useDocs } from "../lib/docs-store";
import {
  WORKSPACE_EXPORT_FORMAT,
  WORKSPACE_EXPORT_SCHEMA_VERSION,
} from "../lib/docs-transfer";
import { useFinance } from "../lib/finance-store";
import { useTodos } from "../lib/todos-store";
import { useWorkspaceServer } from "../lib/workspace-server-store";

const AUTOSAVE_DEBOUNCE_MS = 500;
const KEEPALIVE_MAX_BYTES = 55_000;

interface QueuedSave {
  json: string;
  isMigration: boolean;
  keepalive: boolean;
}

/** Watches all workspace domain stores and debounces atomic saves to `POST /data/save`. */
export function DebouncedAutoSave() {
  const {
    loaded,
    loadRevision,
    canSave,
    needsInitialUpload,
    markInitialUploadDone,
    reportSaveStatus,
  } = useWorkspaceServer();

  const { hydratedRevision: docsRev, getExportSnapshot: getDocsSnapshot } =
    useDocs();
  const { hydratedRevision: finRev, getExportSnapshot: getFinanceSnapshot } =
    useFinance();
  const { hydratedRevision: todosRev, getExportSnapshot: getTodosSnapshot } =
    useTodos();
  const {
    hydratedRevision: agentRev,
    config: agentConfig,
    sessions: agentSessions,
    isStreaming,
  } = useAgent();

  const allSyncedToRevision =
    loaded &&
    loadRevision > 0 &&
    docsRev === loadRevision &&
    finRev === loadRevision &&
    todosRev === loadRevision &&
    agentRev === loadRevision;

  const serialized = useMemo(() => {
    const docsSnap = getDocsSnapshot();
    const financeSnap = getFinanceSnapshot();
    const todosSnap = getTodosSnapshot();
    return JSON.stringify({
      format: WORKSPACE_EXPORT_FORMAT,
      schemaVersion: WORKSPACE_EXPORT_SCHEMA_VERSION,
      docs: docsSnap.docs,
      databases: docsSnap.databases,
      finance: financeSnap,
      todos: todosSnap,
      agent: {
        config: agentConfig,
        sessions: agentSessions,
      },
    });
  }, [
    agentConfig,
    agentSessions,
    getDocsSnapshot,
    getFinanceSnapshot,
    getTodosSnapshot,
  ]);

  const baselineRevisionRef = useRef(0);
  const lastSavedJsonRef = useRef<string | null>(null);
  const debounceTimerRef = useRef<number | null>(null);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const queuedSaveRef = useRef<QueuedSave | null>(null);
  const latestStateRef = useRef({
    allSyncedToRevision: false,
    canSave: false,
    isStreaming: false,
    needsInitialUpload: false,
    serialized: "",
    loadRevision: 0,
  });

  useEffect(() => {
    latestStateRef.current = {
      allSyncedToRevision,
      canSave,
      isStreaming,
      needsInitialUpload,
      serialized,
      loadRevision,
    };
  }, [
    allSyncedToRevision,
    canSave,
    isStreaming,
    loadRevision,
    needsInitialUpload,
    serialized,
  ]);

  const startOrQueueSave = useCallback(
    (json: string, isMigration: boolean, keepalive: boolean) => {
      if (inFlightRef.current) {
        queuedSaveRef.current = {
          json,
          isMigration:
            isMigration || Boolean(queuedSaveRef.current?.isMigration),
          keepalive,
        };
        return;
      }

      const run = (async () => {
        reportSaveStatus("saving");
        let currentJson: string | null = json;
        let currentMigration = isMigration;
        let currentKeepalive = keepalive;

        while (currentJson !== null) {
          try {
            const allowKeepalive =
              currentKeepalive &&
              new Blob([currentJson]).size <= KEEPALIVE_MAX_BYTES;
            const response = await fetch("/data/save", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: currentJson,
              ...(allowKeepalive ? { keepalive: true } : {}),
            });

            if (!response.ok) {
              let errText = `Save failed (HTTP ${response.status})`;
              try {
                const body = (await response.json()) as { error?: unknown };
                if (typeof body.error === "string" && body.error) {
                  errText = body.error;
                }
              } catch {
                // Ignore non-JSON error body
              }
              throw new Error(errText);
            }

            const result = (await response.json()) as { updatedAt?: string };
            lastSavedJsonRef.current = currentJson;
            if (currentMigration) {
              markInitialUploadDone();
            }

            const queued = queuedSaveRef.current;
            if (queued && queued.json !== lastSavedJsonRef.current) {
              queuedSaveRef.current = null;
              currentJson = queued.json;
              currentMigration = queued.isMigration;
              currentKeepalive = queued.keepalive;
              continue;
            }

            queuedSaveRef.current = null;
            reportSaveStatus("saved", {
              updatedAt: result.updatedAt,
              error: null,
            });
            currentJson = null;
          } catch (error) {
            queuedSaveRef.current = null;
            const message =
              error instanceof Error
                ? error.message
                : "Failed to save workspace";
            reportSaveStatus("error", { error: message });
            currentJson = null;
          }
        }
      })();

      inFlightRef.current = run;
      void run.finally(() => {
        if (inFlightRef.current === run) {
          inFlightRef.current = null;
        }
      });
    },
    [markInitialUploadDone, reportSaveStatus]
  );

  useEffect(() => {
    if (!allSyncedToRevision) return;

    if (baselineRevisionRef.current !== loadRevision) {
      baselineRevisionRef.current = loadRevision;
      if (needsInitialUpload && canSave) {
        startOrQueueSave(serialized, true, false);
      } else {
        lastSavedJsonRef.current = serialized;
      }
      return;
    }

    if (!canSave || isStreaming) return;
    if (serialized === lastSavedJsonRef.current) return;

    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = window.setTimeout(() => {
      debounceTimerRef.current = null;
      startOrQueueSave(serialized, false, false);
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [
    allSyncedToRevision,
    canSave,
    isStreaming,
    loadRevision,
    needsInitialUpload,
    serialized,
    startOrQueueSave,
  ]);

  useEffect(() => {
    const flushPendingSave = () => {
      const snap = latestStateRef.current;
      if (!snap.allSyncedToRevision || !snap.canSave) return;
      if (baselineRevisionRef.current !== snap.loadRevision) return;
      if (snap.serialized === lastSavedJsonRef.current) return;

      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      startOrQueueSave(snap.serialized, snap.needsInitialUpload, true);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushPendingSave();
      }
    };

    window.addEventListener("pagehide", flushPendingSave);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", flushPendingSave);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [startOrQueueSave]);

  return null;
}
