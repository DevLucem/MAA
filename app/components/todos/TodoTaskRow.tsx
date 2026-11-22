"use client";

import Link from "next/link";
import { type DragEvent, useId, useMemo, useRef, useState } from "react";
import { Icon } from "../../assets/icons";
import { NOTION_COLOR_PILL_CLASS } from "../../lib/database-types";
import { useTodos } from "../../lib/todos-store";
import {
  addDaysIso,
  buildTodoProjectHref,
  flattenProjectTree,
  formatRecurrenceLabel,
  formatTodoDueLabel,
  getNextWeekMondayIso,
  PRIORITY_META,
  projectDisplayName,
  type TodoPriority,
  type TodoTask,
} from "../../lib/todos-utils";
import { useDismissible } from "../../lib/use-dismissible";
import { TodoTaskComposer } from "./TodoTaskComposer";

export interface TodoTaskRowProps {
  task: TodoTask;
  variant?: "list" | "card";
  showProject?: boolean;
  showSection?: boolean;
  todayIso: string;
  subtasks?: TodoTask[];
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  draggable?: boolean;
  onDragStart?: (event: DragEvent<HTMLElement>) => void;
  onDragOver?: (event: DragEvent<HTMLElement>) => void;
  onDrop?: (event: DragEvent<HTMLElement>) => void;
}

