"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useMemo, useState } from "react";
import { Icon } from "../assets/icons";
import { useTodos } from "../lib/todos-store";
import { updateUiPrefs, useUiPrefs } from "../lib/ui-prefs";
import {
  buildProjectTree,
  getProjectAncestors,
  projectDisplayName,
  type TodoProject,
} from "../lib/todos-utils";

function getRowIndent(level: number): string {
  return `${1 + level * 0.75}rem`;
}

interface ProjectTreeNodeProps {
  project: TodoProject;
  childrenByParent: Map<string, TodoProject[]>;
  depth: number;
  pathname: string;
  collapsedIds: Set<string>;
  countByProject: Map<string, number>;
  onToggle: (id: string) => void;
  onAddTask: (projectId: string) => void;
  onNavigate?: () => void;
}

function ProjectTreeNode({
  project,
  childrenByParent,
  depth,
  pathname,
  collapsedIds,
  countByProject,
  onToggle,
  onAddTask,
  onNavigate,
}: ProjectTreeNodeProps) {
  const children = childrenByParent.get(project.id) ?? [];
  const hasChildren = children.length > 0;
  const isExpanded = !collapsedIds.has(project.id);
  const href = `/todos/project/${encodeURIComponent(project.id)}`;
  const isActive = pathname === href;
  const name = projectDisplayName(project);
  const count = countByProject.get(project.id) ?? 0;

  return (
    <li>
      <div
        className={`group flex items-center gap-0.5 rounded-md pe-1 transition-colors ${
          isActive
            ? "bg-secondary font-medium text-foreground"
            : "text-muted hover:bg-secondary/70 hover:text-foreground"
        }`}
        style={{ paddingInlineStart: getRowIndent(depth) }}
      >
        {hasChildren ? (
          <button
            type="button"
            aria-label={`Toggle ${name} sub-projects`}
            aria-expanded={isExpanded}
            onClick={() => onToggle(project.id)}
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
          onClick={onNavigate}
          aria-current={isActive ? "page" : undefined}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-primary"
        >
          {project.icon ? (
            <span
              aria-hidden="true"
              className="inline-flex size-4 shrink-0 items-center justify-center text-sm leading-none"
            >
              {project.icon}
            </span>
          ) : (
            <span
              aria-hidden="true"
              className="inline-flex size-4 shrink-0 items-center justify-center"
              style={{ color: `var(--notion-${project.color})` }}
            >
              <Icon name="hash" className="size-3.5" />
            </span>
          )}
          <span className="truncate">{name}</span>
          {project.favorite && (
            <span
              aria-label="Favorite"
              className="inline-flex shrink-0 items-center"
              style={{ color: "var(--notion-yellow)" }}
            >
              <Icon name="star-solid" className="size-3" />
            </span>
          )}
        </Link>

        {count > 0 && (
          <span
            className="shrink-0 px-1 text-[11px] tabular-nums text-muted group-focus-within:hidden group-hover:hidden"
            aria-label={`${count} open ${count === 1 ? "task" : "tasks"}`}
          >
            {count}
          </span>
        )}

        <button
          type="button"
          aria-label={`Add task to ${name}`}
          title="Add task"
          onClick={() => onAddTask(project.id)}
          className="inline-flex size-6 shrink-0 items-center justify-center rounded text-muted opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-secondary hover:text-foreground focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-primary"
        >
          <Icon name="plus" className="size-3.5" />
        </button>
      </div>

      {hasChildren && isExpanded && (
        <ul className="mt-0.5 space-y-0.5">
          {children.map((child) => (
            <ProjectTreeNode
              key={child.id}
              project={child}
              childrenByParent={childrenByParent}
              depth={depth + 1}
              pathname={pathname}
              collapsedIds={collapsedIds}
              countByProject={countByProject}
              onToggle={onToggle}
              onAddTask={onAddTask}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/** Collapsible Todoist-style Todos navigation section with Inbox and nested projects. */
export function TodosSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const listId = useId();
  const pathname = usePathname();
  const {
    projects,
    inboxCount,
    todayCount,
    overdueCount,
    countByProject,
    openQuickAdd,
    openProjectDialog,
  } = useTodos();

  const uiPrefs = useUiPrefs();
  const expanded = uiPrefs.todosSectionExpanded ?? true;
  const collapsedIds = useMemo(
    () => new Set(uiPrefs.todosCollapsedIds ?? []),
    [uiPrefs.todosCollapsedIds],
  );
  const [userClosedOnPath, setUserClosedOnPath] = useState<{
    path: string;
    ids: Set<string>;
  }>({ path: "", ids: new Set() });

  const isTodosHome = pathname === "/todos";
  const isInbox = pathname === "/todos/inbox";
  const isTodosRoute =
    pathname === "/todos" || pathname.startsWith("/todos/");
  const activeProjectId = pathname.startsWith("/todos/project/")
    ? decodeURIComponent(
        pathname.slice("/todos/project/".length).split("/")[0] ?? ""
      )
    : null;

  const { roots, childrenByParent } = useMemo(
    () => buildProjectTree(projects),
    [projects]
  );

  // Keep the active project's ancestors open unless manually collapsed on this route.
  const effectiveCollapsedIds = useMemo(() => {
    if (!activeProjectId) return collapsedIds;
    const manuallyClosed =
      userClosedOnPath.path === pathname ? userClosedOnPath.ids : null;
    const next = new Set(collapsedIds);
    let changed = false;
    for (const ancestor of getProjectAncestors(projects, activeProjectId)) {
      if (ancestor.id === activeProjectId) continue;
      if (next.has(ancestor.id) && !manuallyClosed?.has(ancestor.id)) {
        next.delete(ancestor.id);
        changed = true;
      }
    }
    return changed ? next : collapsedIds;
  }, [activeProjectId, collapsedIds, pathname, projects, userClosedOnPath]);

  const handleToggleProjectBranch = (id: string) => {
    const nextCollapsed = !effectiveCollapsedIds.has(id);
    updateUiPrefs((prev) => {
      const next = new Set(prev.todosCollapsedIds ?? []);
      if (nextCollapsed) next.add(id);
      else next.delete(id);
      return { ...prev, todosCollapsedIds: Array.from(next) };
    });
    setUserClosedOnPath((prev) => {
      const ids = new Set(prev.path === pathname ? prev.ids : []);
      if (nextCollapsed) ids.add(id);
      else ids.delete(id);
      return { path: pathname, ids };
    });
  };

  return (
    <nav aria-label="Todos" className="px-3 pb-3">
      <div
        className={`flex items-center gap-1 rounded-md px-1 py-1 transition-colors ${
          isTodosHome || (!expanded && isTodosRoute) ? "bg-secondary" : ""
        }`}
      >
        <button
          type="button"
          aria-label="Toggle Todos section"
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() =>
            updateUiPrefs((prev) => ({
              ...prev,
              todosSectionExpanded: !(prev.todosSectionExpanded ?? true),
            }))
          }
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
          href="/todos"
          onClick={onNavigate}
          aria-current={
            isTodosHome || (!expanded && isTodosRoute) ? "page" : undefined
          }
          className="min-w-0 flex-1 truncate rounded-md px-1.5 py-1 text-sm font-semibold text-foreground transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary"
        >
          Todos
        </Link>

        {todayCount > 0 && (
          <span
            aria-label={`${todayCount} due today${overdueCount > 0 ? ` (${overdueCount} overdue)` : ""}`}
            className={`shrink-0 px-1 text-[11px] tabular-nums ${
              overdueCount > 0 ? "font-medium text-danger" : "text-muted"
            }`}
          >
            {todayCount}
          </span>
        )}

        <button
          type="button"
          aria-label="New project"
          title="New project"
          onClick={() => {
            updateUiPrefs((prev) => ({ ...prev, todosSectionExpanded: true }));
            onNavigate?.();
            openProjectDialog({ mode: "create" });
          }}
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
        >
          <Icon name="plus" className="size-4" />
        </button>
      </div>

      {expanded && (
        <ul id={listId} className="mt-1 space-y-0.5">
          <li>
            <div
              className={`group flex items-center gap-0.5 rounded-md pe-1 transition-colors ${
                isInbox
                  ? "bg-secondary font-medium text-foreground"
                  : "text-muted hover:bg-secondary/70 hover:text-foreground"
              }`}
              style={{ paddingInlineStart: getRowIndent(0) }}
            >
              <span aria-hidden="true" className="size-6 shrink-0" />

              <Link
                href="/todos/inbox"
                onClick={onNavigate}
                aria-current={isInbox ? "page" : undefined}
                className="flex min-w-0 flex-1 items-center gap-1.5 rounded py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-primary"
              >
                <Icon
                  name="inbox"
                  className={`size-4 shrink-0 ${
                    isInbox ? "text-primary" : "text-muted"
                  }`}
                />
                <span className="truncate">Inbox</span>
              </Link>

              {inboxCount > 0 && (
                <span
                  className="shrink-0 px-1 text-[11px] tabular-nums text-muted group-focus-within:hidden group-hover:hidden"
                  aria-label={`${inboxCount} open ${inboxCount === 1 ? "task" : "tasks"}`}
                >
                  {inboxCount}
                </span>
              )}

              <button
                type="button"
                aria-label="Add task to Inbox"
                title="Add task"
                onClick={() => {
                  onNavigate?.();
                  openQuickAdd({ defaultProjectId: null });
                }}
                className="inline-flex size-6 shrink-0 items-center justify-center rounded text-muted opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-secondary hover:text-foreground focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-primary"
              >
                <Icon name="plus" className="size-3.5" />
              </button>
            </div>
          </li>

          {roots.map((project) => (
            <ProjectTreeNode
              key={project.id}
              project={project}
              childrenByParent={childrenByParent}
              depth={0}
              pathname={pathname}
              collapsedIds={effectiveCollapsedIds}
              countByProject={countByProject}
              onToggle={handleToggleProjectBranch}
              onAddTask={(projectId) => {
                onNavigate?.();
                openQuickAdd({ defaultProjectId: projectId });
              }}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      )}
    </nav>
  );
}
