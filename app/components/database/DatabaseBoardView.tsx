"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "../../assets/icons";
import {
  type DatabaseView,
  formatNumberProperty,
  formatPlainDateShort,
  getRowPropertyValue,
  type InlineDatabase,
  isDatePropertyValue,
  NOTION_COLOR_PILL_CLASS,
  type NotionColor,
  type PropertyValue,
} from "../../lib/database-types";
import type { Doc } from "../../lib/docs-utils";

interface DatabaseBoardViewProps {
  db: InlineDatabase;
  view: DatabaseView;
  rows: Doc[];
  onUpdateProperty: (
    docId: string,
    propertyId: string,
    value: PropertyValue
  ) => void;
  onCreateRow: (initialProps?: Record<string, PropertyValue>) => void;
}

interface BoardGroup {
  key: string;
  label: string;
  color: NotionColor;
  value: string | null;
  rows: Doc[];
}

/** Kanban board view grouped by select/multi-select options with drag-and-drop & select fallback. */
export function DatabaseBoardView({
  db,
  view,
  rows,
  onUpdateProperty,
  onCreateRow,
}: DatabaseBoardViewProps) {
  const [draggedDocId, setDraggedDocId] = useState<string | null>(null);
  const [dropGroupKey, setDropGroupKey] = useState<string | null>(null);

  const groupProp =
    db.properties.find((p) => p.id === view.groupByPropertyId) ??
    db.properties.find(
      (p) => p.type === "select" || p.type === "multi_select"
    );

  if (!groupProp) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6 text-center text-xs text-muted">
        Add a Select property to group rows on a Board.
      </div>
    );
  }

  const options = groupProp.options ?? [];
  const groups: BoardGroup[] = options.map((opt) => ({
    key: opt.id,
    label: opt.name,
    color: opt.color,
    value: opt.name,
    rows: [],
  }));

  const ungrouped: BoardGroup = {
    key: "__ungrouped",
    label: `No ${groupProp.name}`,
    color: "gray",
    value: null,
    rows: [],
  };

  for (const row of rows) {
    const val = getRowPropertyValue(row, db, groupProp);
    if (Array.isArray(val)) {
      if (val.length === 0) {
        ungrouped.rows.push(row);
      } else {
        let matched = false;
        for (const item of val) {
          const target = groups.find((g) => g.label === item);
          if (target) {
            target.rows.push(row);
            matched = true;
          }
        }
        if (!matched) ungrouped.rows.push(row);
      }
    } else {
      const target =
        typeof val === "string" ? groups.find((g) => g.label === val) : undefined;
      if (target) {
        target.rows.push(row);
      } else {
        ungrouped.rows.push(row);
      }
    }
  }

  const allGroups = ungrouped.rows.length > 0 ? [ungrouped, ...groups] : groups;
  const visibleGroups = view.hideEmptyGroups
    ? allGroups.filter((g) => g.rows.length > 0)
    : allGroups;

  const displayGroups = visibleGroups.length > 0 ? visibleGroups : groups;
  const cardProps = view.visiblePropertyIds
    .filter((id) => id !== db.titlePropertyId && id !== groupProp.id)
    .map((id) => db.properties.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  const moveRowToGroup = (docId: string, groupValue: string | null) => {
    if (groupProp.type === "multi_select") {
      onUpdateProperty(docId, groupProp.id, groupValue ? [groupValue] : []);
    } else {
      onUpdateProperty(docId, groupProp.id, groupValue);
    }
  };

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {displayGroups.map((group) => {
        const isDropTarget = dropGroupKey === group.key;
        return (
          <section
            key={group.key}
            aria-label={`${group.label} (${group.rows.length})`}
            onDragOver={(e) => {
              if (db.locked || !draggedDocId) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setDropGroupKey(group.key);
            }}
            onDragLeave={() => {
              setDropGroupKey((curr) => (curr === group.key ? null : curr));
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (!db.locked && draggedDocId) {
                moveRowToGroup(draggedDocId, group.value);
              }
              setDraggedDocId(null);
              setDropGroupKey(null);
            }}
            className={`flex w-64 shrink-0 flex-col rounded-lg border border-border bg-surface p-2 transition-colors ${
              isDropTarget ? "ring-2 ring-primary" : ""
            }`}
          >
            <header className="mb-2 flex items-center justify-between gap-2 px-1">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${NOTION_COLOR_PILL_CLASS[group.color]}`}
                >
                  {group.label}
                </span>
                <span className="text-xs text-muted">{group.rows.length}</span>
              </div>
            </header>

            <div className="flex flex-1 flex-col gap-2">
              {group.rows.map((row) => (
                <article
                  key={row.id}
                  draggable={!db.locked}
                  onDragStart={(e) => {
                    setDraggedDocId(row.id);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", row.id);
                  }}
                  onDragEnd={() => {
                    setDraggedDocId(null);
                    setDropGroupKey(null);
                  }}
                  className={`rounded-md border border-border bg-canvas p-2.5 shadow-xs transition-colors hover:border-muted ${
                    draggedDocId === row.id ? "opacity-50" : ""
                  }`}
                >
                  <Link
                    href={`/docs/${row.id}`}
                    className="flex items-start gap-1.5 text-sm font-medium text-foreground hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    {row.icon ? (
                      <span aria-hidden="true" className="shrink-0">
                        {row.icon}
                      </span>
                    ) : (
                      <Icon
                        name="document"
                        className="mt-0.5 size-3.5 shrink-0 text-muted"
                      />
                    )}
                    <span className="break-words">
                      {row.title.trim() || "Untitled"}
                    </span>
                  </Link>

                  {cardProps.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {cardProps.map((prop) => {
                        const val = getRowPropertyValue(row, db, prop);
                        if (
                          val === null ||
                          val === "" ||
                          (Array.isArray(val) && val.length === 0)
                        ) {
                          return null;
                        }
                        if (isDatePropertyValue(val)) {
                          return (
                            <p key={prop.id} className="text-xs text-muted">
                              {formatPlainDateShort(val)}
                            </p>
                          );
                        }
                        if (typeof val === "number") {
                          return (
                            <p
                              key={prop.id}
                              className="font-mono text-xs text-muted"
                            >
                              {prop.name}:{" "}
                              {formatNumberProperty(val, prop.numberFormat)}
                            </p>
                          );
                        }
                        return (
                          <p key={prop.id} className="truncate text-xs text-muted">
                            {Array.isArray(val) ? val.join(", ") : String(val)}
                          </p>
                        );
                      })}
                    </div>
                  )}

                  {!db.locked && options.length > 0 && (
                    <div className="mt-2 border-t border-border/60 pt-1.5">
                      <select
                        aria-label={`Move ${row.title || "Untitled"} column`}
                        value={group.value ?? ""}
                        onChange={(e) =>
                          moveRowToGroup(row.id, e.currentTarget.value || null)
                        }
                        className="w-full rounded bg-surface px-1.5 py-0.5 text-[11px] text-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                      >
                        <option value="">No {groupProp.name}</option>
                        {options.map((opt) => (
                          <option key={opt.id} value={opt.name}>
                            {opt.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </article>
              ))}
            </div>

            {!db.locked && (
              <button
                type="button"
                onClick={() =>
                  onCreateRow(
                    group.value
                      ? {
                          [groupProp.id]:
                            groupProp.type === "multi_select"
                              ? [group.value]
                              : group.value,
                        }
                      : undefined
                  )
                }
                className="mt-2 inline-flex h-7 items-center gap-1 rounded px-2 text-xs font-medium text-muted transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
              >
                <Icon name="plus" className="size-3.5" />
                <span>New</span>
              </button>
            )}
          </section>
        );
      })}
    </div>
  );
}
