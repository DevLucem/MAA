"use client";

import Link from "next/link";
import type React from "react";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { Icon } from "../../assets/icons";
import { getNotionBlockColorClass } from "../../lib/database-types";
import { useDocs } from "../../lib/docs-store";
import {
  type BlockType,
  type DocBlock,
  htmlToPlainText,
  isSafeHref,
  sanitizeInlineHtml,
  type TodoEmbedConfig,
} from "../../lib/docs-utils";
import { parseSyncClipboardToken } from "../../lib/synced-blocks";
import {
  type ParsedTodoEmbedLink,
  parseTodoEmbedLink,
} from "../../lib/todos-utils";
import { InlineDatabaseBlock } from "../InlineDatabaseBlock";
import { InlineTodoEmbedBlock } from "../todos/InlineTodoEmbedBlock";
import { isImeConfirming } from "./block-tree";
import {
  BLOCK_PLACEHOLDERS,
  BLOCK_STYLE_MAP,
  MARKDOWN_SHORTCUTS,
} from "./editor-constants";

export interface EditableBlockProps {
  block: DocBlock;
  syncToken: number;
  numberedIndex?: number;
  slashActive: boolean;
  isMenuOpen: boolean;
  isDropTarget: boolean;
  onRegisterRef: (id: string, el: HTMLElement | null) => void;
  onRegisterHandleRef: (id: string, el: HTMLButtonElement | null) => void;
  onToggleMenu: (id: string) => void;
  onDragStartBlock: (id: string, event: React.DragEvent) => void;
  onDragOverBlock: (id: string, event: React.DragEvent) => void;
  onDropOnBlock: (id: string, event: React.DragEvent) => void;
  onDragEndBlock: () => void;
  onChangeContent: (id: string, content: string) => void;
  onUpdateBookmark: (id: string, url: string, label: string) => void;
  onUpdateTodoEmbed?: (
    id: string,
    config: TodoEmbedConfig,
    label?: string
  ) => void;
  onConvertBlock: (id: string, type: BlockType, content?: string) => void;
  onIndentBlock: (id: string, delta: 1 | -1) => void;
  onToggleTodo: (id: string) => void;
  onInsertAfter: (id: string, type?: BlockType) => void;
  onDeleteBlock: (id: string) => void;
  onNavigateBlock: (id: string, direction: -1 | 1) => void;
  onSlashQuery: (id: string | null, query: string) => void;
  onSlashKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  onNavigateInternal: (href: string) => void;
  onPasteSyncedBlock?: (blockId: string, syncGroupId: string) => void;
  onPasteTodoEmbed?: (
    blockId: string,
    parsed: ParsedTodoEmbedLink
  ) => boolean;
  canDelete: boolean;
  nestedInColumn?: boolean;
}

function getHandlePositionClasses(
  block: DocBlock,
  nestedInColumn: boolean
): string {
  const isBgQuote =
    block.type === "quote" && Boolean(block.color && block.color.endsWith("_bg"));

  let inlineOffset = "mt-0.5";
  let desktopOffset = "sm:top-1";

  switch (block.type) {
    case "h1":
      inlineOffset = "mt-[18px]";
      desktopOffset = "sm:top-5";
      break;
    case "h2":
      inlineOffset = "mt-3";
      desktopOffset = "sm:top-3.5";
      break;
    case "h3":
      inlineOffset = "mt-1.5";
      desktopOffset = "sm:top-2";
      break;
    case "quote":
      if (isBgQuote) {
        inlineOffset = "mt-3";
        desktopOffset = "sm:top-3.5";
      }
      break;
    case "callout":
    case "code":
      inlineOffset = "mt-[15px]";
      desktopOffset = "sm:top-[17px]";
      break;
    case "database":
      inlineOffset = "mt-0.5";
      desktopOffset = "sm:top-0.5";
      break;
    case "todo-embed":
      inlineOffset = "mt-4";
      desktopOffset = "sm:top-4";
      break;
    case "page-link":
      inlineOffset = "";
      desktopOffset = "sm:top-1.5";
      break;
    case "divider":
      inlineOffset = "";
      desktopOffset = "sm:top-1/2 sm:-translate-y-1/2";
      break;
    case "bookmark":
      inlineOffset = "mt-[9px]";
      desktopOffset = "sm:top-[13px]";
      break;
  }

  return nestedInColumn
    ? inlineOffset
    : `${inlineOffset ? `${inlineOffset} ` : ""}sm:mt-0 sm:absolute sm:-start-8 ${desktopOffset}`;
}

