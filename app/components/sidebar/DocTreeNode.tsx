"use client";

import Link from "next/link";
import type React from "react";
import { useEffect, useRef } from "react";
import { Icon } from "../../assets/icons";
import type { InlineDatabase } from "../../lib/database-types";
import type { Doc, MoveDocTarget } from "../../lib/docs-utils";
import { DATABASE_VIEW_ICONS } from "../InlineDatabaseBlock";

export interface DocTreeNodeProps {
  doc: Doc;
  childrenByParent: Map<string, Doc[]>;
  dbsByParentDoc: Map<string, InlineDatabase[]>;
  depth: number;
  pathname: string;
  activeViewParam: string | null;
  collapsedIds: Set<string>;
  expandedDbIds: Set<string>;
  draggedDocId: string | null;
  dropTarget: MoveDocTarget | null;
  grabbedDocId: string | null;
  onToggleBranch: (id: string) => void;
  onToggleDbBranch: (dbId: string) => void;
  onCreateChild: (parentId: string) => void;
  onCreateDbRow: (databaseId: string) => void;
  onDeleteDbView: (databaseId: string, viewId: string) => void;
  onStartPointerDrag: (
    docId: string,
    event: React.PointerEvent<HTMLElement>,
    fromHandle: boolean
  ) => void;
  onRegisterHandleRef: (id: string, el: HTMLButtonElement | null) => void;
  onHandleKeyDown: (
    doc: Doc,
    event: React.KeyboardEvent<HTMLButtonElement>
  ) => void;
  onHandleBlur: (docId: string) => void;
  onNavigate?: () => void;
}

function getRowIndent(level: number): string {
  return `${1 + level * 0.75}rem`;
}

function getDropRowClass(
  docId: string,
  dropTarget: MoveDocTarget | null
): string {
  if (!dropTarget || dropTarget.type !== "doc" || dropTarget.targetId !== docId) {
    return "";
  }
  if (dropTarget.placement === "before") return "border-t-2 border-primary";
  if (dropTarget.placement === "after") return "border-b-2 border-primary";
  return "bg-secondary ring-2 ring-primary";
}

