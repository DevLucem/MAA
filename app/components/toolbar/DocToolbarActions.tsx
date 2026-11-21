"use client";

import { useRouter } from "next/navigation";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Icon } from "../../assets/icons";
import { useDocs } from "../../lib/docs-store";
import {
  type Doc,
  type DocStats,
  docToMarkdown,
  formatEditedTime,
} from "../../lib/docs-utils";

function showAnchoredPopover(popover: HTMLElement, source: HTMLElement) {
  (
    popover as HTMLElement & {
      showPopover: (options?: { source?: HTMLElement }) => void;
    }
  ).showPopover({ source });
}

function positionPopoverBelowEnd(trigger: HTMLElement, popover: HTMLElement) {
  const rect = trigger.getBoundingClientRect();
  const popRect = popover.getBoundingClientRect();
  const width = popRect.width || popover.offsetWidth || 224;
  const height = popRect.height || popover.offsetHeight || 160;
  const top = Math.min(
    rect.bottom + 6,
    Math.max(8, window.innerHeight - height - 8)
  );
  const left = Math.max(
    8,
    Math.min(rect.right - width, window.innerWidth - width - 8)
  );
  popover.style.top = `${top}px`;
  popover.style.left = `${left}px`;
}

interface DocToolbarActionsProps {
  activeDoc: Doc;
  stats: DocStats;
  copiedLabel: string | null;
  onCopyLink: () => Promise<void>;
  onFlashLabel: (label: string) => void;
}

