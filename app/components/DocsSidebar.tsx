"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Icon } from "../assets/icons";
import type { InlineDatabase } from "../lib/database-types";
import { useDocs } from "../lib/docs-store";
import { type Doc, getDocAncestors } from "../lib/docs-utils";
import { DocTreeNode } from "./sidebar/DocTreeNode";
import { useSidebarDocDrag } from "./sidebar/useSidebarDocDrag";

function collectSubtreeIds(
  rootDocId: string,
  childrenByParent: Map<string, Doc[]>,
  dbsByParentDoc: Map<string, InlineDatabase[]>
): { docIds: string[]; dbIds: string[] } {
  const docIds: string[] = [];
  const dbIds: string[] = [];
  const visited = new Set<string>();
  const stack = [rootDocId];

  while (stack.length > 0) {
    const currentId = stack.pop()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);
    docIds.push(currentId);

    const dbs = dbsByParentDoc.get(currentId);
    if (dbs) {
      for (const db of dbs) {
        dbIds.push(db.id);
      }
    }

    const children = childrenByParent.get(currentId);
    if (children) {
      for (const child of children) {
        stack.push(child.id);
      }
    }
  }

  return { docIds, dbIds };
}

/** Collapsible Docs navigation section with draggable nested hierarchy and database view links. */
export function DocsSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const docsListId = useId();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const {
    docs,
    databases,
    createDoc,
    createDatabaseRow,
    updateDatabase,
    moveDoc,
  } = useDocs();

  const navRef = useRef<HTMLElement>(null);

  const [expanded, setExpanded] = useState(true);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set());
  const [expandedDbIds, setExpandedDbIds] = useState<Set<string>>(() => new Set());
  const [userClosedOnPath, setUserClosedOnPath] = useState<{
    path: string;
    ids: Set<string>;
  }>({ path: "", ids: new Set() });
  const [announcement, setAnnouncement] = useState("");

  const isDashboard = pathname === "/docs";
  const activeDbRouteId = pathname.startsWith("/docs/db/")
    ? decodeURIComponent(pathname.slice("/docs/db/".length).split("/")[0] ?? "") ||
      null
    : null;
  const activeViewParam = searchParams.get("view");

  const announce = useCallback((message: string) => {
    setAnnouncement("");
    window.setTimeout(() => setAnnouncement(message), 16);
  }, []);

  const expandDoc = useCallback(
    (docId: string) => {
      setCollapsedIds((prev) => {
        if (!prev.has(docId)) return prev;
        const next = new Set(prev);
        next.delete(docId);
        return next;
      });
      setUserClosedOnPath((prev) => {
        if (prev.path !== pathname || !prev.ids.has(docId)) return prev;
        const nextIds = new Set(prev.ids);
        nextIds.delete(docId);
        return { path: pathname, ids: nextIds };
      });
    },
    [pathname]
  );

  const { rootDocs, childrenByParent, dbsByParentDoc } = useMemo(() => {
    const idSet = new Set(docs.map((doc) => doc.id));
    const dbSet = new Set(databases.map((db) => db.id));
    const roots: Doc[] = [];
    const childMap = new Map<string, Doc[]>();
    const dbMap = new Map<string, InlineDatabase[]>();

    for (const db of databases) {
      if (idSet.has(db.parentDocId)) {
        const list = dbMap.get(db.parentDocId) ?? [];
        list.push(db);
        dbMap.set(db.parentDocId, list);
      }
    }

    for (const doc of docs) {
      if (doc.databaseId && dbSet.has(doc.databaseId)) {
        continue;
      }

      if (doc.parentId && idSet.has(doc.parentId) && doc.parentId !== doc.id) {
        const list = childMap.get(doc.parentId) ?? [];
        list.push(doc);
        childMap.set(doc.parentId, list);
      } else {
        roots.push(doc);
      }
    }

    return {
      rootDocs: roots,
      childrenByParent: childMap,
      dbsByParentDoc: dbMap,
    };
  }, [databases, docs]);

  // Keep active doc or active database ancestor docs expanded unless manually closed on this route.
  const effectiveCollapsedIds = useMemo(() => {
    const autoOpen = new Set<string>();
    if (activeDbRouteId) {
      const activeDb = databases.find((db) => db.id === activeDbRouteId);
      if (activeDb) {
        for (const ancestor of getDocAncestors(docs, activeDb.parentDocId)) {
          autoOpen.add(ancestor.id);
        }
      }
    } else if (pathname.startsWith("/docs/")) {
      const activeId = pathname.slice("/docs/".length).split("/")[0];
      const active = activeId ? docs.find((d) => d.id === activeId) : undefined;
      if (active) {
        for (const ancestor of getDocAncestors(docs, active.id)) {
          if (ancestor.id !== active.id) autoOpen.add(ancestor.id);
        }
      }
    }
    if (autoOpen.size === 0) return collapsedIds;

    const manuallyClosed =
      userClosedOnPath.path === pathname ? userClosedOnPath.ids : null;
    const next = new Set(collapsedIds);
    let changed = false;
    for (const id of autoOpen) {
      if (next.has(id) && !manuallyClosed?.has(id)) {
        next.delete(id);
        changed = true;
      }
    }
    return changed ? next : collapsedIds;
  }, [activeDbRouteId, collapsedIds, databases, docs, pathname, userClosedOnPath]);

  // Databases start collapsed by default and auto-expand to show views when opened.
  const effectiveExpandedDbIds = useMemo(() => {
    if (!activeDbRouteId) return expandedDbIds;
    const manuallyClosed =
      userClosedOnPath.path === pathname ? userClosedOnPath.ids : null;
    if (
      expandedDbIds.has(activeDbRouteId) ||
      manuallyClosed?.has(activeDbRouteId)
    ) {
      return expandedDbIds;
    }
    const next = new Set(expandedDbIds);
    next.add(activeDbRouteId);
    return next;
  }, [activeDbRouteId, expandedDbIds, pathname, userClosedOnPath]);

  const {
    draggedDocId,
    dropTarget,
    grabbedDocId,
    registerHandleRef,
    handleStartPointerDrag,
    handleKeyboardReorder,
    handleHandleBlur,
    handleNavClickCapture,
  } = useSidebarDocDrag({
    docs,
    rootDocs,
    childrenByParent,
    navRef,
    moveDoc,
    onExpandDoc: expandDoc,
    announce,
  });

  const handleCreateDoc = (parentId?: string) => {
    const newDoc = createDoc(parentId);
    setExpanded(true);
    if (parentId) {
      expandDoc(parentId);
    }
    onNavigate?.();
    router.push(`/docs/${newDoc.id}`);
  };

  const handleCreateDbRow = (databaseId: string) => {
    const row = createDatabaseRow(databaseId);
    if (!row) return;
    setExpanded(true);
    onNavigate?.();
    router.push(`/docs/${row.id}`);
  };

  const handleDeleteDbView = (databaseId: string, viewId: string) => {
    const db = databases.find((item) => item.id === databaseId);
    if (!db || db.locked || db.views.length <= 1) return;
    const idx = db.views.findIndex((v) => v.id === viewId);
    if (idx === -1) return;
    const remaining = db.views.filter((v) => v.id !== viewId);
    updateDatabase(db.id, { views: remaining });
    if (activeDbRouteId === db.id) {
      const currentViewId =
        activeViewParam && db.views.some((v) => v.id === activeViewParam)
          ? activeViewParam
          : db.views[0]?.id;
      if (currentViewId === viewId) {
        const nextView =
          remaining[Math.min(idx, remaining.length - 1)] ?? remaining[0];
        if (nextView) {
          router.replace(
            `/docs/db/${encodeURIComponent(db.id)}?view=${encodeURIComponent(nextView.id)}`,
            { scroll: false }
          );
        }
      }
    }
  };

  const handleToggleBranch = (id: string) => {
    const currentlyCollapsed = effectiveCollapsedIds.has(id);
    const nextCollapsed = !currentlyCollapsed;

    if (nextCollapsed) {
      const { docIds, dbIds } = collectSubtreeIds(
        id,
        childrenByParent,
        dbsByParentDoc
      );

      setCollapsedIds((prev) => {
        const next = new Set(prev);
        for (const docId of docIds) next.add(docId);
        return next;
      });

      if (dbIds.length > 0) {
        setExpandedDbIds((prev) => {
          if (!dbIds.some((dbId) => prev.has(dbId))) return prev;
          const next = new Set(prev);
          for (const dbId of dbIds) next.delete(dbId);
          return next;
        });
      }

      setUserClosedOnPath((prev) => {
        const nextIds = new Set(prev.path === pathname ? prev.ids : []);
        for (const docId of docIds) nextIds.add(docId);
        for (const dbId of dbIds) nextIds.add(dbId);
        return { path: pathname, ids: nextIds };
      });
      return;
    }

    setCollapsedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setUserClosedOnPath((prev) => {
      if (prev.path !== pathname || !prev.ids.has(id)) return prev;
      const nextIds = new Set(prev.ids);
      nextIds.delete(id);
      return { path: pathname, ids: nextIds };
    });
  };

  const handleToggleDbBranch = (dbId: string) => {
    const currentlyExpanded = effectiveExpandedDbIds.has(dbId);
    const nextExpanded = !currentlyExpanded;
    setExpandedDbIds((prev) => {
      const next = new Set(prev);
      if (nextExpanded) {
        next.add(dbId);
      } else {
        next.delete(dbId);
      }
      return next;
    });
    setUserClosedOnPath((prev) => {
      const nextIds = new Set(prev.path === pathname ? prev.ids : []);
      if (!nextExpanded) {
        nextIds.add(dbId);
      } else {
        nextIds.delete(dbId);
      }
      return { path: pathname, ids: nextIds };
    });
  };

  const isRootStartTarget =
    dropTarget?.type === "root" && dropTarget.position === "start";
  const isRootEndTarget =
    dropTarget?.type === "root" && dropTarget.position === "end";

  return (
    <nav
      ref={navRef}
      aria-label="Workspace"
      onClickCapture={handleNavClickCapture}
      className="p-3"
    >
      <div
        data-docs-root-top="true"
        className={`flex items-center gap-1 rounded-md px-1 py-1 transition-colors ${
          isDashboard ? "bg-secondary" : ""
        } ${isRootStartTarget ? "bg-secondary ring-2 ring-primary" : ""}`}
      >
        <button
          type="button"
          aria-label="Toggle Docs list"
          aria-expanded={expanded}
          aria-controls={docsListId}
          onClick={() => setExpanded((prev) => !prev)}
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
        >
          <Icon
            name="chevron-right"
            className={`size-4 transition-transform ${
              expanded ? "rotate-90" : ""
            }`}
          />
        </button>

        <Link
          href="/docs"
          draggable={false}
          onClick={onNavigate}
          aria-current={isDashboard ? "page" : undefined}
          className="min-w-0 flex-1 truncate rounded-md px-1.5 py-1 text-sm font-semibold text-foreground transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary"
        >
          Docs
        </Link>

        <button
          type="button"
          aria-label="New document"
          onClick={() => handleCreateDoc()}
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
        >
          <Icon name="plus" className="size-4" />
        </button>
      </div>

      {expanded && (
        <ul id={docsListId} className="mt-1 space-y-0.5">
          {rootDocs.length === 0 ? (
            <li className="ps-10 pe-3 py-1.5 text-xs text-muted">
              No documents yet
            </li>
          ) : (
            rootDocs.map((doc) => (
              <DocTreeNode
                key={doc.id}
                doc={doc}
                childrenByParent={childrenByParent}
                dbsByParentDoc={dbsByParentDoc}
                depth={0}
                pathname={pathname}
                activeViewParam={activeViewParam}
                collapsedIds={effectiveCollapsedIds}
                expandedDbIds={effectiveExpandedDbIds}
                draggedDocId={draggedDocId}
                dropTarget={dropTarget}
                grabbedDocId={grabbedDocId}
                onToggleBranch={handleToggleBranch}
                onToggleDbBranch={handleToggleDbBranch}
                onCreateChild={handleCreateDoc}
                onCreateDbRow={handleCreateDbRow}
                onDeleteDbView={handleDeleteDbView}
                onStartPointerDrag={handleStartPointerDrag}
                onRegisterHandleRef={registerHandleRef}
                onHandleKeyDown={handleKeyboardReorder}
                onHandleBlur={handleHandleBlur}
                onNavigate={onNavigate}
              />
            ))
          )}
        </ul>
      )}

      {draggedDocId && (
        <div
          data-docs-root-bottom="true"
          className={`mt-2 rounded-md border border-dashed px-2.5 py-2 text-center text-xs transition-colors ${
            isRootEndTarget
              ? "border-primary bg-secondary font-medium text-foreground"
              : "border-border text-muted"
          }`}
        >
          Drop here to move to Docs root
        </div>
      )}

      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </nav>
  );
}