/** Individual editable Notion block supporting rich inline HTML, markdown triggers, bookmarks, and inline databases. */
export function EditableBlock({
  block,
  syncToken,
  numberedIndex,
  slashActive,
  isMenuOpen,
  isDropTarget,
  onRegisterRef,
  onRegisterHandleRef,
  onToggleMenu,
  onDragStartBlock,
  onDragOverBlock,
  onDropOnBlock,
  onDragEndBlock,
  onChangeContent,
  onUpdateBookmark,
  onUpdateTodoEmbed,
  onConvertBlock,
  onIndentBlock,
  onToggleTodo,
  onInsertAfter,
  onDeleteBlock,
  onNavigateBlock,
  onSlashQuery,
  onSlashKeyDown,
  onNavigateInternal,
  onPasteSyncedBlock,
  onPasteTodoEmbed,
  canDelete,
  nestedInColumn = false,
}: EditableBlockProps) {
  const { getDoc } = useDocs();
  const editableRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLButtonElement>(null);
  const [bookmarkUrlDraft, setBookmarkUrlDraft] = useState(block.url ?? "");
  const [bookmarkLabelDraft, setBookmarkLabelDraft] = useState(
    htmlToPlainText(block.content)
  );

  useEffect(() => {
    onRegisterRef(block.id, editableRef.current);
    return () => onRegisterRef(block.id, null);
  }, [block.id, onRegisterRef]);

  useEffect(() => {
    onRegisterHandleRef(block.id, handleRef.current);
    return () => onRegisterHandleRef(block.id, null);
  }, [block.id, onRegisterHandleRef]);

  useEffect(() => {
    const el = editableRef.current;
    if (!el) return;
    if (document.activeElement === el && syncToken === 0) return;

    if (block.type === "code") {
      if (el.textContent !== block.content) {
        el.textContent = block.content;
      }
    } else if (el.innerHTML !== block.content) {
      el.innerHTML = block.content;
    }
  }, [block.content, block.type, syncToken]);

  const handleInput = () => {
    const el = editableRef.current;
    if (!el) return;

    const rawText = el.textContent ?? "";
    if (
      el.innerHTML === "<br>" ||
      (el.innerHTML === "\n" && block.type !== "code")
    ) {
      el.innerHTML = "";
    }

    if (block.type === "paragraph") {
      for (const shortcut of MARKDOWN_SHORTCUTS) {
        if (shortcut.pattern.test(rawText)) {
          el.innerHTML = "";
          onSlashQuery(null, "");
          onConvertBlock(block.id, shortcut.type, "");
          return;
        }
      }
    }

    if (
      block.type !== "code" &&
      rawText.startsWith("/") &&
      !rawText.includes("\n")
    ) {
      onSlashQuery(block.id, rawText.slice(1));
    } else if (slashActive) {
      onSlashQuery(null, "");
    }

    const nextContent =
      block.type === "code" ? rawText : sanitizeInlineHtml(el.innerHTML);
    onChangeContent(block.id, nextContent);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (slashActive) {
      if (
        event.key === "ArrowDown" ||
        event.key === "ArrowUp" ||
        event.key === "Escape"
      ) {
        onSlashKeyDown(event);
        return;
      }
      if (event.key === "Enter") {
        if (isImeConfirming(event)) return;
        onSlashKeyDown(event);
        return;
      }
    }

    if (
      event.key === "Tab" &&
      (block.type === "bullet" ||
        block.type === "numbered" ||
        block.type === "todo")
    ) {
      event.preventDefault();
      onIndentBlock(block.id, event.shiftKey ? -1 : 1);
      return;
    }

    if (event.key === "Enter") {
      if (isImeConfirming(event)) return;

      if (block.type === "code") {
        if (event.metaKey || event.ctrlKey) {
          event.preventDefault();
          onInsertAfter(block.id, "paragraph");
        }
        return;
      }

      if (!event.shiftKey) {
        event.preventDefault();
        const isEmpty = (editableRef.current?.textContent ?? "").length === 0;
        if (isEmpty && block.type !== "paragraph") {
          onConvertBlock(block.id, "paragraph", "");
          return;
        }
        const nextType: BlockType =
          block.type === "bullet" ||
          block.type === "numbered" ||
          block.type === "todo"
            ? block.type
            : "paragraph";
        onInsertAfter(block.id, nextType);
      }
      return;
    }

    if (event.key === "Backspace") {
      const isEmpty = (editableRef.current?.textContent ?? "").length === 0;
      if (!isEmpty) return;

      event.preventDefault();
      onSlashQuery(null, "");
      if (block.indent && block.indent > 0) {
        onIndentBlock(block.id, -1);
      } else if (block.type !== "paragraph") {
        onConvertBlock(block.id, "paragraph", "");
      } else if (canDelete) {
        onDeleteBlock(block.id);
      }
      return;
    }

    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      const el = editableRef.current;
      const selection = window.getSelection();
      if (!el || !selection || !selection.isCollapsed) return;

      const textLength = (el.textContent ?? "").length;
      if (event.key === "ArrowUp" && selection.anchorOffset === 0) {
        event.preventDefault();
        onNavigateBlock(block.id, -1);
      } else if (
        event.key === "ArrowDown" &&
        (textLength === 0 || selection.anchorOffset >= textLength)
      ) {
        event.preventDefault();
        onNavigateBlock(block.id, 1);
      }
    }
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    const plain = event.clipboardData.getData("text/plain");
    const pastedSyncId = parseSyncClipboardToken(plain);
    if (pastedSyncId && onPasteSyncedBlock) {
      onPasteSyncedBlock(block.id, pastedSyncId);
      return;
    }
    if (block.type === "code") {
      document.execCommand("insertText", false, plain);
      return;
    }
    const parsedTodoEmbed = parseTodoEmbedLink(
      plain,
      typeof window !== "undefined" ? window.location.origin : undefined
    );
    if (parsedTodoEmbed && onPasteTodoEmbed?.(block.id, parsedTodoEmbed)) {
      return;
    }
    const html = event.clipboardData.getData("text/html");
    const safeHtml = html ? sanitizeInlineHtml(html) : "";
    if (safeHtml) {
      document.execCommand("insertHTML", false, safeHtml);
    } else {
      document.execCommand("insertText", false, plain);
    }
    handleInput();
  };

  const handleContentClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const anchor = (event.target as HTMLElement | null)?.closest("a");
    if (!anchor) return;
    const href = anchor.getAttribute("href");
    if (!href || !isSafeHref(href)) return;
    event.preventDefault();
    if (href.startsWith("/docs/") || href.startsWith("/todos/")) {
      onNavigateInternal(href);
    } else {
      window.open(href, "_blank", "noopener,noreferrer");
    }
  };

  const handleButton = (
    <button
      ref={handleRef}
      type="button"
      draggable
      aria-label="Block actions"
      aria-haspopup="menu"
      aria-expanded={isMenuOpen}
      onClick={() => onToggleMenu(block.id)}
      onDragStart={(e) => onDragStartBlock(block.id, e)}
      onDragEnd={onDragEndBlock}
      style={
        isMenuOpen
          ? ({ anchorName: "--active-block-handle" } as CSSProperties)
          : undefined
      }
      className={`inline-flex size-6 shrink-0 cursor-grab items-center justify-center rounded text-muted transition-opacity hover:bg-secondary hover:text-foreground focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-primary active:cursor-grabbing ${getHandlePositionClasses(
        block,
        nestedInColumn
      )} ${
        isMenuOpen
          ? "bg-secondary text-foreground opacity-100"
          : "sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100"
      }`}
    >
      <Icon name="grip" className="size-4" />
    </button>
  );

  if (block.type === "divider") {
    return (
      <div
        onDragOver={(e) => onDragOverBlock(block.id, e)}
        onDrop={(e) => onDropOnBlock(block.id, e)}
        className={`group relative flex items-center gap-1.5 py-2 ${
          isDropTarget ? "border-t-2 border-primary" : ""
        }`}
      >
        {handleButton}
        <div
          tabIndex={0}
          role="separator"
          onKeyDown={(e) => {
            if (e.key === "Backspace" && canDelete) {
              e.preventDefault();
              onDeleteBlock(block.id);
            } else if (e.key === "Enter") {
              if (isImeConfirming(e)) return;
              e.preventDefault();
              onInsertAfter(block.id, "paragraph");
            }
          }}
          className="flex-1 rounded py-2 focus-visible:outline-2 focus-visible:outline-primary"
        >
          <hr className="border-border" />
        </div>
      </div>
    );
  }

  if (block.type === "database") {
    return (
      <div
        onDragOver={(e) => onDragOverBlock(block.id, e)}
        onDrop={(e) => onDropOnBlock(block.id, e)}
        className={`group relative my-5 flex items-start gap-1.5 ${
          isDropTarget ? "border-t-2 border-primary" : ""
        }`}
      >
        {handleButton}
        <div className="min-w-0 flex-1">
          {block.databaseId ? (
            <InlineDatabaseBlock databaseId={block.databaseId} />
          ) : (
            <div className="rounded-lg border border-border bg-surface p-4 text-xs text-muted">
              Missing database reference
            </div>
          )}
        </div>
      </div>
    );
  }

  if (block.type === "todo-embed") {
    return (
      <div
        onDragOver={(e) => onDragOverBlock(block.id, e)}
        onDrop={(e) => onDropOnBlock(block.id, e)}
        className={`group relative my-5 flex items-start gap-1.5 ${
          isDropTarget ? "border-t-2 border-primary" : ""
        }`}
      >
        {handleButton}
        <div className="min-w-0 flex-1">
          <InlineTodoEmbedBlock
            config={block.todoEmbed}
            fallbackLabel={htmlToPlainText(block.content)}
            onUpdateConfig={(cfg, label) =>
              onUpdateTodoEmbed?.(block.id, cfg, label)
            }
          />
        </div>
      </div>
    );
  }

  if (block.type === "page-link") {
    const linked = block.linkedDocId ? getDoc(block.linkedDocId) : undefined;
    const label =
      linked?.title.trim() || htmlToPlainText(block.content) || "Sub-page";
    return (
      <div
        onDragOver={(e) => onDragOverBlock(block.id, e)}
        onDrop={(e) => onDropOnBlock(block.id, e)}
        className={`group relative flex items-center gap-1.5 py-0.5 ${
          isDropTarget ? "border-t-2 border-primary" : ""
        }`}
      >
        {handleButton}
        {block.linkedDocId ? (
          <Link
            href={`/docs/${block.linkedDocId}`}
            className="inline-flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:bg-secondary hover:decoration-primary focus-visible:outline-2 focus-visible:outline-primary"
          >
            {linked?.icon ? (
              <span
                aria-hidden="true"
                className="shrink-0 text-base leading-none"
              >
                {linked.icon}
              </span>
            ) : (
              <Icon name="document" className="size-4 shrink-0 text-muted" />
            )}
            <span className="truncate">{label}</span>
          </Link>
        ) : (
          <span className="px-2 py-1 text-sm text-muted">{label}</span>
        )}
      </div>
    );
  }

  if (block.type === "bookmark") {
    const safeUrl = block.url && isSafeHref(block.url) ? block.url : null;
    const label = htmlToPlainText(block.content) || safeUrl || "Web bookmark";
    return (
      <div
        onDragOver={(e) => onDragOverBlock(block.id, e)}
        onDrop={(e) => onDropOnBlock(block.id, e)}
        className={`group relative flex items-start gap-1.5 py-1 ${
          isDropTarget ? "border-t-2 border-primary" : ""
        }`}
      >
        {handleButton}
        {safeUrl ? (
          <a
            href={safeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-lg border border-border bg-surface/60 px-3.5 py-2.5 transition-colors hover:border-muted hover:bg-surface focus-visible:outline-2 focus-visible:outline-primary"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {label}
              </p>
              <p className="mt-0.5 truncate text-xs text-muted">{safeUrl}</p>
            </div>
            <Icon
              name="external-link"
              className="size-4 shrink-0 text-muted"
            />
          </a>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (isSafeHref(bookmarkUrlDraft)) {
                onUpdateBookmark(
                  block.id,
                  bookmarkUrlDraft.trim(),
                  bookmarkLabelDraft.trim()
                );
              }
            }}
            className="flex min-w-0 flex-1 flex-wrap items-center gap-2 rounded-lg border border-border bg-surface p-2.5"
          >
            <input
              type="url"
              required
              aria-label="Bookmark URL"
              placeholder="https://example.com"
              value={bookmarkUrlDraft}
              onChange={(e) => setBookmarkUrlDraft(e.currentTarget.value)}
              className="h-8 min-w-44 flex-1 rounded border border-border bg-canvas px-2 text-xs text-foreground"
            />
            <input
              type="text"
              aria-label="Bookmark title"
              placeholder="Optional title"
              value={bookmarkLabelDraft}
              onChange={(e) => setBookmarkLabelDraft(e.currentTarget.value)}
              className="h-8 min-w-32 rounded border border-border bg-canvas px-2 text-xs text-foreground"
            />
            <button
              type="submit"
              className="primary inline-flex h-8 items-center rounded px-3 text-xs font-medium"
            >
              Save
            </button>
          </form>
        )}
      </div>
    );
  }

  const colorClass = getNotionBlockColorClass(block.color);
  const isBgColor = Boolean(block.color && block.color.endsWith("_bg"));
  const indentRem = block.indent ? block.indent * 1.5 : 0;

  if (block.type === "callout") {
    return (
      <div
        onDragOver={(e) => onDragOverBlock(block.id, e)}
        onDrop={(e) => onDropOnBlock(block.id, e)}
        className={`group relative flex items-start gap-1.5 py-0.5 ${
          isDropTarget ? "border-t-2 border-primary" : ""
        }`}
      >
        {handleButton}
        <div
          className={`flex min-w-0 flex-1 items-start gap-2.5 rounded-lg border border-border p-3.5 ${
            isBgColor ? colorClass : `bg-surface ${colorClass}`
          }`}
        >
          {block.calloutIcon && (
            <span aria-hidden="true" className="shrink-0 text-lg leading-none">
              {block.calloutIcon}
            </span>
          )}
          <div
            ref={editableRef}
            contentEditable
            suppressContentEditableWarning
            data-block-id={block.id}
            data-placeholder={BLOCK_PLACEHOLDERS.callout}
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onClick={handleContentClick}
            className={`editor-block min-w-0 flex-1 outline-none ${BLOCK_STYLE_MAP.callout}`}
          />
        </div>
      </div>
    );
  }

  const quoteBaseColor =
    block.type === "quote" && block.color && block.color !== "default"
      ? block.color.endsWith("_bg")
        ? block.color.slice(0, -3)
        : block.color
      : null;

  const quoteBgStyle =
    block.type === "quote" && isBgColor
      ? "rounded-lg py-2.5 pe-3.5"
      : "";

  const defaultTextFallback =
    block.type === "quote" && !colorClass ? "text-foreground/90" : "";

  return (
    <div
      onDragOver={(e) => onDragOverBlock(block.id, e)}
      onDrop={(e) => onDropOnBlock(block.id, e)}
      style={indentRem > 0 ? { marginInlineStart: `${indentRem}rem` } : undefined}
      className={`group relative flex items-start gap-1.5 py-0.5 ${
        isDropTarget ? "border-t-2 border-primary" : ""
      }`}
    >
      {handleButton}

      <div className="relative flex min-w-0 flex-1 items-start gap-2.5">
        {block.type === "bullet" && (
          <span
            aria-hidden="true"
            className="mt-2.5 size-1.5 shrink-0 rounded-full bg-foreground"
          />
        )}

        {block.type === "numbered" && (
          <span
            aria-hidden="true"
            className="min-w-5 shrink-0 pt-0.5 text-end text-sm font-medium text-muted select-none"
          >
            {numberedIndex ?? 1}.
          </span>
        )}

        {block.type === "todo" && (
          <input
            type="checkbox"
            checked={Boolean(block.checked)}
            aria-label="Toggle task completion"
            onChange={() => onToggleTodo(block.id)}
            className="mt-1.5 size-4 shrink-0 cursor-pointer rounded border-border"
          />
        )}

        <div
          ref={editableRef}
          contentEditable
          suppressContentEditableWarning
          data-block-id={block.id}
          data-placeholder={BLOCK_PLACEHOLDERS[block.type] ?? ""}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onClick={handleContentClick}
          style={
            block.type === "quote"
              ? {
                  borderInlineStartColor: quoteBaseColor
                    ? `var(--notion-${quoteBaseColor})`
                    : "var(--primary)",
                }
              : undefined
          }
          className={`editor-block min-w-0 flex-1 outline-none ${
            BLOCK_STYLE_MAP[block.type] ?? "text-base leading-7"
          } ${colorClass} ${defaultTextFallback} ${quoteBgStyle} ${
            block.type === "todo" && block.checked
              ? "text-muted line-through"
              : ""
          }`}
        />
      </div>
    </div>
  );
}