/** Right-aligned document actions: edited timestamp, Share popover, Copy link, Favorite toggle, and More menu. */
export function DocToolbarActions({
  activeDoc,
  stats,
  copiedLabel,
  onCopyLink,
  onFlashLabel,
}: DocToolbarActionsProps) {
  const router = useRouter();
  const { createDoc, updateDoc, duplicateDoc, toggleFavorite, deleteDoc } =
    useDocs();

  const shareTriggerId = useId();
  const sharePopoverId = useId();
  const menuTriggerId = useId();
  const menuPopoverId = useId();

  const shareAnchorName = `--anchor-${shareTriggerId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const menuAnchorName = `--anchor-${menuTriggerId.replace(/[^a-zA-Z0-9_-]/g, "")}`;

  const shareTriggerRef = useRef<HTMLButtonElement>(null);
  const sharePopoverRef = useRef<HTMLDivElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const menuPopoverRef = useRef<HTMLDivElement>(null);
  const menuGroupRef = useRef<HTMLDivElement>(null);

  const enterOnOpenRef = useRef(false);
  const pointerDownTriggerRef = useRef(false);

  const [nowMs, setNowMs] = useState<number | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState("");

  useEffect(() => {
    const tick = () => setNowMs(Date.now());
    const initTimer = window.setTimeout(tick, 0);
    const interval = window.setInterval(tick, 30_000);
    return () => {
      window.clearTimeout(initTimer);
      window.clearInterval(interval);
    };
  }, []);

  const handleCopyMarkdown = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(docToMarkdown(activeDoc));
      onFlashLabel("Copied Markdown");
    } catch {
      onFlashLabel("Copy failed");
    }
  }, [activeDoc, onFlashLabel]);

  // Invoker + anchor-positioning fallback for Share popover
  useEffect(() => {
    const trigger = shareTriggerRef.current;
    const popover = sharePopoverRef.current;
    if (!trigger || !popover) return;

    const supportsInvokers = "commandForElement" in HTMLButtonElement.prototype;
    const supportsAnchor =
      CSS.supports("position-area: block-end") &&
      CSS.supports("anchor-name: --anchor");

    const onTriggerClick = (event: MouseEvent) => {
      if (supportsInvokers) return;
      event.preventDefault();
      if (popover.matches(":popover-open")) {
        popover.hidePopover();
      } else {
        showAnchoredPopover(popover, trigger);
      }
    };

    const onToggle = (event: Event) => {
      const toggleEvent = event as ToggleEvent;
      const isOpen = toggleEvent.newState === "open";
      setShareOpen(isOpen);
      if (isOpen) {
        setShareUrl(window.location.href);
        if (!supportsAnchor) {
          positionPopoverBelowEnd(trigger, popover);
        }
      }
    };

    trigger.addEventListener("click", onTriggerClick);
    popover.addEventListener("toggle", onToggle);

    return () => {
      trigger.removeEventListener("click", onTriggerClick);
      popover.removeEventListener("toggle", onToggle);
    };
  }, [activeDoc.id]);

  // Invoker, focusgroup, keyboard, and anchor-positioning fallbacks for `...` menu
  useEffect(() => {
    const trigger = menuTriggerRef.current;
    const popover = menuPopoverRef.current;
    const group = menuGroupRef.current;
    if (!trigger || !popover || !group) return;

    const supportsInvokers = "commandForElement" in HTMLButtonElement.prototype;
    const supportsFocusGroup = "focusGroup" in HTMLElement.prototype;
    const supportsAnchor =
      CSS.supports("position-area: block-end") &&
      CSS.supports("anchor-name: --anchor");

    if (!supportsFocusGroup) {
      group.setAttribute("role", "menu");
      group.querySelectorAll("button").forEach((btn) => {
        btn.setAttribute("role", "menuitem");
      });
    }

    const getMenuItems = () =>
      Array.from(group.querySelectorAll<HTMLButtonElement>("button")).filter(
        (item) =>
          !item.disabled && item.getAttribute("aria-disabled") !== "true"
      );

    const closeAndRestore = (fromPointer: boolean) => {
      if (fromPointer) {
        trigger.focus({ focusVisible: false } as FocusOptions);
      } else {
        trigger.focus();
      }
      if (popover.matches(":popover-open")) {
        popover.hidePopover();
      }
    };

    const onTriggerPointerDown = () => {
      pointerDownTriggerRef.current = true;
    };

    const onTriggerClick = (event: MouseEvent) => {
      const fromKeyboard = event.detail === 0 && !pointerDownTriggerRef.current;
      pointerDownTriggerRef.current = false;
      if (fromKeyboard && !popover.matches(":popover-open")) {
        enterOnOpenRef.current = true;
      }

      if (supportsInvokers) return;
      event.preventDefault();
      if (popover.matches(":popover-open")) {
        closeAndRestore(!fromKeyboard);
      } else {
        showAnchoredPopover(popover, trigger);
      }
    };

    const onTriggerKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "ArrowDown") return;
      event.preventDefault();
      enterOnOpenRef.current = true;
      if (popover.matches(":popover-open")) {
        getMenuItems()[0]?.focus({ preventScroll: true });
        enterOnOpenRef.current = false;
      } else {
        trigger.click();
      }
    };

    const onToggle = (event: Event) => {
      const toggleEvent = event as ToggleEvent;
      const isOpen = toggleEvent.newState === "open";
      setMenuOpen(isOpen);

      if (isOpen) {
        if (!supportsAnchor) {
          positionPopoverBelowEnd(trigger, popover);
        }
        if (enterOnOpenRef.current) {
          enterOnOpenRef.current = false;
          requestAnimationFrame(() => {
            getMenuItems()[0]?.focus({ preventScroll: true });
          });
        }
      } else {
        enterOnOpenRef.current = false;
      }
    };

    const onPopoverKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeAndRestore(false);
        return;
      }

      if (event.key === "Tab") {
        popover.hidePopover();
        return;
      }

      if (
        !supportsFocusGroup &&
        ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
      ) {
        const items = getMenuItems();
        if (items.length === 0) return;
        const current = items.indexOf(
          document.activeElement as HTMLButtonElement
        );
        const next =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? items.length - 1
              : (current + (event.key === "ArrowUp" ? -1 : 1) + items.length) %
                items.length;
        event.preventDefault();
        items[next]?.focus({ preventScroll: true });
      }
    };

    const onItemPointerMove = (event: PointerEvent) => {
      const target = (event.target as HTMLElement | null)?.closest("button");
      if (!target || !group.contains(target)) return;
      if (document.activeElement !== target) {
        target.focus({ focusVisible: false } as FocusOptions);
      }
    };

    trigger.addEventListener("pointerdown", onTriggerPointerDown);
    trigger.addEventListener("click", onTriggerClick);
    trigger.addEventListener("keydown", onTriggerKeyDown);
    popover.addEventListener("toggle", onToggle);
    popover.addEventListener("keydown", onPopoverKeyDown);
    group.addEventListener("pointermove", onItemPointerMove);

    return () => {
      trigger.removeEventListener("pointerdown", onTriggerPointerDown);
      trigger.removeEventListener("click", onTriggerClick);
      trigger.removeEventListener("keydown", onTriggerKeyDown);
      popover.removeEventListener("toggle", onToggle);
      popover.removeEventListener("keydown", onPopoverKeyDown);
      group.removeEventListener("pointermove", onItemPointerMove);
    };
  }, [activeDoc.id]);

  const closeMenu = useCallback(() => {
    if (menuPopoverRef.current?.matches(":popover-open")) {
      menuPopoverRef.current.hidePopover();
    }
  }, []);

  return (
    <div className="flex shrink-0 items-center gap-1">
      {copiedLabel && (
        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-foreground">
          {copiedLabel}
        </span>
      )}

      <span className="hidden px-2 text-xs text-muted sm:inline">
        {formatEditedTime(activeDoc.updatedAt, nowMs)}
      </span>

      {/* Share trigger + popover */}
      <button
        ref={shareTriggerRef}
        id={shareTriggerId}
        type="button"
        aria-label="Share"
        aria-expanded={shareOpen}
        aria-controls={sharePopoverId}
        style={{ anchorName: shareAnchorName } as CSSProperties}
        {...({
          commandfor: sharePopoverId,
          command: "toggle-popover",
        } as Record<string, string>)}
        className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary"
      >
        <Icon name="share" className="size-4" />
        <span className="hidden sm:inline">Share</span>
      </button>
      <div
        ref={sharePopoverRef}
        id={sharePopoverId}
        {...({ popover: "auto" } as Record<string, string>)}
        aria-labelledby={shareTriggerId}
        style={{ positionAnchor: shareAnchorName } as CSSProperties}
        className="toolbar-popover w-72 rounded-lg border border-border bg-canvas p-3 text-foreground shadow-lg"
      >
        <p className="text-xs font-semibold text-foreground">Share document</p>
        <p className="mt-1 text-xs text-muted">
          Copy the link below to jump directly to this document.
        </p>
        <div className="mt-2.5 flex items-center gap-2">
          <input
            type="text"
            readOnly
            aria-label="Document URL"
            value={shareUrl}
            onFocus={(e) => e.currentTarget.select()}
            className="h-8 min-w-0 flex-1 rounded-md border border-border bg-surface px-2 text-xs text-foreground focus-visible:outline-2 focus-visible:outline-primary"
          />
          <button
            type="button"
            onClick={() => {
              void onCopyLink();
              if (sharePopoverRef.current?.matches(":popover-open")) {
                sharePopoverRef.current.hidePopover();
              }
            }}
            className="primary inline-flex h-8 shrink-0 items-center rounded-md px-2.5 text-xs font-medium"
          >
            Copy link
          </button>
        </div>
      </div>

      {/* Copy link button */}
      <button
        type="button"
        aria-label="Copy link"
        onClick={() => void onCopyLink()}
        className="inline-flex size-8 items-center justify-center rounded-md text-foreground transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary"
      >
        <Icon name="link" className="size-4" />
      </button>

      {/* Favorite toggle */}
      <button
        type="button"
        aria-label={
          activeDoc.favorite ? "Remove from favorites" : "Add to favorites"
        }
        aria-pressed={Boolean(activeDoc.favorite)}
        onClick={() => toggleFavorite(activeDoc.id)}
        className="inline-flex size-8 items-center justify-center rounded-md text-foreground transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary"
      >
        <Icon
          name={activeDoc.favorite ? "star-solid" : "star"}
          className={activeDoc.favorite ? "size-4 text-primary" : "size-4"}
        />
      </button>

      {/* More actions (...) popup menu */}
      <button
        ref={menuTriggerRef}
        id={menuTriggerId}
        type="button"
        aria-label="Document actions"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        style={{ anchorName: menuAnchorName } as CSSProperties}
        {...({
          commandfor: menuPopoverId,
          command: "toggle-popover",
        } as Record<string, string>)}
        className={`inline-flex size-8 items-center justify-center rounded-md text-foreground transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary ${
          menuOpen ? "bg-secondary" : ""
        }`}
      >
        <Icon name="ellipsis" className="size-4" />
      </button>
      <div
        ref={menuPopoverRef}
        id={menuPopoverId}
        {...({ popover: "auto" } as Record<string, string>)}
        style={{ positionAnchor: menuAnchorName } as CSSProperties}
        className="toolbar-popover w-56 rounded-lg border border-border bg-canvas p-1.5 text-foreground shadow-lg"
      >
        <div className="px-2 py-1.5 text-xs text-muted">
          {stats.wordCount} {stats.wordCount === 1 ? "word" : "words"} ·{" "}
          {stats.readingMinutes} min read · {stats.blockCount}{" "}
          {stats.blockCount === 1 ? "block" : "blocks"}
        </div>
        <hr className="my-1 border-border" />
        <div
          ref={menuGroupRef}
          {...({ focusgroup: "menu nomemory" } as Record<string, string>)}
          aria-labelledby={menuTriggerId}
          className="flex flex-col"
        >
          <button
            type="button"
            onClick={() => {
              updateDoc(activeDoc.id, { fullWidth: !activeDoc.fullWidth });
              closeMenu();
            }}
            className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-start text-sm text-foreground transition-colors hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none"
          >
            <span>Full width</span>
            {activeDoc.fullWidth && (
              <span aria-hidden="true" className="text-xs text-primary">
                ✓
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              const child = createDoc(activeDoc.id);
              closeMenu();
              router.push(`/docs/${child.id}`);
            }}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-sm text-foreground transition-colors hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none"
          >
            New nested doc
          </button>
          <button
            type="button"
            onClick={() => {
              const copy = duplicateDoc(activeDoc.id);
              closeMenu();
              if (copy) {
                router.push(`/docs/${copy.id}`);
              }
            }}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-sm text-foreground transition-colors hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none"
          >
            Duplicate
          </button>
          <button
            type="button"
            onClick={() => {
              void handleCopyMarkdown();
              closeMenu();
              menuTriggerRef.current?.focus({
                focusVisible: false,
              } as FocusOptions);
            }}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-sm text-foreground transition-colors hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none"
          >
            Copy as Markdown
          </button>
          <hr className="my-1 border-border" />
          <button
            type="button"
            onClick={() => {
              closeMenu();
              deleteDoc(activeDoc.id);
              router.push("/docs");
            }}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-sm text-danger transition-colors hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none"
          >
            Move to trash
          </button>
        </div>
      </div>
    </div>
  );
}
