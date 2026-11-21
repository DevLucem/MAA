"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Icon } from "../assets/icons";
import type { PropertyValue } from "../lib/database-types";
import { useDocs } from "../lib/docs-store";
import { blockToText, type Doc } from "../lib/docs-utils";

interface TrashSettingsPanelProps {
  onFeedback: (message: string) => void;
}

function stringifyPropertyValue(value: PropertyValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) return value.join(" ");
  if (typeof value === "object" && "start" in value) {
    return value.end ? `${value.start} ${value.end}` : value.start;
  }
  return "";
}

function extractSearchableBodyText(doc: Doc): string {
  const blockText = doc.blocks
    .map((block) => blockToText(block))
    .filter(Boolean)
    .join(" ");
  const propsText = doc.properties
    ? Object.values(doc.properties)
        .map(stringifyPropertyValue)
        .filter(Boolean)
        .join(" ")
    : "";
  return `${blockText} ${propsText}`.replace(/\s+/g, " ").trim();
}

function buildSnippet(text: string, query: string): string {
  if (!text) return "";
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return text.length > 90 ? `${text.slice(0, 90)}…` : text;
  const matchIdx = text.toLowerCase().indexOf(trimmed);
  if (matchIdx === -1) return text.length > 90 ? `${text.slice(0, 90)}…` : text;
  const start = Math.max(0, matchIdx - 24);
  const end = Math.min(text.length, matchIdx + trimmed.length + 66);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return `${prefix}${text.slice(start, end)}${suffix}`;
}

function HighlightedMatch({ text, query }: { text: string; query: string }) {
  const trimmed = query.trim();
  if (!trimmed) return <>{text}</>;
  const lowerText = text.toLowerCase();
  const lowerQuery = trimmed.toLowerCase();
  const idx = lowerText.indexOf(lowerQuery);
  if (idx === -1) return <>{text}</>;

  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded bg-primary/20 px-0.5 text-foreground">
        {text.slice(idx, idx + trimmed.length)}
      </mark>
      {text.slice(idx + trimmed.length)}
    </>
  );
}

