"use client";

import { useSyncExternalStore } from "react";

export const UI_PREFS_STORAGE_KEY = "maa-ui-prefs-v1";

export type UiTodoRange = "day" | "week" | "month";
export type UiTodoLayout = "list" | "board";
export type UiAgentWidgetMode = "closed" | "floating" | "sidebar";

export interface UiPrefs {
  desktopSidebarOpen?: boolean;
  docsSectionExpanded?: boolean;
  docsCollapsedIds?: string[];
  docsExpandedDbIds?: string[];
  financeSectionExpanded?: boolean;
  financeCollapsedIds?: string[];
  todosSectionExpanded?: boolean;
  todosCollapsedIds?: string[];
  todosActiveTab?: UiTodoRange;
  todosLayoutsByTab?: Record<UiTodoRange, UiTodoLayout>;
  agentActiveSessionId?: string;
  agentWidgetMode?: UiAgentWidgetMode;
  recentRoutes?: string[];
}

const EMPTY_UI_PREFS: UiPrefs = Object.freeze({});

const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined = undefined;
let cachedParsed: UiPrefs = EMPTY_UI_PREFS;

function sanitizeStringArray(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return Array.from(
    new Set(raw.filter((item): item is string => typeof item === "string" && item.length > 0))
  );
}

function normalizeUiPrefs(raw: unknown): UiPrefs {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return EMPTY_UI_PREFS;
  }
  const obj = raw as Record<string, unknown>;
  const prefs: UiPrefs = {};

  if (typeof obj.desktopSidebarOpen === "boolean") {
    prefs.desktopSidebarOpen = obj.desktopSidebarOpen;
  }
  if (typeof obj.docsSectionExpanded === "boolean") {
    prefs.docsSectionExpanded = obj.docsSectionExpanded;
  }
  const docsCollapsed = sanitizeStringArray(obj.docsCollapsedIds);
  if (docsCollapsed) prefs.docsCollapsedIds = docsCollapsed;

  const docsExpandedDbs = sanitizeStringArray(obj.docsExpandedDbIds);
  if (docsExpandedDbs) prefs.docsExpandedDbIds = docsExpandedDbs;

  if (typeof obj.financeSectionExpanded === "boolean") {
    prefs.financeSectionExpanded = obj.financeSectionExpanded;
  }
  const finCollapsed = sanitizeStringArray(obj.financeCollapsedIds);
  if (finCollapsed) prefs.financeCollapsedIds = finCollapsed;

  if (typeof obj.todosSectionExpanded === "boolean") {
    prefs.todosSectionExpanded = obj.todosSectionExpanded;
  }
  const todosCollapsed = sanitizeStringArray(obj.todosCollapsedIds);
  if (todosCollapsed) prefs.todosCollapsedIds = todosCollapsed;

  if (
    obj.todosActiveTab === "day" ||
    obj.todosActiveTab === "week" ||
    obj.todosActiveTab === "month"
  ) {
    prefs.todosActiveTab = obj.todosActiveTab;
  }

  if (
    obj.todosLayoutsByTab &&
    typeof obj.todosLayoutsByTab === "object" &&
    !Array.isArray(obj.todosLayoutsByTab)
  ) {
    const rawLayouts = obj.todosLayoutsByTab as Record<string, unknown>;
    const validLayout = (val: unknown, fallback: UiTodoLayout): UiTodoLayout =>
      val === "list" || val === "board" ? val : fallback;
    prefs.todosLayoutsByTab = {
      day: validLayout(rawLayouts.day, "list"),
      week: validLayout(rawLayouts.week, "board"),
      month: validLayout(rawLayouts.month, "board"),
    };
  }

  if (typeof obj.agentActiveSessionId === "string" && obj.agentActiveSessionId) {
    prefs.agentActiveSessionId = obj.agentActiveSessionId;
  }
  if (
    obj.agentWidgetMode === "closed" ||
    obj.agentWidgetMode === "floating" ||
    obj.agentWidgetMode === "sidebar"
  ) {
    prefs.agentWidgetMode = obj.agentWidgetMode;
  }

  const recent = sanitizeStringArray(obj.recentRoutes);
  if (recent) prefs.recentRoutes = recent.slice(0, 10);

  return prefs;
}

function getClientSnapshot(): UiPrefs {
  if (typeof window === "undefined") return EMPTY_UI_PREFS;
  try {
    const raw = localStorage.getItem(UI_PREFS_STORAGE_KEY);
    if (raw === cachedRaw) {
      return cachedParsed;
    }
    cachedRaw = raw;
    if (!raw) {
      cachedParsed = EMPTY_UI_PREFS;
      return cachedParsed;
    }
    cachedParsed = normalizeUiPrefs(JSON.parse(raw));
    return cachedParsed;
  } catch {
    return EMPTY_UI_PREFS;
  }
}

function getServerSnapshot(): UiPrefs {
  return EMPTY_UI_PREFS;
}

function emitChange() {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (typeof window === "undefined") {
    return () => {
      listeners.delete(listener);
    };
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === UI_PREFS_STORAGE_KEY || event.key === null) {
      cachedRaw = undefined;
      listener();
    }
  };
  window.addEventListener("storage", handleStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", handleStorage);
  };
}

/** Subscribes to browser-only UI preferences persisted in `localStorage`. */
export function useUiPrefs(): UiPrefs {
  return useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
}

/** Updates browser-only UI preferences in `localStorage` without touching server workspace state. */
export function updateUiPrefs(
  updater: Partial<UiPrefs> | ((prev: UiPrefs) => UiPrefs)
): void {
  if (typeof window === "undefined") return;
  const prev = getClientSnapshot();
  const rawNext =
    typeof updater === "function" ? updater(prev) : { ...prev, ...updater };
  const normalized = normalizeUiPrefs(rawNext);
  const serialized = JSON.stringify(normalized);
  if (serialized === JSON.stringify(prev)) return;

  try {
    localStorage.setItem(UI_PREFS_STORAGE_KEY, serialized);
    cachedRaw = serialized;
    cachedParsed = normalized;
    emitChange();
  } catch {
    // Ignore storage quota or private-browsing errors
  }
}

/** Records a visited route in localStorage for recent-tabs UI state. */
export function recordRecentRoute(pathname: string): void {
  if (!pathname || pathname.startsWith("/data") || pathname.startsWith("/api")) {
    return;
  }
  updateUiPrefs((prev) => {
    const existing = prev.recentRoutes ?? [];
    if (existing[0] === pathname) return prev;
    const next = [pathname, ...existing.filter((p) => p !== pathname)].slice(
      0,
      10
    );
    return { ...prev, recentRoutes: next };
  });
}