/** Recursive sidebar tree item rendering a document, its nested databases/views, and sub-pages. */
export function DocTreeNode({
  doc,
  childrenByParent,
  dbsByParentDoc,
  depth,
  pathname,
  activeViewParam,
  collapsedIds,
  expandedDbIds,
  draggedDocId,
  dropTarget,
  grabbedDocId,
  onToggleBranch,
  onToggleDbBranch,
  onCreateChild,
  onCreateDbRow,
  onDeleteDbView,
  onStartPointerDrag,
  onRegisterHandleRef,
  onHandleKeyDown,
  onHandleBlur,
  onNavigate,
}: DocTreeNodeProps) {
  const handleRef = useRef<HTMLButtonElement>(null);
  const children = childrenByParent.get(doc.id) ?? [];
  const childDbs = dbsByParentDoc.get(doc.id) ?? [];
  const hasChildren = children.length > 0 || childDbs.length > 0;
  const isExpanded = !collapsedIds.has(doc.id);
  const href = `/docs/${doc.id}`;
  const isActive = pathname === href;
  const title = doc.title.trim() || "Untitled";
  const isBeingDragged = draggedDocId === doc.id;
  const isGrabbed = grabbedDocId === doc.id;

  useEffect(() => {
    onRegisterHandleRef(doc.id, handleRef.current);
    return () => onRegisterHandleRef(doc.id, null);
  }, [doc.id, onRegisterHandleRef]);

  return (
    <li>
      <div
        data-doc-drop-id={doc.id}
        onPointerDown={(e) => onStartPointerDrag(doc.id, e, false)}
        className={`group flex items-center gap-0.5 rounded-md pe-1 transition-colors ${
          isActive
            ? "bg-secondary font-medium text-foreground"
            : "text-muted hover:bg-secondary/70 hover:text-foreground"
        } ${isBeingDragged ? "opacity-50" : ""} ${
          isGrabbed ? "ring-2 ring-primary" : ""
        } ${getDropRowClass(doc.id, dropTarget)}`}
        style={{ paddingInlineStart: getRowIndent(depth) }}
      >
        {hasChildren ? (
          <button
            type="button"
            aria-label={`Toggle ${title} subpages`}
            aria-expanded={isExpanded}
            onClick={() => onToggleBranch(doc.id)}
            className="inline-flex size-6 shrink-0 items-center justify-center rounded text-muted hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
          >
            <Icon
              name="chevron-right"
              className={`size-3.5 transition-transform ${
                isExpanded ? "rotate-90" : ""
              }`}
            />
          </button>
        ) : (
          <span aria-hidden="true" className="size-6 shrink-0" />
        )}

        <Link
          href={href}
          draggable={false}
          onClick={onNavigate}
          aria-current={isActive ? "page" : undefined}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-primary"
        >
          {doc.icon ? (
            <span
              aria-hidden="true"
              className="inline-flex size-4 shrink-0 items-center justify-center text-sm leading-none"
            >
              {doc.icon}
            </span>
          ) : (
            <Icon name="document" className="size-4 shrink-0 text-muted" />
          )}
          <span className="truncate">{title}</span>
        </Link>

        {doc.favorite && (
          <Icon
            name="star-solid"
            className="size-3 shrink-0 text-primary"
            label="Favorite"
          />
        )}

        <button
          ref={handleRef}
          type="button"
          aria-label={`Reorder or move ${title}`}
          aria-pressed={isGrabbed}
          onPointerDown={(e) => {
            e.stopPropagation();
            onStartPointerDrag(doc.id, e, true);
          }}
          onKeyDown={(e) => onHandleKeyDown(doc, e)}
          onBlur={() => onHandleBlur(doc.id)}
          className={`doc-drag-handle inline-flex size-6 shrink-0 cursor-grab items-center justify-center rounded text-muted transition-opacity hover:bg-secondary hover:text-foreground focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-primary ${
            isGrabbed
              ? "bg-secondary text-foreground opacity-100"
              : "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
          }`}
        >
          <Icon name="grip" className="size-3.5" />
        </button>

        <button
          type="button"
          aria-label={`New doc inside ${title}`}
          onClick={() => onCreateChild(doc.id)}
          className="inline-flex size-6 shrink-0 items-center justify-center rounded text-muted opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-secondary hover:text-foreground focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-primary"
        >
          <Icon name="plus" className="size-3.5" />
        </button>
      </div>

      {hasChildren && isExpanded && (
        <ul className="mt-0.5 space-y-0.5">
          {childDbs.map((db) => {
            const dbHref = `/docs/db/${encodeURIComponent(db.id)}`;
            const isDbActive = pathname === dbHref;
            const dbExpanded = expandedDbIds.has(db.id);
            const hasViews = db.views.length > 0;
            const activeViewIdForDb = isDbActive
              ? activeViewParam &&
                db.views.some((v) => v.id === activeViewParam)
                ? activeViewParam
                : (db.views[0]?.id ?? null)
              : null;

            return (
              <li key={db.id}>
                <div
                  className={`group flex items-center gap-0.5 rounded-md pe-1 transition-colors ${
                    isDbActive && !dbExpanded
                      ? "bg-secondary font-medium text-foreground"
                      : isDbActive
                        ? "font-medium text-foreground hover:bg-secondary/70"
                        : "text-muted hover:bg-secondary/70 hover:text-foreground"
                  }`}
                  style={{ paddingInlineStart: getRowIndent(depth + 1) }}
                >
                  {hasViews ? (
                    <button
                      type="button"
                      aria-label={`Toggle ${db.title} views`}
                      aria-expanded={dbExpanded}
                      onClick={() => onToggleDbBranch(db.id)}
                      className="inline-flex size-6 shrink-0 items-center justify-center rounded text-muted hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      <Icon
                        name="chevron-right"
                        className={`size-3.5 transition-transform ${
                          dbExpanded ? "rotate-90" : ""
                        }`}
                      />
                    </button>
                  ) : (
                    <span aria-hidden="true" className="size-6 shrink-0" />
                  )}

                  <Link
                    href={dbHref}
                    draggable={false}
                    onClick={onNavigate}
                    aria-current={
                      isDbActive && !dbExpanded ? "page" : undefined
                    }
                    className="flex min-w-0 flex-1 items-center gap-1.5 rounded py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    {db.icon ? (
                      <span
                        aria-hidden="true"
                        className="inline-flex size-4 shrink-0 items-center justify-center text-sm leading-none"
                      >
                        {db.icon}
                      </span>
                    ) : (
                      <Icon
                        name="database"
                        className="size-3.5 shrink-0 text-muted"
                      />
                    )}
                    <span className="truncate font-medium">{db.title}</span>
                  </Link>

                  {!db.locked && (
                    <button
                      type="button"
                      aria-label={`New entry in ${db.title}`}
                      onClick={() => onCreateDbRow(db.id)}
                      className="inline-flex size-6 shrink-0 items-center justify-center rounded text-muted opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-secondary hover:text-foreground focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      <Icon name="plus" className="size-3.5" />
                    </button>
                  )}
                </div>

                {dbExpanded && hasViews && (
                  <ul className="mt-0.5 space-y-0.5">
                    {db.views.map((view) => {
                      const viewHref = `${dbHref}?view=${encodeURIComponent(view.id)}`;
                      const isViewActive =
                        isDbActive && activeViewIdForDb === view.id;
                      return (
                        <li key={view.id}>
                          <div
                            className={`group/view flex items-center gap-0.5 rounded-md pe-1 transition-colors ${
                              isViewActive
                                ? "bg-secondary font-medium text-foreground"
                                : "text-muted hover:bg-secondary/70 hover:text-foreground"
                            }`}
                            style={{
                              paddingInlineStart: getRowIndent(depth + 2),
                            }}
                          >
                            <span
                              aria-hidden="true"
                              className="size-6 shrink-0"
                            />
                            <Link
                              href={viewHref}
                              draggable={false}
                              onClick={onNavigate}
                              aria-current={isViewActive ? "page" : undefined}
                              className="flex min-w-0 flex-1 items-center gap-1.5 rounded py-1 text-sm focus-visible:outline-2 focus-visible:outline-primary"
                            >
                              <Icon
                                name={DATABASE_VIEW_ICONS[view.type]}
                                className="size-3.5 shrink-0"
                              />
                              <span className="truncate">{view.name}</span>
                            </Link>
                            {!db.locked && db.views.length > 1 && (
                              <button
                                type="button"
                                aria-label={`Remove ${view.name} view`}
                                onClick={() => onDeleteDbView(db.id, view.id)}
                                className="inline-flex size-6 shrink-0 items-center justify-center rounded text-muted opacity-0 transition-opacity group-focus-within/view:opacity-100 group-hover/view:opacity-100 hover:bg-secondary hover:text-danger focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-primary"
                              >
                                <Icon name="trash" className="size-3" />
                              </button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}

          {children.map((child) => (
            <DocTreeNode
              key={child.id}
              doc={child}
              childrenByParent={childrenByParent}
              dbsByParentDoc={dbsByParentDoc}
              depth={depth + 1}
              pathname={pathname}
              activeViewParam={activeViewParam}
              collapsedIds={collapsedIds}
              expandedDbIds={expandedDbIds}
              draggedDocId={draggedDocId}
              dropTarget={dropTarget}
              grabbedDocId={grabbedDocId}
              onToggleBranch={onToggleBranch}
              onToggleDbBranch={onToggleDbBranch}
              onCreateChild={onCreateChild}
              onCreateDbRow={onCreateDbRow}
              onDeleteDbView={onDeleteDbView}
              onStartPointerDrag={onStartPointerDrag}
              onRegisterHandleRef={onRegisterHandleRef}
              onHandleKeyDown={onHandleKeyDown}
              onHandleBlur={onHandleBlur}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
