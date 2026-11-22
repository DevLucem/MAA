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
import { DATABASES_STORAGE_KEY, STORAGE_KEY } from "./docs-storage";
import { FINANCE_STORAGE_KEY } from "./finance-utils";
import { TODOS_STORAGE_KEY } from "./todos-utils";
import {
  createEmptyWorkspaceState,
  isWorkspaceStateEmpty,
  normalizeServerWorkspaceState,
  type ServerWorkspaceState,
} from "./workspace-store-types";

const LEGACY_HERMES_CONFIG_KEY = "maa-hermes-config-v1";
const LEGACY_HERMES_SESSIONS_KEY = "maa-hermes-sessions-v1";
export const SERVER_MIGRATED_FLAG_KEY = "maa-server-migrated-v1";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export interface WorkspaceServerContextValue {
  loaded: boolean;
  loadRevision: number;
  initialState: ServerWorkspaceState;
  canSave: boolean;
  needsInitialUpload: boolean;
  loadError: string | null;
  saveStatus: SaveStatus;
  saveError: string | null;
  lastSavedAt: string | null;
  markInitialUploadDone: () => void;
  reportSaveStatus: (
    status: SaveStatus,
    opts?: { updatedAt?: string; error?: string | null }
  ) => void;
  reloadFromServer: () => Promise<boolean>;
}

interface FetchedServerWorkspaceResult {
  initialState: ServerWorkspaceState;
  shouldUploadLegacy: boolean;
  updatedAt: string;
}

async function fetchAndPrepareServerState(): Promise<FetchedServerWorkspaceResult> {
  const response = await fetch("/data/state", { cache: "no-store" });
  if (!response.ok) {
    let errText = `Server returned HTTP ${response.status}`;
    try {
      const errJson = (await response.json()) as { error?: unknown };
      if (typeof errJson.error === "string" && errJson.error) {
        errText = errJson.error;
      }
    } catch {
      // Ignore invalid error body
    }
    throw new Error(errText);
  }

  const rawJson: unknown = await response.json();
  const serverState = normalizeServerWorkspaceState(rawJson);
  let nextState = serverState;
  let shouldUploadLegacy = false;

  let alreadyMigrated = false;
  try {
    alreadyMigrated =
      localStorage.getItem(SERVER_MIGRATED_FLAG_KEY) === "1";
  } catch {
    alreadyMigrated = false;
  }

  if (isWorkspaceStateEmpty(serverState) && !alreadyMigrated) {
    const legacy = readLegacyLocalStorageWorkspace();
    if (legacy && !isWorkspaceStateEmpty(legacy)) {
      nextState = legacy;
      shouldUploadLegacy = true;
    }
  } else if (!isWorkspaceStateEmpty(serverState) && !alreadyMigrated) {
    try {
      localStorage.setItem(SERVER_MIGRATED_FLAG_KEY, "1");
    } catch {
      // Ignore storage access errors
    }
  }

  return {
    initialState: nextState,
    shouldUploadLegacy,
    updatedAt: serverState.updatedAt,
  };
}

const WorkspaceServerContext =
  createContext<WorkspaceServerContextValue | null>(null);

