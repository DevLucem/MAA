"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Icon } from "../../assets/icons";
import { useDocs } from "../../lib/docs-store";
import type { BlockType } from "../../lib/docs-utils";
import { collectLinkableBlocks } from "../../lib/synced-blocks";

const BLOCK_TYPE_LABELS: Record<BlockType, string> = {
  paragraph: "Text",
  h1: "Heading 1",
  h2: "Heading 2",
  h3: "Heading 3",
  bullet: "Bullet list",
  numbered: "Numbered list",
  todo: "To-do",
  quote: "Quote",
  callout: "Callout",
  code: "Code",
  divider: "Divider",
  database: "Database",
  "page-link": "Sub-page",
  columns: "Columns",
  bookmark: "Bookmark",
};

interface LinkBlockDialogProps {
  open: boolean;
  currentDocId: string;
  onClose: () => void;
  onSelectBlock: (sourceDocId: string, sourceBlockId: string) => void;
}

/** Modal picker using native <dialog> to embed any existing block across pages as a synced block. */
export function LinkBlockDialog({
  open,
  currentDocId,
  onClose,
  onSelectBlock,
}: LinkBlockDialogProps) {
  const titleId = useId();
  const searchInputId = useId();
  const { docs, databases } = useDocs();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Progressive enhancement light-dismiss fallback for browsers without `closedby="any"` (Safari).
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if ("closedBy" in HTMLDialogElement.prototype) return;

    const isOutside = (event: PointerEvent) => {
      const rect = dialog.getBoundingClientRect();
      return (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      );
    };

    let pressedOutside = false;
    const handlePointerDown = (event: PointerEvent) => {
      pressedOutside = isOutside(event);
    };
    const handlePointerUp = (event: PointerEvent) => {
      if (pressedOutside && isOutside(event)) {
        dialog.close();
      }
      pressedOutside = false;
    };

    dialog.addEventListener("pointerdown", handlePointerDown);
    dialog.addEventListener("pointerup", handlePointerUp);
    return () => {
      dialog.removeEventListener("pointerdown", handlePointerDown);
      dialog.removeEventListener("pointerup", handlePointerUp);
    };
  }, []);

  const handleNativeClose = () => {
    if (dialogRef.current) {
      dialogRef.current.returnValue = "";
    }
    setQuery("");
    onClose();
  };

  const linkableItems = useMemo(
    () => collectLinkableBlocks(docs, databases),
    [databases, docs]
  );

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = !q
      ? linkableItems
      : linkableItems.filter((item) => {
          const typeLabel = BLOCK_TYPE_LABELS[item.blockType].toLowerCase();
          return (
            item.preview.toLowerCase().includes(q) ||
            item.docTitle.toLowerCase().includes(q) ||
            typeLabel.includes(q)
          );
        });

    // Prioritize blocks from other pages so linking across pages is immediate.
    return [...matched].sort((a, b) => {
      const aOther = a.docId === currentDocId ? 1 : 0;
      const bOther = b.docId === currentDocId ? 1 : 0;
      return aOther - bOther;
    });
  }, [currentDocId, linkableItems, query]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      {...({ closedby: "any" } as Record<string, string>)}
      onClose={handleNativeClose}
      className="settings-dialog m-auto w-[min(92vw,38rem)] max-h-[min(82dvh,36rem)] overflow-hidden rounded-xl border border-border bg-surface p-0 text-foreground shadow-2xl"
    >
      <div className="flex h-[min(78dvh,34rem)] flex-col">
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Icon name="sync" className="size-4 text-danger" />
            <h2 id={titleId} className="text-sm font-semibold text-foreground">
              Link existing block
            </h2>
          </div>

          <button
            type="button"
            aria-label="Close"
            onClick={() => dialogRef.current?.close()}
            className="inline-flex size-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
          >
            <Icon name="x" className="size-4" />
          </button>
        </div>

        <div className="shrink-0 border-b border-border px-4 py-2.5">
          <label htmlFor={searchInputId} className="sr-only">
            Filter linkable blocks
          </label>
          <input
            id={searchInputId}
            type="search"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            placeholder="Search blocks by content, type, or page…"
            className="h-9 w-full rounded-md border border-border bg-canvas px-3 text-sm text-foreground placeholder:text-muted focus-visible:outline-2 focus-visible:outline-primary"
          />
        </div>

        <div className="scroll-region flex-1 p-2">
          {filteredItems.length === 0 ? (
            <div className="px-4 py-10 text-center text-xs text-muted">
              No matching blocks found. Create content in any page first to link
              it here.
            </div>
          ) : (
            <ul className="space-y-1">
              {filteredItems.map((item) => (
                <li key={`${item.docId}-${item.blockId}`}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectBlock(item.docId, item.blockId);
                      dialogRef.current?.close();
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-start transition-colors hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="inline-flex shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted">
                          {BLOCK_TYPE_LABELS[item.blockType]}
                        </span>
                        {item.syncGroupId && (
                          <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-danger/10 px-1.5 py-0.5 text-[10px] font-medium text-danger">
                            <Icon name="sync" className="size-2.5" />
                            <span>Synced</span>
                          </span>
                        )}
                      </div>
                      <p className="mt-1 truncate text-sm text-foreground">
                        {item.preview}
                      </p>
                    </div>

                    <span className="flex max-w-40 shrink-0 items-center gap-1 text-xs text-muted">
                      {item.docIcon ? (
                        <span aria-hidden="true" className="shrink-0 text-xs">
                          {item.docIcon}
                        </span>
                      ) : (
                        <Icon
                          name="document"
                          className="size-3.5 shrink-0 text-muted"
                        />
                      )}
                      <span className="truncate">{item.docTitle}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </dialog>
  );
}
