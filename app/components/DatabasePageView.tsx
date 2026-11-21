"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { Icon } from "../assets/icons";
import { useDocs } from "../lib/docs-store";
import { useDismissible } from "../lib/use-dismissible";
import { IconPickerPopover } from "./IconPickerPopover";
import { InlineDatabaseBlock } from "./InlineDatabaseBlock";

/** Full-page Notion-style database view backed by an InlineDatabase record. */
export function DatabasePageView() {
  const params = useParams<{ dbId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { getDatabase, getDoc, updateDatabase, hydrated } = useDocs();

  const dbId = params.dbId ? decodeURIComponent(params.dbId) : "";
  const db = getDatabase(dbId);
  const parentDoc = db ? getDoc(db.parentDocId) : undefined;

  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const iconContainerRef = useRef<HTMLDivElement>(null);
  const iconBtnRef = useRef<HTMLButtonElement>(null);
  const addIconBtnRef = useRef<HTMLButtonElement>(null);

  useDismissible(
    iconPickerOpen,
    [iconContainerRef, addIconBtnRef],
    (reason) => {
      setIconPickerOpen(false);
      if (reason === "escape") {
        iconBtnRef.current?.focus();
      }
    }
  );

  if (!hydrated && !db) {
    return <div className="min-h-full" aria-busy="true" />;
  }

  if (!db) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <div className="rounded-xl border border-border bg-surface p-8">
          <Icon name="database" className="mx-auto size-10 text-muted" />
          <h1 className="mt-4 text-xl font-semibold text-foreground">
            Database not found
          </h1>
          <p className="mt-2 text-sm text-muted">
            This database may have been removed or its page was deleted.
          </p>
          <Link
            href="/docs"
            className="primary mt-6 inline-flex h-9 items-center rounded-md px-4 text-sm font-medium"
          >
            Back to Docs
          </Link>
        </div>
      </div>
    );
  }

  const requestedViewId = searchParams.get("view") ?? undefined;
  const controlledViewId =
    requestedViewId && db.views.some((v) => v.id === requestedViewId)
      ? requestedViewId
      : db.views[0]?.id;

  const handleSelectView = (viewId: string) => {
    router.replace(
      `/docs/db/${encodeURIComponent(db.id)}?view=${encodeURIComponent(viewId)}`,
      { scroll: false }
    );
  };

  return (
    <div className="mx-auto w-full max-w-none px-6 pt-8 pb-24 sm:px-12">
      {/* Compact utility row above title */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {!db.icon && !db.locked && (
            <button
              ref={addIconBtnRef}
              type="button"
              aria-expanded={iconPickerOpen}
              onClick={() => setIconPickerOpen((prev) => !prev)}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
            >
              <Icon name="smile" className="size-3.5" />
              <span>Add icon</span>
            </button>
          )}

          {parentDoc && (
            <Link
              href={`/docs/${parentDoc.id}`}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
            >
              {parentDoc.icon ? (
                <span aria-hidden="true" className="text-xs leading-none">
                  {parentDoc.icon}
                </span>
              ) : (
                <Icon name="document" className="size-3.5 shrink-0" />
              )}
              <span>Inside {parentDoc.title.trim() || "Untitled"}</span>
            </Link>
          )}
        </div>

        <button
          type="button"
          aria-label={db.locked ? "Unlock database" : "Lock database"}
          aria-pressed={Boolean(db.locked)}
          onClick={() => updateDatabase(db.id, { locked: !db.locked })}
          className="inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-xs font-medium text-muted transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
        >
          <Icon name="lock" className="size-3.5" />
          <span>{db.locked ? "Locked" : "Lock"}</span>
        </button>
      </div>

      {/* Database Icon + Large Title Header */}
      <div ref={iconContainerRef} className="relative">
        <div className="flex items-center gap-3">
          {db.locked ? (
            <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-xl text-4xl leading-none">
              {db.icon ? (
                <span aria-hidden="true">{db.icon}</span>
              ) : (
                <Icon name="database" className="size-8 text-muted" />
              )}
            </span>
          ) : (
            <button
              ref={iconBtnRef}
              type="button"
              aria-label={db.icon ? "Change database icon" : "Add database icon"}
              aria-expanded={iconPickerOpen}
              onClick={() => setIconPickerOpen((prev) => !prev)}
              className="inline-flex size-12 shrink-0 items-center justify-center rounded-xl text-4xl leading-none transition-colors hover:bg-secondary/80 focus-visible:outline-2 focus-visible:outline-primary"
            >
              {db.icon ? (
                <span aria-hidden="true">{db.icon}</span>
              ) : (
                <Icon name="database" className="size-8 text-muted" />
              )}
            </button>
          )}

          {db.locked ? (
            <h1 className="min-w-0 flex-1 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              {db.title}
            </h1>
          ) : (
            <input
              type="text"
              aria-label="Database title"
              value={db.title}
              onChange={(e) =>
                updateDatabase(db.id, { title: e.currentTarget.value })
              }
              className="min-w-0 flex-1 rounded-md bg-transparent px-1.5 py-0.5 text-3xl font-bold tracking-tight text-foreground hover:bg-surface focus:bg-surface focus:outline-2 focus:outline-primary sm:text-4xl"
            />
          )}
        </div>

        {iconPickerOpen && !db.locked && (
          <IconPickerPopover
            selectedIcon={db.icon}
            label="Choose database icon"
            className="mt-2"
            onSelect={(emoji) => {
              updateDatabase(db.id, { icon: emoji });
              setIconPickerOpen(false);
            }}
          />
        )}
      </div>

      {/* Description line below title */}
      {db.locked ? (
        db.description ? (
          <p className="mt-2 text-sm text-muted">{db.description}</p>
        ) : null
      ) : (
        <input
          type="text"
          aria-label="Database description"
          placeholder="Add a description..."
          value={db.description ?? ""}
          onChange={(e) =>
            updateDatabase(db.id, { description: e.currentTarget.value })
          }
          className="mt-2 w-full max-w-2xl rounded bg-transparent px-1.5 py-0.5 text-sm text-muted placeholder:text-muted/60 hover:bg-surface focus:bg-surface focus:text-foreground focus:outline-2 focus:outline-primary"
        />
      )}

      {/* Full-page database views & controls */}
      <div className="mt-6">
        <InlineDatabaseBlock
          databaseId={db.id}
          fullPage
          controlledViewId={controlledViewId}
          onSelectView={handleSelectView}
        />
      </div>
    </div>
  );
}
