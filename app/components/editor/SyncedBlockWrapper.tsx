"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { Icon } from "../../assets/icons";
import { useDocs } from "../../lib/docs-store";
import { findSyncGroupOccurrences } from "../../lib/synced-blocks";
import { useDismissible } from "../../lib/use-dismissible";

interface SyncedBlockWrapperProps {
  syncGroupId: string;
  currentDocId: string;
  onCopyAndSync: () => void;
  onUnsync: () => void;
  onUnsyncAll?: () => void;
  children: React.ReactNode;
}

/** Subtle focus-only wrapper around a synced block with a floating top-right notice pill matching Notion. */
export function SyncedBlockWrapper({
  syncGroupId,
  currentDocId,
  onCopyAndSync,
  onUnsync,
  onUnsyncAll,
  children,
}: SyncedBlockWrapperProps) {
  const { docs } = useDocs();
  const [locationsOpen, setLocationsOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const locationsContainerRef = useRef<HTMLDivElement>(null);
  const moreContainerRef = useRef<HTMLDivElement>(null);

  useDismissible(locationsOpen, [locationsContainerRef], () => {
    setLocationsOpen(false);
  });

  useDismissible(moreMenuOpen, [moreContainerRef], () => {
    setMoreMenuOpen(false);
  });

  const { occurrences, uniquePages, otherPagesCount } = useMemo(() => {
    const all = findSyncGroupOccurrences(docs, syncGroupId);
    const byPage = new Map<
      string,
      { docId: string; docTitle: string; docIcon?: string; count: number }
    >();
    for (const item of all) {
      const existing = byPage.get(item.docId);
      if (existing) {
        existing.count += 1;
      } else {
        byPage.set(item.docId, {
          docId: item.docId,
          docTitle: item.docTitle,
          docIcon: item.docIcon,
          count: 1,
        });
      }
    }
    const pages = Array.from(byPage.values());
    const others = pages.filter((page) => page.docId !== currentDocId).length;
    return {
      occurrences: all,
      uniquePages: pages,
      otherPagesCount: others,
    };
  }, [currentDocId, docs, syncGroupId]);

  const badgeLabel =
    otherPagesCount === 1
      ? "Synced to 1 other page"
      : otherPagesCount > 1
        ? `Synced to ${otherPagesCount} other pages`
        : occurrences.length > 1
          ? `Synced in ${occurrences.length} places`
          : "Synced block";

  const isToolbarActive = locationsOpen || moreMenuOpen;

  return (
    <div
      data-sync-group={syncGroupId}
      data-synced-active={isToolbarActive ? "true" : undefined}
      tabIndex={-1}
      className="synced-block-shell relative -mx-2 px-2 py-0.5 outline-none"
    >
      {/* Floating top-right polite indicator revealed only when focused or inspecting controls */}
      <div className="synced-block-toolbar absolute -top-8 end-0 z-30 inline-flex items-center rounded-md border border-border bg-surface text-xs text-muted shadow-md">
        <div ref={locationsContainerRef} className="relative">
          <button
            type="button"
            aria-expanded={locationsOpen}
            aria-haspopup="menu"
            onClick={() => {
              setMoreMenuOpen(false);
              setLocationsOpen((prev) => !prev);
            }}
            className="inline-flex h-7 items-center gap-1.5 rounded-s-md px-2 text-xs font-medium text-muted transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
          >
            <Icon name="sync" className="size-3.5 shrink-0" />
            <span>{badgeLabel}</span>
            <Icon
              name="chevron-right"
              className="size-3 shrink-0 rotate-90 opacity-70"
            />
          </button>

          {locationsOpen && (
            <div
              role="menu"
              aria-label="Synced block locations"
              className="absolute end-0 top-full z-40 mt-1 w-64 rounded-lg border border-border bg-surface p-1.5 shadow-lg"
            >
              <p className="px-2 py-1 text-[11px] font-semibold text-muted">
                Linked pages ({uniquePages.length})
              </p>
              <div className="max-h-56 space-y-0.5 overflow-y-auto">
                {uniquePages.map((entry) => {
                  const isCurrent = entry.docId === currentDocId;
                  return (
                    <Link
                      key={entry.docId}
                      href={`/docs/${entry.docId}`}
                      role="menuitem"
                      onClick={() => setLocationsOpen(false)}
                      className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs text-foreground transition-colors hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none"
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        {entry.docIcon ? (
                          <span aria-hidden="true" className="shrink-0 text-xs">
                            {entry.docIcon}
                          </span>
                        ) : (
                          <Icon
                            name="document"
                            className="size-3.5 shrink-0 text-muted"
                          />
                        )}
                        <span className="truncate">{entry.docTitle}</span>
                      </span>
                      <span className="shrink-0 text-[10px] text-muted">
                        {isCurrent ? "Current" : ""}
                        {entry.count > 1 ? ` · ${entry.count}×` : ""}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <span aria-hidden="true" className="h-4 w-px bg-border" />

        <button
          type="button"
          aria-label="Copy & sync"
          title="Copy & sync"
          onClick={onCopyAndSync}
          className="inline-flex size-7 items-center justify-center text-muted transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
        >
          <Icon name="copy" className="size-3.5" />
        </button>

        <div ref={moreContainerRef} className="relative">
          <button
            type="button"
            aria-label="Synced block options"
            title="More options"
            aria-expanded={moreMenuOpen}
            aria-haspopup="menu"
            onClick={() => {
              setLocationsOpen(false);
              setMoreMenuOpen((prev) => !prev);
            }}
            className="inline-flex size-7 items-center justify-center rounded-e-md text-muted transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
          >
            <Icon name="ellipsis" className="size-3.5" />
          </button>

          {moreMenuOpen && (
            <div
              role="menu"
              aria-label="Synced block options"
              className="absolute end-0 top-full z-40 mt-1 w-40 rounded-lg border border-border bg-surface p-1 shadow-lg"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMoreMenuOpen(false);
                  onUnsync();
                }}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-start text-xs text-foreground hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none"
              >
                <Icon name="unlink" className="size-3.5 text-muted" />
                <span>Unsync</span>
              </button>

              {occurrences.length > 1 && onUnsyncAll && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMoreMenuOpen(false);
                    onUnsyncAll();
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-start text-xs text-foreground hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none"
                >
                  <Icon name="unlink" className="size-3.5 text-muted" />
                  <span>Unsync all</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {children}
    </div>
  );
}