/** Single Todoist task row/card with priority checkbox, inline metadata, quick actions, and expandable sub-tasks. */
export function TodoTaskRow({
  task,
  variant = "list",
  showProject = false,
  showSection = false,
  todayIso,
  subtasks = [],
  onMoveUp,
  onMoveDown,
  draggable = false,
  onDragStart,
  onDragOver,
  onDrop,
}: TodoTaskRowProps) {
  const checkboxId = useId();
  const {
    projects,
    sections,
    labels,
    getProject,
    toggleTaskComplete,
    updateTask,
    duplicateTask,
    deleteTask,
    openTaskModal,
  } = useTodos();

  const [editing, setEditing] = useState(false);
  const [expandedSubtasks, setExpandedSubtasks] = useState(false);
  const [dateMenuOpen, setDateMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  const dateMenuRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  useDismissible(dateMenuOpen, [dateMenuRef], () => setDateMenuOpen(false));
  useDismissible(moreMenuOpen, [moreMenuRef], () => setMoreMenuOpen(false));

  const project = task.projectId ? getProject(task.projectId) : undefined;
  const section =
    task.sectionId && task.projectId
      ? sections.find(
          (s) => s.id === task.sectionId && s.projectId === task.projectId
        )
      : undefined;
  const flattenedProjects = useMemo(
    () => flattenProjectTree(projects),
    [projects]
  );

  const labelColorByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const lbl of labels) {
      map.set(lbl.name, NOTION_COLOR_PILL_CLASS[lbl.color]);
    }
    return map;
  }, [labels]);

  const dueInfo = useMemo(() => {
    if (!task.dueDate) return null;
    return formatTodoDueLabel(task.dueDate, task.dueTime, todayIso);
  }, [task.dueDate, task.dueTime, todayIso]);

  const completedSubtaskCount = subtasks.filter((s) => s.completed).length;
  const commentCount = task.comments?.length ?? 0;

  if (editing) {
    return (
      <div className={variant === "card" ? "py-1" : "py-1.5"}>
        <TodoTaskComposer
          mode="edit"
          task={task}
          compact
          onCancel={() => setEditing(false)}
          onSaved={() => setEditing(false)}
        />
      </div>
    );
  }

  const dueToneClass =
    dueInfo?.tone === "overdue"
      ? "text-danger"
      : dueInfo?.tone === "today"
        ? "text-success"
        : dueInfo?.tone === "tomorrow"
          ? "notion-text-orange"
          : dueInfo?.tone === "upcoming"
            ? "notion-text-purple"
            : "text-muted";

  const isCard = variant === "card";

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={
        isCard
          ? "group relative rounded-lg border border-border bg-canvas p-3 transition-colors hover:border-muted/60"
          : "group relative border-b border-border/70 py-2.5 transition-colors last:border-b-0 hover:bg-surface/60"
      }
    >
      <div className="flex items-start gap-2.5">
        <label
          htmlFor={checkboxId}
          className="inline-flex size-11 -m-3 shrink-0 cursor-pointer items-center justify-center"
        >
          <input
            id={checkboxId}
            type="checkbox"
            checked={task.completed}
            data-priority={task.priority}
            aria-label={
              task.completed
                ? `Mark "${task.title}" incomplete`
                : `Complete "${task.title}"`
            }
            onChange={() => toggleTaskComplete(task.id)}
            className="todo-checkbox text-base"
          />
        </label>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <button
              type="button"
              onClick={() => openTaskModal(task.id)}
              className="min-w-0 flex-1 rounded text-start focus-visible:outline-2 focus-visible:outline-primary"
            >
              <span
                className={`block text-sm leading-snug ${
                  task.completed
                    ? "text-muted line-through"
                    : "font-normal text-foreground"
                }`}
              >
                {task.title}
              </span>
              {task.description && (
                <span className="mt-0.5 line-clamp-2 block text-xs text-muted">
                  {task.description}
                </span>
              )}
            </button>

            {/* Quick hover/focus actions */}
            <div
              className={`flex shrink-0 items-center gap-0.5 transition-opacity ${
                dateMenuOpen || moreMenuOpen
                  ? "opacity-100"
                  : "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
              }`}
            >
              <button
                type="button"
                aria-label={`Edit "${task.title}"`}
                title="Edit task"
                onClick={() => setEditing(true)}
                className="inline-flex size-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
              >
                <Icon name="edit" className="size-3.5" />
              </button>

              {/* Quick schedule popover */}
              <div ref={dateMenuRef} className="relative">
                <button
                  type="button"
                  aria-label={`Schedule "${task.title}"`}
                  aria-expanded={dateMenuOpen}
                  title="Schedule"
                  onClick={() => {
                    setMoreMenuOpen(false);
                    setDateMenuOpen((prev) => !prev);
                  }}
                  className="inline-flex size-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <Icon name="calendar" className="size-3.5" />
                </button>

                {dateMenuOpen && (
                  <div
                    role="dialog"
                    aria-label="Quick schedule"
                    className="absolute end-0 top-full z-30 mt-1 w-44 rounded-lg border border-border bg-canvas p-1.5 shadow-lg"
                  >
                    {todayIso && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            updateTask(task.id, { dueDate: todayIso });
                            setDateMenuOpen(false);
                          }}
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-foreground hover:bg-secondary"
                        >
                          <Icon name="calendar" className="size-3.5 text-success" />
                          Today
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            updateTask(task.id, {
                              dueDate: addDaysIso(todayIso, 1),
                            });
                            setDateMenuOpen(false);
                          }}
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-foreground hover:bg-secondary"
                        >
                          <Icon
                            name="sun"
                            className="size-3.5 notion-text-orange"
                          />
                          Tomorrow
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            updateTask(task.id, {
                              dueDate: getNextWeekMondayIso(todayIso),
                            });
                            setDateMenuOpen(false);
                          }}
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-foreground hover:bg-secondary"
                        >
                          <Icon
                            name="calendar"
                            className="size-3.5 notion-text-purple"
                          />
                          Next week
                        </button>
                      </>
                    )}
                    {task.dueDate && (
                      <button
                        type="button"
                        onClick={() => {
                          updateTask(task.id, {
                            dueDate: undefined,
                            dueTime: undefined,
                            recurrence: undefined,
                          });
                          setDateMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted hover:bg-secondary hover:text-danger"
                      >
                        <Icon name="x" className="size-3.5" />
                        No date
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* More task actions */}
              <div ref={moreMenuRef} className="relative">
                <button
                  type="button"
                  aria-label={`More actions for "${task.title}"`}
                  aria-expanded={moreMenuOpen}
                  title="More actions"
                  onClick={() => {
                    setDateMenuOpen(false);
                    setMoreMenuOpen((prev) => !prev);
                  }}
                  className="inline-flex size-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <Icon name="ellipsis" className="size-3.5" />
                </button>

                {moreMenuOpen && (
                  <div
                    role="dialog"
                    aria-label="Task actions"
                    className="absolute end-0 top-full z-30 mt-1 w-52 rounded-lg border border-border bg-canvas p-1.5 shadow-lg"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setMoreMenuOpen(false);
                        openTaskModal(task.id);
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-foreground hover:bg-secondary"
                    >
                      <Icon name="edit" className="size-3.5 text-muted" />
                      Open task details
                    </button>

                    <div className="my-1 border-t border-border pt-1.5">
                      <p className="px-2 pb-1 text-[10px] font-semibold tracking-wider text-muted uppercase">
                        Priority
                      </p>
                      <div className="grid grid-cols-4 gap-1 px-1">
                        {([1, 2, 3, 4] as const).map((lvl: TodoPriority) => (
                          <button
                            key={lvl}
                            type="button"
                            aria-label={PRIORITY_META[lvl].label}
                            title={PRIORITY_META[lvl].label}
                            onClick={() => {
                              updateTask(task.id, { priority: lvl });
                              setMoreMenuOpen(false);
                            }}
                            className={`inline-flex h-7 items-center justify-center rounded-md border text-xs ${
                              task.priority === lvl
                                ? "border-primary bg-secondary font-medium"
                                : "border-transparent hover:bg-secondary"
                            }`}
                          >
                            <span style={{ color: PRIORITY_META[lvl].colorVar }}>
                              <Icon name="flag" className="size-3.5" />
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {!task.parentId && (
                      <div className="my-1 border-t border-border pt-1.5 px-1">
                        <label className="block px-1 pb-1 text-[10px] font-semibold tracking-wider text-muted uppercase">
                          Move to
                        </label>
                        <select
                          aria-label="Move task to project"
                          value={task.projectId ?? "__inbox__"}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateTask(task.id, {
                              projectId: val === "__inbox__" ? null : val,
                              sectionId: null,
                            });
                            setMoreMenuOpen(false);
                          }}
                          className="h-7 w-full rounded-md border border-border bg-surface px-2 text-xs text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                        >
                          <option value="__inbox__">Inbox</option>
                          {flattenedProjects.map(({ project: p, depth }) => (
                            <option key={p.id} value={p.id}>
                              {"\u00A0".repeat(depth * 2)}
                              {projectDisplayName(p)}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {(onMoveUp || onMoveDown) && (
                      <div className="my-1 flex gap-1 border-t border-border pt-1">
                        {onMoveUp && (
                          <button
                            type="button"
                            onClick={() => {
                              onMoveUp();
                              setMoreMenuOpen(false);
                            }}
                            className="flex-1 rounded-md px-2 py-1 text-xs text-foreground hover:bg-secondary"
                          >
                            Move up
                          </button>
                        )}
                        {onMoveDown && (
                          <button
                            type="button"
                            onClick={() => {
                              onMoveDown();
                              setMoreMenuOpen(false);
                            }}
                            className="flex-1 rounded-md px-2 py-1 text-xs text-foreground hover:bg-secondary"
                          >
                            Move down
                          </button>
                        )}
                      </div>
                    )}

                    <hr className="my-1 border-border" />

                    <button
                      type="button"
                      onClick={() => {
                        duplicateTask(task.id);
                        setMoreMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-foreground hover:bg-secondary"
                    >
                      <Icon name="copy" className="size-3.5 text-muted" />
                      Duplicate
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setMoreMenuOpen(false);
                        deleteTask(task.id);
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-danger hover:bg-danger/10"
                    >
                      <Icon name="trash" className="size-3.5" />
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Metadata chips row */}
          {(subtasks.length > 0 ||
            dueInfo ||
            commentCount > 0 ||
            task.labels.length > 0 ||
            showProject ||
            (showSection && !showProject && Boolean(section))) && (
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                {subtasks.length > 0 && (
                  <button
                    type="button"
                    aria-expanded={expandedSubtasks}
                    onClick={() => setExpandedSubtasks((prev) => !prev)}
                    className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-[11px] text-muted transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    <Icon name="subtasks" className="size-3" />
                    <span className="tabular-nums">
                      {completedSubtaskCount}/{subtasks.length}
                    </span>
                    <Icon
                      name="chevron-right"
                      className={`size-3 transition-transform ${
                        expandedSubtasks ? "rotate-90" : ""
                      }`}
                    />
                  </button>
                )}

                {dueInfo && (
                  <span
                    className={`inline-flex items-center gap-1 text-[11px] font-medium ${dueToneClass}`}
                    title={
                      task.recurrence
                        ? formatRecurrenceLabel(task.recurrence)
                        : task.dueDate
                    }
                  >
                    <Icon name="calendar" className="size-3" />
                    <span>{dueInfo.label}</span>
                    {task.recurrence && (
                      <Icon name="repeat" className="size-3" />
                    )}
                  </span>
                )}

                {commentCount > 0 && (
                  <button
                    type="button"
                    onClick={() => openTaskModal(task.id)}
                    className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-foreground"
                  >
                    <span>
                      {commentCount}{" "}
                      {commentCount === 1 ? "comment" : "comments"}
                    </span>
                  </button>
                )}

                {task.labels.map((lbl) => (
                  <span
                    key={lbl}
                    className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                      labelColorByName.get(lbl) ?? "notion-pill-default"
                    }`}
                  >
                    @{lbl}
                  </span>
                ))}
              </div>

              {showProject && (
                <Link
                  href={
                    project
                      ? `/todos/project/${encodeURIComponent(project.id)}`
                      : "/todos/inbox"
                  }
                  className="ms-auto inline-flex items-center gap-1 rounded px-1 py-0.5 text-[11px] text-muted transition-colors hover:bg-secondary hover:text-foreground"
                >
                  {project ? (
                    project.icon ? (
                      <span aria-hidden="true" className="leading-none">
                        {project.icon}
                      </span>
                    ) : (
                      <span
                        aria-hidden="true"
                        className="inline-flex items-center"
                        style={{ color: `var(--notion-${project.color})` }}
                      >
                        <Icon name="hash" className="size-3" />
                      </span>
                    )
                  ) : (
                    <Icon name="inbox" className="size-3 text-muted" />
                  )}
                  <span className="max-w-28 truncate">
                    {project ? projectDisplayName(project) : "Inbox"}
                  </span>
                </Link>
              )}

              {showSection && !showProject && section && task.projectId && (
                <Link
                  href={buildTodoProjectHref(task.projectId, section.id)}
                  className="ms-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <span className="max-w-32 truncate">{section.name}</span>
                </Link>
              )}
            </div>
          )}

          {/* Expandable inline sub-tasks */}
          {expandedSubtasks && subtasks.length > 0 && (
            <ul className="mt-2 space-y-1 border-s-2 border-border ps-3">
              {subtasks.map((sub) => {
                const subDue = sub.dueDate
                  ? formatTodoDueLabel(sub.dueDate, sub.dueTime, todayIso)
                  : null;
                return (
                  <li key={sub.id} className="flex items-center gap-2 py-0.5">
                    <label className="inline-flex size-8 -m-1.5 shrink-0 cursor-pointer items-center justify-center">
                      <input
                        type="checkbox"
                        checked={sub.completed}
                        data-priority={sub.priority}
                        aria-label={
                          sub.completed
                            ? `Mark "${sub.title}" incomplete`
                            : `Complete "${sub.title}"`
                        }
                        onChange={() => toggleTaskComplete(sub.id)}
                        className="todo-checkbox text-sm"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => openTaskModal(sub.id)}
                      className={`min-w-0 flex-1 truncate text-start text-xs focus-visible:outline-2 focus-visible:outline-primary ${
                        sub.completed
                          ? "text-muted line-through"
                          : "text-foreground hover:text-primary"
                      }`}
                    >
                      {sub.title}
                    </button>
                    {subDue && (
                      <span className="shrink-0 text-[10px] text-muted">
                        {subDue.label}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