function safeParseJson(raw: string | null): unknown {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** Reads legacy per-browser `localStorage` workspace keys to migrate once onto `data/store.json`. */
export function readLegacyLocalStorageWorkspace(): ServerWorkspaceState | null {
  if (typeof window === "undefined") return null;

  try {
    const rawDocs = safeParseJson(localStorage.getItem(STORAGE_KEY));
    const rawDbs = safeParseJson(localStorage.getItem(DATABASES_STORAGE_KEY));
    const rawFinance = safeParseJson(localStorage.getItem(FINANCE_STORAGE_KEY));
    const rawTodos = safeParseJson(localStorage.getItem(TODOS_STORAGE_KEY));
    const rawAgentConfig = safeParseJson(
      localStorage.getItem(LEGACY_HERMES_CONFIG_KEY)
    );
    const rawAgentSessions = safeParseJson(
      localStorage.getItem(LEGACY_HERMES_SESSIONS_KEY)
    );

    const hasAnyKey =
      rawDocs !== undefined ||
      rawDbs !== undefined ||
      rawFinance !== undefined ||
      rawTodos !== undefined ||
      rawAgentConfig !== undefined ||
      rawAgentSessions !== undefined;

    if (!hasAnyKey) return null;

    return normalizeServerWorkspaceState({
      docs: rawDocs,
      databases: rawDbs,
      finance: rawFinance,
      todos: rawTodos,
      agent: {
        config: rawAgentConfig,
        sessions: rawAgentSessions,
      },
    });
  } catch {
    return null;
  }
}

/** Loads shared workspace state from `GET /data/state` and exposes server save/reload status. */
export function WorkspaceServerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [loaded, setLoaded] = useState(false);
  const [loadRevision, setLoadRevision] = useState(0);
  const [initialState, setInitialState] = useState<ServerWorkspaceState>(() =>
    createEmptyWorkspaceState()
  );
  const [canSave, setCanSave] = useState(false);
  const [needsInitialUpload, setNeedsInitialUpload] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  const requestSeqRef = useRef(0);
  const loadRevisionRef = useRef(0);

  const applyServerSuccess = useCallback(
    (result: FetchedServerWorkspaceResult) => {
      const nextRev = loadRevisionRef.current + 1;
      loadRevisionRef.current = nextRev;

      setInitialState(result.initialState);
      setNeedsInitialUpload(result.shouldUploadLegacy);
      setCanSave(true);
      setLoadError(null);
      setSaveError(null);
      setSaveStatus("saved");
      setLastSavedAt(result.updatedAt);
      setLoadRevision(nextRev);
      setLoaded(true);
    },
    []
  );

  const applyServerFailure = useCallback((error: unknown) => {
    const message =
      error instanceof Error ? error.message : "Failed to load server store";

    // Block autosaving so a failed load never overwrites data/store.json.
    setCanSave(false);
    setNeedsInitialUpload(false);
    setLoadError(message);

    if (loadRevisionRef.current === 0) {
      const legacyFallback = readLegacyLocalStorageWorkspace();
      const nextRev = 1;
      loadRevisionRef.current = nextRev;
      setInitialState(legacyFallback ?? createEmptyWorkspaceState());
      setLoadRevision(nextRev);
    }
    setLoaded(true);
  }, []);

  const reloadFromServer = useCallback(async (): Promise<boolean> => {
    const seq = ++requestSeqRef.current;
    try {
      const result = await fetchAndPrepareServerState();
      if (seq !== requestSeqRef.current) return false;
      applyServerSuccess(result);
      return true;
    } catch (error) {
      if (seq !== requestSeqRef.current) return false;
      applyServerFailure(error);
      return false;
    }
  }, [applyServerFailure, applyServerSuccess]);

  useEffect(() => {
    const seq = ++requestSeqRef.current;
    void fetchAndPrepareServerState().then(
      (result) => {
        if (seq !== requestSeqRef.current) return;
        applyServerSuccess(result);
      },
      (error) => {
        if (seq !== requestSeqRef.current) return;
        applyServerFailure(error);
      }
    );
  }, [applyServerFailure, applyServerSuccess]);

  const markInitialUploadDone = useCallback(() => {
    setNeedsInitialUpload(false);
    try {
      localStorage.setItem(SERVER_MIGRATED_FLAG_KEY, "1");
    } catch {
      // Ignore storage access errors
    }
  }, []);

  const reportSaveStatus = useCallback(
    (
      status: SaveStatus,
      opts?: { updatedAt?: string; error?: string | null }
    ) => {
      setSaveStatus(status);
      if (opts && "error" in opts) {
        setSaveError(opts.error ?? null);
      } else if (status === "saved" || status === "saving") {
        setSaveError(null);
      }
      if (opts?.updatedAt) {
        setLastSavedAt(opts.updatedAt);
      }
    },
    []
  );

  const value = useMemo<WorkspaceServerContextValue>(
    () => ({
      loaded,
      loadRevision,
      initialState,
      canSave,
      needsInitialUpload,
      loadError,
      saveStatus,
      saveError,
      lastSavedAt,
      markInitialUploadDone,
      reportSaveStatus,
      reloadFromServer,
    }),
    [
      canSave,
      initialState,
      lastSavedAt,
      loadError,
      loadRevision,
      loaded,
      markInitialUploadDone,
      needsInitialUpload,
      reloadFromServer,
      reportSaveStatus,
      saveError,
      saveStatus,
    ]
  );

  return (
    <WorkspaceServerContext.Provider value={value}>
      {children}
    </WorkspaceServerContext.Provider>
  );
}

/** Returns shared server store state, migration flags, and reload/save status callbacks. */
export function useWorkspaceServer(): WorkspaceServerContextValue {
  const ctx = useContext(WorkspaceServerContext);
  if (!ctx) {
    throw new Error(
      "useWorkspaceServer must be used within a WorkspaceServerProvider"
    );
  }
  return ctx;
}
