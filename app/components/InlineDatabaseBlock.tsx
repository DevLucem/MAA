"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Icon, type IconName } from "../assets/icons";
import {
  type DatabaseFilter,
  type DatabasePropertySchema,
  type DatabaseSort,
  type DatabaseView,
  type DatabaseViewType,
  filterAndSortDatabaseRows,
  type InlineDatabase,
  type PropertyValue,
} from "../lib/database-types";
import { useDocs } from "../lib/docs-store";
import { createId } from "../lib/docs-utils";
import { useDismissible } from "../lib/use-dismissible";
import { DatabaseBoardView } from "./database/DatabaseBoardView";
import { DatabaseCalendarView } from "./database/DatabaseCalendarView";
import { DatabaseGalleryView } from "./database/DatabaseGalleryView";
import { DatabaseTableView } from "./database/DatabaseTableView";
import { DatabaseTimelineView } from "./database/DatabaseTimelineView";

export const DATABASE_VIEW_ICONS: Record<DatabaseViewType, IconName> = {
  table: "table",
  board: "board",
  timeline: "timeline",
  gallery: "gallery",
  calendar: "calendar",
};

const VIEW_TYPE_LABELS: Array<{ type: DatabaseViewType; label: string }> = [
  { type: "table", label: "Table" },
  { type: "board", label: "Board" },
  { type: "timeline", label: "Timeline" },
  { type: "gallery", label: "Gallery" },
  { type: "calendar", label: "Calendar" },
];

interface InlineDatabaseBlockProps {
  databaseId: string;
  fullPage?: boolean;
  controlledViewId?: string;
  onSelectView?: (viewId: string) => void;
}

