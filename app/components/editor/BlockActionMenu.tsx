"use client";

import {
  type CSSProperties,
  type RefObject,
  useEffectEvent,
  useLayoutEffect,
} from "react";
import { Icon } from "../../assets/icons";
import {
  type BlockColor,
  getNotionBlockColorClass,
} from "../../lib/database-types";
import type { BlockType, DocBlock } from "../../lib/docs-utils";
import {
  BASIC_BLOCK_OPTIONS,
  BLOCK_COLOR_OPTIONS,
} from "./editor-constants";

export type BlockMenuView = "main" | "turn-into" | "color";

interface BlockActionMenuProps {
  block: DocBlock;
  menuView: BlockMenuView;
  menuRef: RefObject<HTMLDivElement | null>;
  getAnchorEl: () => HTMLElement | null;
  index: number;
  siblingCount: number;
  isColumnsBlock?: boolean;
  isSynced?: boolean;
  syncOccurrenceCount?: number;
  canSync?: boolean;
  hasSyncedClipboard?: boolean;
  onChangeView: (view: BlockMenuView) => void;
  onTurnInto: (blockId: string, type: BlockType, content?: string) => void;
  onChangeColor: (blockId: string, color: BlockColor) => void;
  onDuplicate: (blockId: string) => void;
  onCopy: (block: DocBlock) => void;
  onCopyAndSync?: (blockId: string) => void;
  onPasteSynced?: (blockId: string) => void;
  onUnsync?: (blockId: string, unsyncAll?: boolean) => void;
  onInsertRelative: (blockId: string, position: "before" | "after") => void;
  onMove: (blockId: string, direction: -1 | 1) => void;
  onDelete: (blockId: string) => void;
}

