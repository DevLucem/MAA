"use client";

import { type ReactNode, useId, useRef, useState } from "react";
import { Icon } from "../../assets/icons";
import type { TodoSortBy, TodoViewLayout } from "../../lib/todos-utils";
import { useDismissible } from "../../lib/use-dismissible";

interface TodoViewHeaderProps {
  title: string;
  subtitle?: string;
  count?: number;
  layout?: TodoViewLayout;
  onLayoutChange?: (layout: TodoViewLayout) => void;
  sortBy?: TodoSortBy;
  onSortChange?: (sortBy: TodoSortBy) => void;
  showCompleted?: boolean;
  onShowCompletedChange?: (show: boolean) => void;
  rightExtras?: ReactNode;
}

const SORT_OPTIONS: ReadonlyArray<{ id: TodoSortBy; label: string }> = [
  { id: "manual", label: "Manual" },
  { id: "due", label: "Due date" },
  { id: "priority", label: "Priority" },
  { id: "title", label: "Name (A–Z)" },
  { id: "created", label: "Recently added" },
];

/** Standalone View Options popover button (List/Board layout, Sort, Show completed). */
export function TodoViewOptionsButton({
  layout,
  onLayoutChange,
  sortBy,
  onSortChange,
  showCompleted,
  onShowCompletedChange,
  compact = false,
}: Pick<
  TodoViewHeaderProps,
  | "layout"
  | "onLayoutChange"
  | "sortBy"
  | "onSortChange"
  | "showCompleted"
  | "onShowCompletedChange"
> & { compact?: boolean }) {
  const [optionsOpen, setOptionsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const sortSelectId = useId();

  useDismissible(optionsOpen, [popoverRef], () => setOptionsOpen(false));

  if (!onLayoutChange && !onSortChange && !onShowCompletedChange) {
    return null;
  }

  return (
    <div ref={popoverRef} className="relative">
      <button
        type="button"
        aria-expanded={optionsOpen}
        onClick={() => setOptionsOpen((prev) => !prev)}
        className={`inline-flex items-center gap-1.5 rounded-md border border-border text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
          compact ? "h-7 px-2" : "h-8 px-2.5"
        } ${
          optionsOpen
            ? "bg-secondary text-foreground"
            : "text-muted hover:bg-secondary hover:text-foreground"
        }`}
      >
        <Icon name="filter" className="size-3.5" />
        <span>View</span>
      </button>

      {optionsOpen && (
        <div
          role="dialog"
          aria-label="View options"
          className="absolute end-0 top-full z-30 mt-1.5 w-60 space-y-3 rounded-xl border border-border bg-canvas p-3 shadow-xl"
        >
          {layout && onLayoutChange && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold tracking-wider text-muted uppercase">
                Layout
              </p>
              <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-surface p-1">
                <button
                  type="button"
                  aria-pressed={layout === "list"}
                  onClick={() => onLayoutChange("list")}
                  className={`inline-flex h-7 items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors ${
                    layout === "list"
                      ? "bg-canvas text-foreground shadow-2xs"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  <Icon name="list" className="size-3.5" />
                  <span>List</span>
                </button>
                <button
                  type="button"
                  aria-pressed={layout === "board"}
                  onClick={() => onLayoutChange("board")}
                  className={`inline-flex h-7 items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors ${
                    layout === "board"
                      ? "bg-canvas text-foreground shadow-2xs"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  <Icon name="board" className="size-3.5" />
                  <span>Board</span>
                </button>
              </div>
            </div>
          )}

          {sortBy && onSortChange && (
            <div className="space-y-1.5">
              <label
                htmlFor={sortSelectId}
                className="block text-[11px] font-semibold tracking-wider text-muted uppercase"
              >
                Sort by
              </label>
              <select
                id={sortSelectId}
                value={sortBy}
                onChange={(e) => onSortChange(e.target.value as TodoSortBy)}
                className="h-8 w-full rounded-md border border-border bg-surface px-2 text-xs text-foreground focus-visible:outline-2 focus-visible:outline-primary"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {onShowCompletedChange && (
            <label className="flex cursor-pointer items-center justify-between gap-2 pt-0.5 text-xs text-foreground">
              <span>Completed tasks</span>
              <input
                type="checkbox"
                checked={Boolean(showCompleted)}
                onChange={(e) => onShowCompletedChange(e.currentTarget.checked)}
                className="size-4 rounded border-border accent-primary"
              />
            </label>
          )}
        </div>
      )}
    </div>
  );
}

/** Consistent Todoist-style view header with count subtitle and View Options popover. */
export function TodoViewHeader({
  title,
  subtitle,
  count,
  layout,
  onLayoutChange,
  sortBy,
  onSortChange,
  showCompleted,
  onShowCompletedChange,
  rightExtras,
}: TodoViewHeaderProps) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {title}
        </h1>
        {(subtitle || count !== undefined) && (
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
            {count !== undefined && (
              <span className="inline-flex items-center gap-1">
                <Icon name="check-circle" className="size-3.5" />
                <span className="tabular-nums">
                  {count} {count === 1 ? "task" : "tasks"}
                </span>
              </span>
            )}
            {count !== undefined && subtitle && (
              <span aria-hidden="true">·</span>
            )}
            {subtitle && <span>{subtitle}</span>}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {rightExtras}

        <TodoViewOptionsButton
          layout={layout}
          onLayoutChange={onLayoutChange}
          sortBy={sortBy}
          onSortChange={onSortChange}
          showCompleted={showCompleted}
          onShowCompletedChange={onShowCompletedChange}
        />
      </div>
    </header>
  );
}
