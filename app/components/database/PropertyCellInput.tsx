"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Icon } from "../../assets/icons";
import {
  type DatabasePropertySchema,
  formatNumberProperty,
  formatPlainDateShort,
  getRowPropertyValue,
  type InlineDatabase,
  isDatePropertyValue,
  NOTION_COLOR_PILL_CLASS,
  type PropertyValue,
} from "../../lib/database-types";
import { useDocs } from "../../lib/docs-store";
import { type Doc, isSafeHref } from "../../lib/docs-utils";
import { useDismissible } from "../../lib/use-dismissible";

interface PropertyCellInputProps {
  row: Doc;
  db: InlineDatabase;
  prop: DatabasePropertySchema;
  locked?: boolean;
  compact?: boolean;
  onUpdateProperty: (
    docId: string,
    propertyId: string,
    value: PropertyValue
  ) => void;
}

/** Shared Notion property viewer & inline editor used in Table cells and Page Properties. */
export function PropertyCellInput({
  row,
  db,
  prop,
  locked = false,
  compact = false,
  onUpdateProperty,
}: PropertyCellInputProps) {
  const { getDoc } = useDocs();
  const [multiOpen, setMultiOpen] = useState(false);
  const multiRef = useRef<HTMLDivElement>(null);

  const val = getRowPropertyValue(row, db, prop);
  const isDisabled = locked || Boolean(prop.readOnly);

  useDismissible(multiOpen, [multiRef], () => setMultiOpen(false));

  if (prop.type === "checkbox") {
    return (
      <label className="inline-flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={Boolean(val)}
          disabled={isDisabled}
          aria-label={prop.name}
          onChange={(e) =>
            onUpdateProperty(row.id, prop.id, e.currentTarget.checked)
          }
          className="size-4 rounded border-border"
        />
      </label>
    );
  }

  if (prop.type === "select") {
    const selectedName = typeof val === "string" ? val : "";
    const option = prop.options?.find((o) => o.name === selectedName);
    const pillClass = option
      ? NOTION_COLOR_PILL_CLASS[option.color]
      : "bg-secondary text-muted";

    if (isDisabled) {
      return selectedName ? (
        <span
          className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${pillClass}`}
        >
          {selectedName}
        </span>
      ) : (
        <span className="text-xs text-muted/60">Empty</span>
      );
    }

    return (
      <select
        aria-label={prop.name}
        value={selectedName}
        onChange={(e) =>
          onUpdateProperty(row.id, prop.id, e.currentTarget.value || null)
        }
        className={`max-w-full rounded px-2 py-0.5 text-xs font-medium focus-visible:outline-2 focus-visible:outline-primary ${
          selectedName ? pillClass : "bg-transparent text-muted hover:bg-secondary"
        }`}
      >
        <option value="">Empty</option>
        {(prop.options ?? []).map((opt) => (
          <option key={opt.id} value={opt.name}>
            {opt.name}
          </option>
        ))}
      </select>
    );
  }

  if (prop.type === "multi_select") {
    const selected = Array.isArray(val) ? val : [];
    const options = prop.options ?? [];

    const toggleOption = (optName: string) => {
      const next = selected.includes(optName)
        ? selected.filter((s) => s !== optName)
        : [...selected, optName];
      onUpdateProperty(row.id, prop.id, next);
    };

    return (
      <div ref={multiRef} className="relative flex flex-wrap items-center gap-1">
        {selected.length === 0 ? (
          <span className="text-xs text-muted/60">Empty</span>
        ) : (
          selected.map((name) => {
            const opt = options.find((o) => o.name === name);
            const pillClass = opt
              ? NOTION_COLOR_PILL_CLASS[opt.color]
              : NOTION_COLOR_PILL_CLASS.default;
            return (
              <span
                key={name}
                className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${pillClass}`}
              >
                {name}
              </span>
            );
          })
        )}

        {!isDisabled && options.length > 0 && (
          <button
            type="button"
            aria-label={`Edit ${prop.name}`}
            aria-expanded={multiOpen}
            onClick={() => setMultiOpen((prev) => !prev)}
            className="inline-flex size-5 items-center justify-center rounded text-xs text-muted hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
          >
            +
          </button>
        )}

        {multiOpen && (
          <div
            role="dialog"
            aria-label={`Select ${prop.name}`}
            className="absolute start-0 top-full z-30 mt-1 w-48 rounded-lg border border-border bg-canvas p-1.5 shadow-lg"
          >
            <div className="flex max-h-48 flex-col gap-0.5 overflow-y-auto">
              {options.map((opt) => {
                const active = selected.includes(opt.name);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => toggleOption(opt.name)}
                    className="flex w-full items-center justify-between rounded px-2 py-1 text-start text-xs hover:bg-secondary"
                  >
                    <span
                      className={`inline-flex rounded px-1.5 py-0.5 font-medium ${NOTION_COLOR_PILL_CLASS[opt.color]}`}
                    >
                      {opt.name}
                    </span>
                    {active && <span className="text-primary">✓</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (prop.type === "date") {
    const dateVal = isDatePropertyValue(val) ? val : null;
    if (isDisabled) {
      return dateVal ? (
        <span className="text-xs text-foreground">
          {formatPlainDateShort(dateVal)}
        </span>
      ) : (
        <span className="text-xs text-muted/60">Empty</span>
      );
    }

    return (
      <div className="flex flex-wrap items-center gap-1">
        <input
          type="date"
          aria-label={`${prop.name} start date`}
          value={dateVal?.start ?? ""}
          onChange={(e) => {
            const start = e.currentTarget.value;
            if (!start) {
              onUpdateProperty(row.id, prop.id, null);
            } else {
              onUpdateProperty(row.id, prop.id, {
                start,
                ...(dateVal?.end ? { end: dateVal.end } : {}),
              });
            }
          }}
          className="h-7 rounded border border-transparent bg-transparent px-1 text-xs text-foreground hover:border-border focus:border-primary focus:outline-none"
        />
        {!compact && dateVal?.start && (
          <>
            <span className="text-xs text-muted">→</span>
            <input
              type="date"
              aria-label={`${prop.name} end date`}
              value={dateVal.end ?? ""}
              onChange={(e) => {
                const end = e.currentTarget.value;
                onUpdateProperty(row.id, prop.id, {
                  start: dateVal.start,
                  ...(end ? { end } : {}),
                });
              }}
              className="h-7 rounded border border-transparent bg-transparent px-1 text-xs text-foreground hover:border-border focus:border-primary focus:outline-none"
            />
          </>
        )}
      </div>
    );
  }

  if (prop.type === "created_time") {
    return typeof val === "string" && val ? (
      <span className="text-xs text-muted">{formatPlainDateShort(val)}</span>
    ) : (
      <span className="text-xs text-muted/60">—</span>
    );
  }

  if (prop.type === "formula") {
    return typeof val === "number" ? (
      <span className="font-mono text-xs font-medium text-foreground">
        {formatNumberProperty(val, prop.numberFormat)}
      </span>
    ) : (
      <span className="text-xs text-muted/60">—</span>
    );
  }

  if (prop.type === "relation") {
    const relIds = Array.isArray(val) ? val : [];
    if (relIds.length === 0) {
      return <span className="text-xs text-muted/60">Empty</span>;
    }
    return (
      <div className="flex flex-wrap items-center gap-1">
        {relIds.map((targetId) => {
          const target = getDoc(targetId);
          return (
            <Link
              key={targetId}
              href={`/docs/${targetId}`}
              className="inline-flex items-center gap-1 rounded border border-border bg-surface px-1.5 py-0.5 text-xs font-medium text-foreground hover:bg-secondary"
            >
              {target?.icon ? (
                <span aria-hidden="true">{target.icon}</span>
              ) : (
                <Icon name="document" className="size-3 text-muted" />
              )}
              <span className="truncate">{target?.title || "Page"}</span>
            </Link>
          );
        })}
      </div>
    );
  }

  if (prop.type === "file") {
    const urls = Array.isArray(val) ? val : [];
    if (urls.length === 0) {
      return <span className="text-xs text-muted/60">Empty</span>;
    }
    return (
      <div className="flex flex-wrap items-center gap-1">
        {urls.map((item, idx) =>
          isSafeHref(item) ? (
            <a
              key={`${item}-${idx}`}
              href={item}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-xs text-primary hover:underline"
            >
              <span>Attachment {idx + 1}</span>
              <Icon name="external-link" className="size-3" />
            </a>
          ) : (
            <span key={`${item}-${idx}`} className="text-xs text-muted">
              {item}
            </span>
          )
        )}
      </div>
    );
  }

  if (prop.type === "number") {
    const numVal = typeof val === "number" ? val : null;
    if (isDisabled) {
      return numVal !== null ? (
        <span className="font-mono text-xs text-foreground">
          {formatNumberProperty(numVal, prop.numberFormat)}
        </span>
      ) : (
        <span className="text-xs text-muted/60">Empty</span>
      );
    }
    return (
      <input
        type="number"
        inputMode="decimal"
        aria-label={prop.name}
        value={numVal ?? ""}
        placeholder="—"
        onChange={(e) => {
          const raw = e.currentTarget.value;
          if (raw === "") {
            onUpdateProperty(row.id, prop.id, null);
          } else {
            const parsed = Number(raw);
            if (!Number.isNaN(parsed)) {
              onUpdateProperty(row.id, prop.id, parsed);
            }
          }
        }}
        className="h-7 w-24 rounded border border-transparent bg-transparent px-1 font-mono text-xs text-foreground placeholder:text-muted/50 hover:border-border focus:border-primary focus:outline-none"
      />
    );
  }

  if (prop.type === "url") {
    const strVal = typeof val === "string" ? val : "";
    return (
      <div className="flex min-w-0 items-center gap-1">
        {!isDisabled ? (
          <input
            type="url"
            aria-label={prop.name}
            value={strVal}
            placeholder="Empty"
            onChange={(e) =>
              onUpdateProperty(row.id, prop.id, e.currentTarget.value)
            }
            className="h-7 min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 text-xs text-foreground placeholder:text-muted/50 hover:border-border focus:border-primary focus:outline-none"
          />
        ) : (
          <span className="truncate text-xs text-muted">
            {strVal || "Empty"}
          </span>
        )}
        {isSafeHref(strVal) && (
          <a
            href={strVal}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${prop.name}`}
            className="inline-flex size-6 shrink-0 items-center justify-center rounded text-primary hover:bg-secondary"
          >
            <Icon name="external-link" className="size-3.5" />
          </a>
        )}
      </div>
    );
  }

  const strVal = typeof val === "string" ? val : "";
  if (isDisabled) {
    return (
      <span className="text-xs text-foreground">
        {strVal || <span className="text-muted/60">Empty</span>}
      </span>
    );
  }

  return (
    <input
      type="text"
      aria-label={prop.name}
      value={strVal}
      placeholder="Empty"
      onChange={(e) =>
        onUpdateProperty(row.id, prop.id, e.currentTarget.value)
      }
      className="h-7 w-full min-w-20 rounded border border-transparent bg-transparent px-1 text-xs text-foreground placeholder:text-muted/50 hover:border-border focus:border-primary focus:outline-none"
    />
  );
}