/** 6-dot block action menu anchored beside the block handle button with Turn into, Color, Sync, Duplicate, Copy, Insert, Move, and Delete actions. */
export function BlockActionMenu({
  block,
  menuView,
  menuRef,
  getAnchorEl,
  index,
  siblingCount,
  isColumnsBlock = false,
  isSynced = false,
  syncOccurrenceCount = 0,
  canSync = true,
  hasSyncedClipboard = false,
  onChangeView,
  onTurnInto,
  onChangeColor,
  onDuplicate,
  onCopy,
  onCopyAndSync,
  onPasteSynced,
  onUnsync,
  onInsertRelative,
  onMove,
  onDelete,
}: BlockActionMenuProps) {
  const readAnchorEl = useEffectEvent(() => getAnchorEl());

  useLayoutEffect(() => {
    const supportsAnchor =
      CSS.supports("position-area: inline-end span-block-end") &&
      CSS.supports("anchor-name: --a");
    if (supportsAnchor) return;

    const updatePosition = () => {
      const menuEl = menuRef.current;
      const anchorEl = readAnchorEl();
      if (!menuEl || !anchorEl) return;

      const rect = anchorEl.getBoundingClientRect();
      const menuRect = menuEl.getBoundingClientRect();
      const width = menuRect.width || menuEl.offsetWidth || 240;
      const height = menuRect.height || menuEl.offsetHeight || 280;
      const gap = 6;
      const spaceRight = window.innerWidth - rect.right - gap - 8;
      const left =
        spaceRight >= width || rect.left - width - gap < 8
          ? Math.max(8, Math.min(rect.right + gap, window.innerWidth - width - 8))
          : Math.max(8, rect.left - gap - width);
      const fitsBelow = rect.top + height <= window.innerHeight - 8;
      const top = fitsBelow
        ? Math.max(8, rect.top)
        : Math.max(
            8,
            Math.min(rect.bottom - height, window.innerHeight - height - 8)
          );

      menuEl.style.top = `${top}px`;
      menuEl.style.left = `${left}px`;
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [menuRef, menuView]);

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Block actions"
      style={{ positionAnchor: "--active-block-handle" } as CSSProperties}
      className="block-action-menu w-60 rounded-lg border border-border bg-canvas p-1 text-foreground shadow-lg"
    >
      {menuView === "main" && (
        <div className="flex flex-col">
          {!isColumnsBlock && (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() => onChangeView("turn-into")}
                className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-start text-sm hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none"
              >
                <span>Turn into</span>
                <Icon name="chevron-right" className="size-3.5 text-muted" />
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={() => onChangeView("color")}
                className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-start text-sm hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none"
              >
                <span>Color</span>
                <Icon name="chevron-right" className="size-3.5 text-muted" />
              </button>
            </>
          )}

          <button
            type="button"
            role="menuitem"
            onClick={() => onDuplicate(block.id)}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-start text-sm hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none"
          >
            <Icon name="copy" className="size-4 text-muted" />
            <span>Duplicate</span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => onCopy(block)}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-start text-sm hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none"
          >
            <Icon name="link" className="size-4 text-muted" />
            <span>Copy</span>
          </button>

          {canSync && onCopyAndSync && (
            <button
              type="button"
              role="menuitem"
              onClick={() => onCopyAndSync(block.id)}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-start text-sm hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none"
            >
              <Icon name="sync" className="size-4 text-danger" />
              <span>Copy &amp; sync</span>
            </button>
          )}

          {hasSyncedClipboard && onPasteSynced && (
            <button
              type="button"
              role="menuitem"
              onClick={() => onPasteSynced(block.id)}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-start text-sm hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none"
            >
              <Icon name="sync" className="size-4 text-muted" />
              <span>Paste synced block</span>
            </button>
          )}

          {isSynced && onUnsync && (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() => onUnsync(block.id, false)}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-start text-sm hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none"
              >
                <Icon name="unlink" className="size-4 text-muted" />
                <span>Unsync</span>
              </button>

              {syncOccurrenceCount > 1 && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => onUnsync(block.id, true)}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-start text-sm hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none"
                >
                  <Icon name="unlink" className="size-4 text-muted" />
                  <span>Unsync all</span>
                </button>
              )}
            </>
          )}

          <button
            type="button"
            role="menuitem"
            onClick={() => onInsertRelative(block.id, "before")}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-start text-sm hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none"
          >
            <Icon name="plus" className="size-4 text-muted" />
            <span>Add block above</span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => onInsertRelative(block.id, "after")}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-start text-sm hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none"
          >
            <Icon name="plus" className="size-4 text-muted" />
            <span>Add block below</span>
          </button>

          {index > 0 && (
            <button
              type="button"
              role="menuitem"
              onClick={() => onMove(block.id, -1)}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-start text-sm hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none"
            >
              <span
                aria-hidden="true"
                className="inline-flex size-4 items-center justify-center text-xs text-muted"
              >
                ↑
              </span>
              <span>Move up</span>
            </button>
          )}

          {index < siblingCount - 1 && (
            <button
              type="button"
              role="menuitem"
              onClick={() => onMove(block.id, 1)}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-start text-sm hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none"
            >
              <span
                aria-hidden="true"
                className="inline-flex size-4 items-center justify-center text-xs text-muted"
              >
                ↓
              </span>
              <span>Move down</span>
            </button>
          )}

          <hr className="my-1 border-border" />

          <button
            type="button"
            role="menuitem"
            onClick={() => onDelete(block.id)}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-start text-sm text-danger hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none"
          >
            <Icon name="trash" className="size-4" />
            <span>Delete</span>
          </button>
        </div>
      )}

      {menuView === "turn-into" && !isColumnsBlock && (
        <div className="flex max-h-80 flex-col overflow-y-auto">
          <button
            type="button"
            role="menuitem"
            onClick={() => onChangeView("main")}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-start text-xs font-semibold text-muted hover:bg-secondary hover:text-foreground focus-visible:bg-secondary focus-visible:outline-none"
          >
            <span aria-hidden="true">←</span>
            <span>Turn into</span>
          </button>
          <hr className="my-1 border-border" />
          {BASIC_BLOCK_OPTIONS.map((opt) => {
            const isCurrent = opt.type === block.type;
            return (
              <button
                key={opt.type}
                type="button"
                role="menuitem"
                onClick={() =>
                  onTurnInto(
                    block.id,
                    opt.type,
                    opt.type === "divider" ? "" : undefined
                  )
                }
                className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-start text-sm hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none ${
                  isCurrent ? "bg-secondary font-medium" : ""
                }`}
              >
                <span>{opt.label}</span>
                {isCurrent ? (
                  <span aria-hidden="true" className="text-xs text-primary">
                    ✓
                  </span>
                ) : (
                  <span className="text-xs text-muted">{opt.hint}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {menuView === "color" && !isColumnsBlock && (
        <div className="flex max-h-80 flex-col overflow-y-auto">
          <button
            type="button"
            role="menuitem"
            onClick={() => onChangeView("main")}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-start text-xs font-semibold text-muted hover:bg-secondary hover:text-foreground focus-visible:bg-secondary focus-visible:outline-none"
          >
            <span aria-hidden="true">←</span>
            <span>Color</span>
          </button>
          <hr className="my-1 border-border" />
          {BLOCK_COLOR_OPTIONS.map((opt) => {
            const isCurrent = (block.color ?? "default") === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="menuitem"
                onClick={() => onChangeColor(block.id, opt.value)}
                className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-start text-xs hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none ${
                  isCurrent ? "bg-secondary font-medium" : ""
                }`}
              >
                <span
                  className={`rounded px-1.5 py-0.5 ${getNotionBlockColorClass(opt.value)}`}
                >
                  {opt.label}
                </span>
                {isCurrent && (
                  <span aria-hidden="true" className="text-primary">
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
