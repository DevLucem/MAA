"use client";

import Link from "next/link";
import { useId } from "react";
import { Icon } from "../../assets/icons";
import {
  type DatabasePropertySchema,
  type DatabaseSort,
  type DatabaseView,
  formatNumberProperty,
  getRowPropertyValue,
  type InlineDatabase,
  type PropertyValue,
} from "../../lib/database-types";
import type { Doc } from "../../lib/docs-utils";
import { PropertyCellInput } from "./PropertyCellInput";

interface DatabaseTableViewProps {
  db: InlineDatabase;
  view: DatabaseView;
  rows: Doc[];
  activeSort: DatabaseSort | null;
  sortAnnouncement: string;
  onToggleSort: (prop: DatabasePropertySchema) => void;
  onUpdateProperty: (
    docId: string,
    propertyId: string,
    value: PropertyValue
  ) => void;
  onCreateRow: () => void;
}

/** Semantic sticky-header sortable Table view matching Notion inline tables. */
export function DatabaseTableView({
  db,
  view,
  rows,
  activeSort,
  sortAnnouncement,
  onToggleSort,
  onUpdateProperty,
  onCreateRow,
}: DatabaseTableViewProps) {
  const captionId = useId();
  const visibleProps = view.visiblePropertyIds
    .map((id) => db.properties.find((p) => p.id === id))
    .filter((p): p is DatabasePropertySchema => Boolean(p));

  const titleProp =
    visibleProps.find((p) => p.id === db.titlePropertyId || p.type === "title") ??
    db.properties[0];
  const otherProps = visibleProps.filter((p) => p.id !== titleProp?.id);
  const headerProps = [...(titleProp ? [titleProp] : []), ...otherProps];

  const hasNumericSummary = otherProps.some((p) => p.type === "number");

  return (
    <div className="space-y-1.5">
      <div
        tabIndex={0}
        role="region"
        aria-labelledby={captionId}
        className="db-table-wrapper rounded-lg border border-border bg-canvas"
      >
        <table className="w-full min-w-[600px] text-left text-sm">
          <caption id={captionId} className="sr-only">
            {db.title} — {view.name}
          </caption>

          <thead className="bg-surface text-xs text-muted">
            <tr>
              {headerProps.map((prop) => (
                <th
                  key={prop.id}
                  scope="col"
                  aria-sort={
                    activeSort?.propertyId === prop.id
                      ? activeSort.direction
                      : undefined
                  }
                  className="border-b border-e border-border font-medium last:border-e-0"
                >
                  <button
                    type="button"
                    onClick={() => onToggleSort(prop)}
                    className="flex min-h-8 w-full items-center justify-between gap-2 px-2.5 py-1.5 text-start font-medium text-muted hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    <span className="truncate">{prop.name}</span>
                    {activeSort?.propertyId === prop.id && (
                      <span aria-hidden="true" className="text-[11px] text-primary">
                        {activeSort.direction === "ascending" ? "↑" : "↓"}
                      </span>
                    )}
                  </button>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={Math.max(1, visibleProps.length)}
                  className="px-3 py-6 text-center text-xs text-muted"
                >
                  No matching rows.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="group hover:bg-surface/60">
                  {titleProp && (
                    <th
                      scope="row"
                      className="min-w-48 border-b border-e border-border px-2.5 py-1.5 font-medium text-foreground group-hover:bg-surface/90"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 flex-1 items-center gap-1.5">
                          {row.icon ? (
                            <span aria-hidden="true" className="shrink-0">
                              {row.icon}
                            </span>
                          ) : (
                            <Icon
                              name="document"
                              className="size-3.5 shrink-0 text-muted"
                            />
                          )}
                          {db.locked ? (
                            <Link
                              href={`/docs/${row.id}`}
                              className="truncate text-sm font-medium text-foreground hover:text-primary hover:underline"
                            >
                              {row.title.trim() || "Untitled"}
                            </Link>
                          ) : (
                            <input
                              type="text"
                              aria-label={`${titleProp.name} for ${row.title || "Untitled"}`}
                              value={row.title}
                              placeholder="Untitled"
                              onChange={(e) =>
                                onUpdateProperty(
                                  row.id,
                                  titleProp.id,
                                  e.currentTarget.value
                                )
                              }
                              className="h-7 min-w-0 flex-1 rounded bg-transparent px-1 text-sm font-medium text-foreground placeholder:text-muted/50 focus:bg-canvas focus:outline-2 focus:outline-primary"
                            />
                          )}
                        </div>
                        <Link
                          href={`/docs/${row.id}`}
                          className="shrink-0 rounded border border-border bg-surface px-1.5 py-0.5 text-[11px] font-medium text-muted opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-secondary hover:text-foreground focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-primary"
                        >
                          Open
                        </Link>
                      </div>
                    </th>
                  )}

                  {otherProps.map((prop) => (
                    <td
                      key={prop.id}
                      className="max-w-64 border-b border-e border-border px-2.5 py-1.5 align-middle last:border-e-0"
                    >
                      <PropertyCellInput
                        row={row}
                        db={db}
                        prop={prop}
                        locked={db.locked}
                        compact
                        onUpdateProperty={onUpdateProperty}
                      />
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>

          <tfoot>
            <tr className="bg-surface/50 text-xs text-muted">
              {titleProp && (
                <td className="border-e border-border px-2.5 py-1.5 font-medium">
                  COUNT {rows.length}
                </td>
              )}
              {otherProps.map((prop) => {
                if (prop.type === "number" && hasNumericSummary) {
                  let sum = 0;
                  let count = 0;
                  for (const row of rows) {
                    const v = getRowPropertyValue(row, db, prop);
                    if (typeof v === "number" && Number.isFinite(v)) {
                      sum += v;
                      count += 1;
                    }
                  }
                  return (
                    <td
                      key={prop.id}
                      className="border-e border-border px-2.5 py-1.5 font-mono last:border-e-0"
                    >
                      {count > 0 ? (
                        <span>
                          <span className="text-[10px] tracking-wider uppercase">
                            SUM{" "}
                          </span>
                          <span className="font-semibold text-foreground">
                            {formatNumberProperty(sum, prop.numberFormat)}
                          </span>
                        </span>
                      ) : null}
                    </td>
                  );
                }
                return (
                  <td
                    key={prop.id}
                    className="border-e border-border px-2.5 py-1.5 last:border-e-0"
                  />
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>

      {!db.locked && (
        <button
          type="button"
          onClick={onCreateRow}
          className="inline-flex h-7 items-center gap-1 rounded px-2 text-xs font-medium text-muted transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
        >
          <Icon name="plus" className="size-3.5" />
          <span>New</span>
        </button>
      )}

      <div role="status" aria-live="polite" className="sr-only">
        {sortAnnouncement}
      </div>
    </div>
  );
}