/** Notion-style Inline Database block with view tabs, filters, sorting, search, and multi-view rendering. */
export function InlineDatabaseBlock({
  databaseId,
  fullPage = false,
  controlledViewId,
  onSelectView,
}: InlineDatabaseBlockProps) {
  const router = useRouter();
  const baseId = useId();
  const {
    getDatabase,
    getDatabaseRows,
    updateDatabase,
    createDatabaseRow,
    updateDocProperty,
  } = useDocs();

  const db: InlineDatabase | undefined = getDatabase(databaseId);
  const allRows = getDatabaseRows(databaseId);

  const [activeViewId, setActiveViewId] = useState<string>(
    db?.views[0]?.id ?? ""
  );
  const [filterOpen, setFilterOpen] = useState(false);
  const [disabledFilterIds, setDisabledFilterIds] = useState<Set<string>>(
    () => new Set()
  );
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [addViewOpen, setAddViewOpen] = useState(false);
  const [viewMenuTargetId, setViewMenuTargetId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [runtimeSort, setRuntimeSort] = useState<DatabaseSort | null>(null);
  const [sortAnnouncement, setSortAnnouncement] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);

  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const tabListRef = useRef<HTMLDivElement>(null);
  const sortRef = useRef<HTMLDivElement>(null);
  const addViewRef = useRef<HTMLDivElement>(null);
  const viewMenuRef = useRef<HTMLDivElement>(null);

  useDismissible(sortMenuOpen, [sortRef], () => setSortMenuOpen(false));
  useDismissible(addViewOpen, [addViewRef], () => setAddViewOpen(false));
  useDismissible(Boolean(viewMenuTargetId), [viewMenuRef, tabListRef], () =>
    setViewMenuTargetId(null)
  );

  useEffect(() => {
    if (!isFullscreen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (addViewOpen || sortMenuOpen || viewMenuTargetId || searchOpen) return;
      e.preventDefault();
      setIsFullscreen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen, addViewOpen, sortMenuOpen, viewMenuTargetId, searchOpen]);

  const selectedViewId = controlledViewId ?? activeViewId;

  const activeView: DatabaseView | undefined = useMemo(() => {
    if (!db) return undefined;
    return db.views.find((v) => v.id === selectedViewId) ?? db.views[0];
  }, [db, selectedViewId]);

  const viewMenuTarget = useMemo(
    () =>
      viewMenuTargetId
        ? db?.views.find((v) => v.id === viewMenuTargetId) ?? null
        : null,
    [db, viewMenuTargetId]
  );

  const effectiveView: DatabaseView | undefined = useMemo(() => {
    if (!activeView) return undefined;
    const activeFilters = (activeView.filters ?? []).filter(
      (f) => !disabledFilterIds.has(f.id)
    );
    return { ...activeView, filters: activeFilters };
  }, [activeView, disabledFilterIds]);

  const visibleRows = useMemo(() => {
    if (!db || !effectiveView) return [];
    return filterAndSortDatabaseRows(
      allRows,
      db,
      effectiveView,
      searchQuery,
      runtimeSort
    );
  }, [allRows, db, effectiveView, runtimeSort, searchQuery]);

  if (!db || !activeView || !effectiveView) {
    return (
      <div className="my-4 rounded-lg border border-border bg-surface p-4 text-xs text-muted">
        Database not found
      </div>
    );
  }

  const effectiveSort = runtimeSort ?? activeView.sorts?.[0] ?? null;

  const selectView = (viewId: string) => {
    setActiveViewId(viewId);
    setRuntimeSort(null);
    onSelectView?.(viewId);
  };

  const handleToggleSort = (prop: DatabasePropertySchema) => {
    const nextDir: "ascending" | "descending" =
      effectiveSort?.propertyId === prop.id &&
      effectiveSort.direction === "ascending"
        ? "descending"
        : "ascending";
    const nextSort: DatabaseSort = { propertyId: prop.id, direction: nextDir };
    setRuntimeSort(nextSort);
    setSortAnnouncement(
      `Sorted ${db.title} by ${prop.name}, ${nextDir}, ${visibleRows.length} rows`
    );
  };

  const handleAddView = (type: DatabaseViewType) => {
    const label =
      VIEW_TYPE_LABELS.find((v) => v.type === type)?.label ?? "View";
    const selectProp = db.properties.find(
      (p) => p.type === "select" || p.type === "multi_select"
    );
    const dateProp = db.properties.find((p) => p.type === "date");

    const newView: DatabaseView = {
      id: `view-${createId()}`,
      name: label,
      type,
      visiblePropertyIds: db.properties.slice(0, 4).map((p) => p.id),
      ...(type === "board" && selectProp
        ? { groupByPropertyId: selectProp.id }
        : {}),
      ...(type === "timeline" && dateProp
        ? { timelineByPropertyId: dateProp.id, showTable: true }
        : {}),
      ...(type === "calendar" && dateProp
        ? { calendarByPropertyId: dateProp.id }
        : {}),
      ...(type === "gallery"
        ? { cardSize: "medium", cardCover: "page_content" }
        : {}),
    };
    updateDatabase(db.id, { views: [...db.views, newView] });
    selectView(newView.id);
    setAddViewOpen(false);
    setViewMenuTargetId(null);
  };

  const openViewMenu = (view: DatabaseView) => {
    setAddViewOpen(false);
    setSortMenuOpen(false);
    setRenameDraft(view.name);
    setViewMenuTargetId((curr) => (curr === view.id ? null : view.id));
  };

  const handleRenameView = (viewId: string) => {
    const trimmed = renameDraft.trim();
    if (!trimmed || db.locked) return;
    updateDatabase(db.id, {
      views: db.views.map((v) =>
        v.id === viewId ? { ...v, name: trimmed } : v
      ),
    });
    setViewMenuTargetId(null);
  };

  const handleDuplicateView = (view: DatabaseView) => {
    if (db.locked) return;
    const cloned: DatabaseView = {
      ...view,
      id: `view-${createId()}`,
      name: `${view.name} (Copy)`,
      visiblePropertyIds: [...view.visiblePropertyIds],
      ...(view.filters ? { filters: view.filters.map((f) => ({ ...f })) } : {}),
      ...(view.sorts ? { sorts: view.sorts.map((s) => ({ ...s })) } : {}),
    };
    const idx = db.views.findIndex((v) => v.id === view.id);
    const nextViews = [...db.views];
    if (idx === -1) {
      nextViews.push(cloned);
    } else {
      nextViews.splice(idx + 1, 0, cloned);
    }
    updateDatabase(db.id, { views: nextViews });
    selectView(cloned.id);
    setViewMenuTargetId(null);
  };

  const handleDeleteView = (viewId: string) => {
    if (db.locked || db.views.length <= 1) return;
    const idx = db.views.findIndex((v) => v.id === viewId);
    if (idx === -1) return;
    const remaining = db.views.filter((v) => v.id !== viewId);
    updateDatabase(db.id, { views: remaining });
    setViewMenuTargetId(null);
    if (activeView.id === viewId) {
      const nextView =
        remaining[Math.min(idx, remaining.length - 1)] ?? remaining[0];
      if (nextView) {
        selectView(nextView.id);
      }
    }
  };

  const handleCreateRowAndOpen = (
    initialProps?: Record<string, PropertyValue>,
    navigateOnCreate = false
  ) => {
    const created = createDatabaseRow(db.id, initialProps);
    if (created && navigateOnCreate) {
      router.push(`/docs/${created.id}`);
    }
  };

  const handleToggleViewFilterOption = (filter: DatabaseFilter) => {
    setDisabledFilterIds((prev) => {
      const next = new Set(prev);
      if (next.has(filter.id)) {
        next.delete(filter.id);
      } else {
        next.add(filter.id);
      }
      return next;
    });
  };

  const handleAddQuickFilter = (propId: string, optionName: string) => {
    const newFilter: DatabaseFilter = {
      id: `f-${createId()}`,
      propertyId: propId,
      operator: "is",
      values: [optionName],
    };
    updateDatabase(db.id, {
      views: db.views.map((v) =>
        v.id === activeView.id
          ? { ...v, filters: [...(v.filters ?? []), newFilter] }
          : v
      ),
    });
  };

  const activeFilterCount = effectiveView.filters?.length ?? 0;
  const totalViewFilters = activeView.filters?.length ?? 0;

  const dbPageHref = `/docs/db/${encodeURIComponent(db.id)}`;

  const content = (
    <section
      aria-label={`${db.title} database`}
      className={fullPage || isFullscreen ? "space-y-3" : "space-y-2.5"}
    >
      {/* Database Title & Layout Controls (inline embeds or fullscreen overlay) */}
      {(!fullPage || isFullscreen) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            {db.icon ? (
              <span aria-hidden="true" className="text-xl leading-none">
                {db.icon}
              </span>
            ) : (
              <Icon name="database" className="size-5 shrink-0 text-muted" />
            )}

            {db.locked ? (
              <h3 className="text-base font-semibold text-foreground">
                <Link
                  href={dbPageHref}
                  className="rounded hover:underline focus-visible:outline-2 focus-visible:outline-primary"
                >
                  {db.title}
                </Link>
              </h3>
            ) : (
              <input
                type="text"
                aria-label="Database title"
                value={db.title}
                onChange={(e) =>
                  updateDatabase(db.id, { title: e.currentTarget.value })
                }
                className="min-w-28 rounded bg-transparent px-1 text-base font-semibold text-foreground hover:bg-surface focus:bg-surface focus:outline-2 focus:outline-primary"
              />
            )}

            {db.locked && (
              <Icon
                name="lock"
                className="size-3.5 text-muted"
                label="Database locked"
              />
            )}

            {db.description && (
              <span className="hidden text-xs text-muted sm:inline">
                — {db.description}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            {!fullPage && (
              <button
                type="button"
                aria-label={
                  db.fullWidth
                    ? "Switch database to page width"
                    : "Expand database to full width"
                }
                aria-pressed={Boolean(db.fullWidth)}
                title={db.fullWidth ? "Default width" : "Full width"}
                onClick={() =>
                  updateDatabase(db.id, { fullWidth: !db.fullWidth })
                }
                className={`inline-flex h-7 items-center gap-1 rounded px-2 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
                  db.fullWidth
                    ? "bg-secondary font-medium text-foreground"
                    : "text-muted hover:bg-secondary hover:text-foreground"
                }`}
              >
                <Icon name="full-width" className="size-3.5" />
                <span className="hidden sm:inline">Full width</span>
              </button>
            )}

            <button
              type="button"
              aria-label={
                isFullscreen
                  ? "Exit fullscreen"
                  : "Expand database to fullscreen"
              }
              aria-pressed={isFullscreen}
              title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              onClick={() => setIsFullscreen((prev) => !prev)}
              className={`inline-flex h-7 items-center gap-1 rounded px-2 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
                isFullscreen
                  ? "bg-secondary font-medium text-foreground"
                  : "text-muted hover:bg-secondary hover:text-foreground"
              }`}
            >
              <Icon
                name={isFullscreen ? "minimize" : "maximize"}
                className="size-3.5"
              />
              <span className="hidden sm:inline">
                {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              </span>
            </button>

            {!fullPage && !isFullscreen && (
              <Link
                href={dbPageHref}
                aria-label={`Open ${db.title} as full page`}
                title="Open as full page"
                className="inline-flex size-7 items-center justify-center rounded text-muted transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
              >
                <Icon name="external-link" className="size-3.5" />
              </Link>
            )}

            <button
              type="button"
              aria-label={db.locked ? "Unlock database" : "Lock database"}
              onClick={() => updateDatabase(db.id, { locked: !db.locked })}
              className="inline-flex h-7 items-center gap-1 rounded px-2 text-xs text-muted hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
            >
              <Icon name="lock" className="size-3" />
              <span>{db.locked ? "Locked" : "Lock"}</span>
            </button>
          </div>
        </div>
      )}

      {/* View Switcher Tabs + Database Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-1.5">
        <div className="flex min-w-0 items-center gap-1">
          <div
            ref={tabListRef}
            role="tablist"
            aria-label={`${db.title} views`}
            {...({ focusgroup: "tablist nomemory" } as Record<string, string>)}
            className="db-tabs-list gap-1"
          >
            {db.views.map((view, index) => {
              const isSelected = view.id === activeView.id;
              const tabId = `${baseId}-tab-${view.id}`;
              return (
                <button
                  key={view.id}
                  ref={(el) => {
                    tabRefs.current[index] = el;
                  }}
                  id={tabId}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  tabIndex={isSelected ? 0 : -1}
                  onClick={() => {
                    if (isSelected) {
                      openViewMenu(view);
                    } else {
                      setViewMenuTargetId(null);
                      selectView(view.id);
                    }
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setAddViewOpen(false);
                    setSortMenuOpen(false);
                    setRenameDraft(view.name);
                    setViewMenuTargetId(view.id);
                  }}
                  onKeyDown={(e) => {
                    if ("focusGroup" in HTMLElement.prototype) return;
                    const count = db.views.length;
                    let nextIdx: number | null = null;
                    if (e.key === "ArrowRight") nextIdx = (index + 1) % count;
                    else if (e.key === "ArrowLeft")
                      nextIdx = (index - 1 + count) % count;
                    else if (e.key === "Home") nextIdx = 0;
                    else if (e.key === "End") nextIdx = count - 1;
                    if (nextIdx !== null) {
                      e.preventDefault();
                      const nextView = db.views[nextIdx];
                      setViewMenuTargetId(null);
                      selectView(nextView.id);
                      tabRefs.current[nextIdx]?.focus();
                    }
                  }}
                  className="db-tab inline-flex items-center gap-1.5 rounded-t px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-secondary/70 hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <Icon
                    name={DATABASE_VIEW_ICONS[view.type]}
                    className="size-3.5"
                  />
                  <span>{view.name}</span>
                </button>
              );
            })}
          </div>

          {/* Active View options menu + Add View button outside tablist per tabs accessibility rule */}
          <div ref={viewMenuRef} className="relative shrink-0">
            <button
              type="button"
              aria-label={`View options for ${activeView.name}`}
              aria-haspopup="menu"
              aria-expanded={Boolean(viewMenuTarget)}
              onClick={() => openViewMenu(activeView)}
              className="inline-flex size-7 items-center justify-center rounded text-muted hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
            >
              <Icon name="ellipsis" className="size-3.5" />
            </button>

            {viewMenuTarget && (
              <div
                role="menu"
                aria-label={`${viewMenuTarget.name} view options`}
                className="absolute start-0 top-full z-30 mt-1 w-60 rounded-lg border border-border bg-canvas p-1.5 shadow-lg"
              >
                {db.locked ? (
                  <div className="space-y-1.5 p-1">
                    <p className="text-xs text-muted">
                      Database is locked. Unlock to edit or remove views.
                    </p>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        updateDatabase(db.id, { locked: false });
                        setViewMenuTargetId(null);
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-xs font-medium text-foreground hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      <Icon name="lock" className="size-3.5 text-muted" />
                      <span>Unlock database</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleRenameView(viewMenuTarget.id);
                      }}
                      className="flex items-center gap-1 px-1 py-0.5"
                    >
                      <input
                        type="text"
                        aria-label="View name"
                        value={renameDraft}
                        onChange={(e) => setRenameDraft(e.currentTarget.value)}
                        className="h-7 min-w-0 flex-1 rounded border border-border bg-surface px-2 text-xs text-foreground focus:border-primary focus:outline-none"
                      />
                      <button
                        type="submit"
                        className="primary inline-flex h-7 shrink-0 items-center rounded px-2 text-xs font-medium"
                      >
                        Save
                      </button>
                    </form>

                    <hr className="my-1 border-border" />

                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => handleDuplicateView(viewMenuTarget)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-xs text-foreground hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none"
                    >
                      <Icon name="copy" className="size-3.5 text-muted" />
                      <span>Duplicate view</span>
                    </button>

                    <hr className="my-1 border-border" />

                    <button
                      type="button"
                      role="menuitem"
                      disabled={db.views.length <= 1}
                      title={
                        db.views.length <= 1
                          ? "Keep at least one view"
                          : `Remove ${viewMenuTarget.name}`
                      }
                      onClick={() => handleDeleteView(viewMenuTarget.id)}
                      className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-start text-xs text-danger hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <span className="inline-flex items-center gap-2">
                        <Icon name="trash" className="size-3.5" />
                        <span>Delete view</span>
                      </span>
                      {db.views.length <= 1 && (
                        <span className="text-[10px] text-muted">
                          Last view
                        </span>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div ref={addViewRef} className="relative shrink-0">
            <button
              type="button"
              aria-label="Add database view"
              aria-expanded={addViewOpen}
              onClick={() => setAddViewOpen((prev) => !prev)}
              className="inline-flex size-7 items-center justify-center rounded text-muted hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
            >
              <Icon name="plus" className="size-3.5" />
            </button>

            {addViewOpen && (
              <div
                role="menu"
                aria-label="New view layout"
                className="absolute start-0 top-full z-30 mt-1 w-40 rounded-lg border border-border bg-canvas p-1 shadow-lg"
              >
                {VIEW_TYPE_LABELS.map((item) => (
                  <button
                    key={item.type}
                    type="button"
                    role="menuitem"
                    onClick={() => handleAddView(item.type)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-xs text-foreground hover:bg-secondary"
                  >
                    <Icon
                      name={DATABASE_VIEW_ICONS[item.type]}
                      className="size-3.5 text-muted"
                    />
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Toolbar Controls: Filter, Sort, Search, Table toggle, New */}
        <div className="flex flex-wrap items-center gap-1">
          {activeView.type === "timeline" && (
            <button
              type="button"
              aria-pressed={activeView.showTable !== false}
              onClick={() => {
                updateDatabase(db.id, {
                  views: db.views.map((v) =>
                    v.id === activeView.id
                      ? { ...v, showTable: v.showTable === false }
                      : v
                  ),
                });
              }}
              className={`inline-flex h-7 items-center gap-1 rounded px-2 text-xs transition-colors ${
                activeView.showTable !== false
                  ? "bg-secondary font-medium text-foreground"
                  : "text-muted hover:bg-secondary hover:text-foreground"
              }`}
            >
              <Icon name="table" className="size-3.5" />
              <span>Table</span>
            </button>
          )}

          <button
            type="button"
            aria-expanded={filterOpen}
            onClick={() => setFilterOpen((prev) => !prev)}
            className={`inline-flex h-7 items-center gap-1 rounded px-2 text-xs transition-colors ${
              activeFilterCount > 0 || filterOpen
                ? "bg-secondary font-medium text-primary"
                : "text-muted hover:bg-secondary hover:text-foreground"
            }`}
          >
            <Icon name="filter" className="size-3.5" />
            <span>Filter</span>
            {activeFilterCount > 0 && (
              <span className="rounded-full bg-primary/15 px-1.5 text-[10px] text-primary">
                {activeFilterCount}
              </span>
            )}
          </button>

          <div ref={sortRef} className="relative">
            <button
              type="button"
              aria-expanded={sortMenuOpen}
              onClick={() => setSortMenuOpen((prev) => !prev)}
              className={`inline-flex h-7 items-center gap-1 rounded px-2 text-xs transition-colors ${
                effectiveSort
                  ? "bg-secondary font-medium text-primary"
                  : "text-muted hover:bg-secondary hover:text-foreground"
              }`}
            >
              <Icon name="sort" className="size-3.5" />
              <span>Sort</span>
            </button>

            {sortMenuOpen && (
              <div
                role="menu"
                aria-label="Sort database rows"
                className="absolute end-0 top-full z-30 mt-1 w-48 rounded-lg border border-border bg-canvas p-1 shadow-lg"
              >
                {db.properties.map((prop) => {
                  const isActive = effectiveSort?.propertyId === prop.id;
                  return (
                    <button
                      key={prop.id}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        handleToggleSort(prop);
                        setSortMenuOpen(false);
                      }}
                      className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-start text-xs hover:bg-secondary"
                    >
                      <span>{prop.name}</span>
                      {isActive && (
                        <span className="text-primary">
                          {effectiveSort.direction === "ascending" ? "↑" : "↓"}
                        </span>
                      )}
                    </button>
                  );
                })}
                {runtimeSort && (
                  <>
                    <hr className="my-1 border-border" />
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setRuntimeSort(null);
                        setSortMenuOpen(false);
                      }}
                      className="flex w-full items-center rounded-md px-2 py-1.5 text-start text-xs text-muted hover:bg-secondary hover:text-foreground"
                    >
                      Clear sort
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {searchOpen ? (
            <div className="flex items-center gap-1 rounded border border-border bg-canvas px-1.5">
              <Icon name="search" className="size-3.5 text-muted" />
              <input
                type="search"
                autoFocus
                aria-label={`Search ${db.title}`}
                placeholder="Type to search…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setSearchQuery("");
                    setSearchOpen(false);
                  }
                }}
                className="h-6 w-28 bg-transparent text-xs text-foreground placeholder:text-muted/60 focus:outline-none sm:w-36"
              />
              {searchQuery && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setSearchQuery("")}
                  className="text-xs text-muted hover:text-foreground"
                >
                  ✕
                </button>
              )}
            </div>
          ) : (
            <button
              type="button"
              aria-label={`Search ${db.title}`}
              onClick={() => setSearchOpen(true)}
              className="inline-flex size-7 items-center justify-center rounded text-muted hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
            >
              <Icon name="search" className="size-3.5" />
            </button>
          )}

          {!db.locked && (
            <button
              type="button"
              onClick={() => handleCreateRowAndOpen(undefined, false)}
              className="primary inline-flex h-7 items-center gap-1 rounded px-2.5 text-xs font-medium"
            >
              <span>New</span>
            </button>
          )}
        </div>
      </div>

      {/* Expandable Filter Chips Bar */}
      {filterOpen && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-2 text-xs">
          <span className="font-medium text-muted">Filters:</span>
          {totalViewFilters === 0 && (
            <span className="text-muted">None applied.</span>
          )}
          {(activeView.filters ?? []).map((f) => {
            const prop = db.properties.find((p) => p.id === f.propertyId);
            const isEnabled = !disabledFilterIds.has(f.id);
            return (
              <button
                key={f.id}
                type="button"
                aria-pressed={isEnabled}
                onClick={() => handleToggleViewFilterOption(f)}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors ${
                  isEnabled
                    ? "border-primary/40 bg-primary/10 font-medium text-primary"
                    : "border-border bg-canvas text-muted line-through"
                }`}
              >
                <span>
                  {prop?.name ?? f.propertyId}: {(f.values ?? []).join(", ") || f.operator}
                </span>
                <span aria-hidden="true">{isEnabled ? "✓" : "off"}</span>
              </button>
            );
          })}

          {db.properties
            .filter((p) => p.type === "select" && (p.options?.length ?? 0) > 0)
            .slice(0, 1)
            .map((selectProp) => (
              <select
                key={selectProp.id}
                aria-label={`Add ${selectProp.name} filter`}
                value=""
                onChange={(e) => {
                  if (e.currentTarget.value) {
                    handleAddQuickFilter(selectProp.id, e.currentTarget.value);
                  }
                }}
                className="rounded border border-border bg-canvas px-1.5 py-0.5 text-xs text-muted"
              >
                <option value="">+ Filter by {selectProp.name}</option>
                {(selectProp.options ?? []).map((opt) => (
                  <option key={opt.id} value={opt.name}>
                    {opt.name}
                  </option>
                ))}
              </select>
            ))}
        </div>
      )}

      {/* Active Tab Panel */}
      <div
        role="tabpanel"
        aria-labelledby={`${baseId}-tab-${activeView.id}`}
      >
        {activeView.type === "table" && (
          <DatabaseTableView
            db={db}
            view={effectiveView}
            rows={visibleRows}
            activeSort={effectiveSort}
            sortAnnouncement={sortAnnouncement}
            onToggleSort={handleToggleSort}
            onUpdateProperty={updateDocProperty}
            onCreateRow={() => handleCreateRowAndOpen(undefined, false)}
          />
        )}

        {activeView.type === "board" && (
          <DatabaseBoardView
            db={db}
            view={effectiveView}
            rows={visibleRows}
            onUpdateProperty={updateDocProperty}
            onCreateRow={(initialProps) =>
              handleCreateRowAndOpen(initialProps, false)
            }
          />
        )}

        {activeView.type === "timeline" && (
          <DatabaseTimelineView
            key={`${db.id}:${activeView.id}`}
            db={db}
            view={effectiveView}
            rows={visibleRows}
            onCreateRow={() => handleCreateRowAndOpen(undefined, false)}
          />
        )}

        {activeView.type === "gallery" && (
          <DatabaseGalleryView
            db={db}
            view={effectiveView}
            rows={visibleRows}
            onCreateRow={() => handleCreateRowAndOpen(undefined, false)}
          />
        )}

        {activeView.type === "calendar" && (
          <DatabaseCalendarView
            db={db}
            view={effectiveView}
            rows={visibleRows}
            onCreateRow={(initialProps) =>
              handleCreateRowAndOpen(initialProps, false)
            }
          />
        )}
      </div>
    </section>
  );

  if (isFullscreen) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${db.title} fullscreen`}
        className="db-fullscreen fixed inset-0 z-50 overflow-y-auto bg-canvas px-6 py-6 sm:px-10"
      >
        {content}
      </div>
    );
  }

  return content;
}