/** Trash management panel inside Settings with in-page search, filtered select-all, and batch recovery/deletion. */
export function TrashSettingsPanel({ onFeedback }: TrashSettingsPanelProps) {
  const searchInputId = useId();
  const selectAllId = useId();
  const {
    docs,
    trashedDocs,
    restoreDocs,
    permanentlyDeleteDocs,
  } = useDocs();

  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const selectAllRef = useRef<HTMLInputElement>(null);

  const parentTitleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of docs) map.set(d.id, d.title.trim() || "Untitled");
    for (const d of trashedDocs) map.set(d.id, d.title.trim() || "Untitled");
    return map;
  }, [docs, trashedDocs]);

  const searchableEntries = useMemo(
    () =>
      trashedDocs.map((doc) => ({
        doc,
        title: doc.title.trim() || "Untitled",
        bodyText: extractSearchableBodyText(doc),
      })),
    [trashedDocs]
  );

  const filteredEntries = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return searchableEntries;
    return searchableEntries.filter(
      (entry) =>
        entry.title.toLowerCase().includes(q) ||
        entry.bodyText.toLowerCase().includes(q)
    );
  }, [query, searchableEntries]);

  const trashedIdSet = useMemo(
    () => new Set(trashedDocs.map((doc) => doc.id)),
    [trashedDocs]
  );

  const effectiveSelectedIds = useMemo(() => {
    const next = new Set<string>();
    for (const id of selectedIds) {
      if (trashedIdSet.has(id)) next.add(id);
    }
    return next;
  }, [selectedIds, trashedIdSet]);

  const filteredIds = useMemo(
    () => filteredEntries.map((entry) => entry.doc.id),
    [filteredEntries]
  );

  const selectedFilteredCount = useMemo(
    () =>
      filteredIds.reduce(
        (count, id) => (effectiveSelectedIds.has(id) ? count + 1 : count),
        0
      ),
    [effectiveSelectedIds, filteredIds]
  );

  const allFilteredSelected =
    filteredIds.length > 0 && selectedFilteredCount === filteredIds.length;
  const someFilteredSelected =
    selectedFilteredCount > 0 && !allFilteredSelected;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someFilteredSelected;
    }
  }, [someFilteredSelected]);

  const selectedList = useMemo(
    () => Array.from(effectiveSelectedIds),
    [effectiveSelectedIds]
  );

  const handleToggleSelectAllFiltered = () => {
    setSelectedIds((prev) => {
      const next = new Set<string>();
      for (const id of prev) {
        if (trashedIdSet.has(id)) next.add(id);
      }
      if (allFilteredSelected) {
        for (const id of filteredIds) next.delete(id);
      } else {
        for (const id of filteredIds) next.add(id);
      }
      return next;
    });
  };

  const handleToggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set<string>();
      for (const existing of prev) {
        if (trashedIdSet.has(existing)) next.add(existing);
      }
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleRestoreSelected = () => {
    if (selectedList.length === 0) return;
    const { restoredDocsCount } = restoreDocs(selectedList);
    setSelectedIds(new Set());
    onFeedback(
      `Restored ${restoredDocsCount} ${restoredDocsCount === 1 ? "page" : "pages"} from Trash.`
    );
  };

  const handlePurgeSelected = () => {
    if (selectedList.length === 0) return;
    const { deletedDocsCount } = permanentlyDeleteDocs(selectedList);
    setSelectedIds(new Set());
    onFeedback(
      `Permanently deleted ${deletedDocsCount} ${deletedDocsCount === 1 ? "page" : "pages"}.`
    );
  };

  if (trashedDocs.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-canvas/50 px-6 py-12 text-center">
        <Icon name="trash" className="mx-auto size-8 text-muted/70" />
        <p className="mt-3 text-sm font-medium text-foreground">
          Trash is empty
        </p>
        <p className="mt-1 text-xs text-muted">
          Pages moved to Trash appear here so you can restore or permanently
          delete them.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Mini In-Page Search */}
      <div className="relative w-full">
        <Icon
          name="search"
          className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted"
        />
        <label htmlFor={searchInputId} className="sr-only">
          Search trash
        </label>
        <input
          id={searchInputId}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          placeholder="Search trash by title or page content…"
          className="h-9 w-full rounded-md border border-border bg-canvas ps-8 pe-3 text-xs text-foreground placeholder:text-muted focus-visible:outline-2 focus-visible:outline-primary"
        />
      </div>

      {/* Select-All Bar (scoped to filtered results) + Batch Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-canvas/50 px-3 py-2">
        <label
          htmlFor={selectAllId}
          className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-foreground select-none"
        >
          <input
            ref={selectAllRef}
            id={selectAllId}
            type="checkbox"
            checked={allFilteredSelected}
            disabled={filteredIds.length === 0}
            onChange={handleToggleSelectAllFiltered}
            className="size-4 rounded border-border accent-primary"
          />
          <span>
            {query.trim()
              ? `Select all matching (${filteredIds.length})`
              : `Select all (${filteredIds.length})`}
          </span>
        </label>

        {selectedList.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={handleRestoreSelected}
              className="primary inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-xs font-medium transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-primary"
            >
              <Icon name="restore" className="size-3.5" />
              <span>Restore selected ({selectedList.length})</span>
            </button>

            <button
              type="button"
              onClick={handlePurgeSelected}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-danger/30 bg-danger/10 px-2.5 text-xs font-medium text-danger transition-colors hover:bg-danger/20 focus-visible:outline-2 focus-visible:outline-danger"
            >
              <Icon name="trash" className="size-3.5" />
              <span>Delete permanently ({selectedList.length})</span>
            </button>
          </div>
        )}
      </div>

      {/* Trashed Pages List */}
      {filteredEntries.length === 0 ? (
        <div className="rounded-lg border border-border bg-canvas/40 px-4 py-8 text-center text-xs text-muted">
          No trashed pages match &ldquo;{query.trim()}&rdquo;.
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-canvas/50">
          {filteredEntries.map(({ doc, title, bodyText }) => {
            const checked = effectiveSelectedIds.has(doc.id);
            const snippet = buildSnippet(bodyText, query);
            const parentTitle = doc.parentId
              ? parentTitleById.get(doc.parentId)
              : undefined;
            const trashedDate = doc.trashedAt ? doc.trashedAt.slice(0, 10) : "";

            return (
              <li
                key={doc.id}
                className={`flex items-start justify-between gap-3 px-3 py-2.5 transition-colors ${
                  checked ? "bg-primary/5" : "hover:bg-secondary/40"
                }`}
              >
                <div className="flex min-w-0 flex-1 items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={checked}
                    aria-label={`Select ${title}`}
                    onChange={() => handleToggleRow(doc.id)}
                    className="mt-1 size-4 shrink-0 cursor-pointer rounded border-border accent-primary"
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {doc.icon ? (
                        <span
                          aria-hidden="true"
                          className="inline-flex size-4 shrink-0 items-center justify-center text-sm leading-none"
                        >
                          {doc.icon}
                        </span>
                      ) : (
                        <Icon
                          name="document"
                          className="size-3.5 shrink-0 text-muted"
                        />
                      )}
                      <span className="truncate text-xs font-semibold text-foreground">
                        <HighlightedMatch text={title} query={query} />
                      </span>
                    </div>

                    {snippet && (
                      <p className="mt-0.5 line-clamp-2 text-[11px] text-muted">
                        <HighlightedMatch text={snippet} query={query} />
                      </p>
                    )}

                    <p className="mt-0.5 text-[10px] text-muted">
                      {trashedDate ? `Trashed ${trashedDate}` : "In Trash"}
                      {parentTitle ? ` · Inside ${parentTitle}` : ""}
                      {doc.databaseId ? " · Database row" : ""}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    aria-label={`Restore ${title}`}
                    title="Restore page"
                    onClick={() => {
                      const { restoredDocsCount } = restoreDocs([doc.id]);
                      onFeedback(
                        `Restored "${title}" (${restoredDocsCount} ${restoredDocsCount === 1 ? "page" : "pages"}).`
                      );
                    }}
                    className="inline-flex size-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    <Icon name="restore" className="size-3.5" />
                  </button>

                  <button
                    type="button"
                    aria-label={`Delete ${title} permanently`}
                    title="Delete permanently"
                    onClick={() => {
                      const { deletedDocsCount } = permanentlyDeleteDocs([
                        doc.id,
                      ]);
                      onFeedback(
                        `Permanently deleted "${title}" (${deletedDocsCount} ${deletedDocsCount === 1 ? "page" : "pages"}).`
                      );
                    }}
                    className="inline-flex size-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-danger/15 hover:text-danger focus-visible:outline-2 focus-visible:outline-danger"
                  >
                    <Icon name="trash" className="size-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
