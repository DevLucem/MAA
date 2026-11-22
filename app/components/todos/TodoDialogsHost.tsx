"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Icon } from "../../assets/icons";
import { useAgent } from "../../lib/agent-store";
import { NOTION_COLOR_PILL_CLASS, type NotionColor } from "../../lib/database-types";
import { useTodos } from "../../lib/todos-store";
import {
  addDaysIso,
  flattenProjectTree,
  formatRecurrenceLabel,
  formatTodoDueLabel,
  normalizeLabelName,
  PRIORITY_META,
  PROJECT_COLORS,
  projectDisplayName,
  type TodoPriority,
  type TodoProject,
  type TodoRecurrence,
  type TodoTask,
  type TodoViewLayout,
} from "../../lib/todos-utils";
import { useTodayIsoDate } from "../../lib/use-client-date";
import { useDismissible } from "../../lib/use-dismissible";
import { IconPickerPopover } from "../IconPickerPopover";
import { TodoTaskComposer } from "./TodoTaskComposer";

function useDialogLightDismissFallback(
  dialogRef: React.RefObject<HTMLDialogElement | null>,
  active: boolean
) {
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !active) return;
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
    const onDown = (event: PointerEvent) => {
      pressedOutside = isOutside(event);
    };
    const onUp = (event: PointerEvent) => {
      if (pressedOutside && isOutside(event)) {
        dialog.close();
      }
      pressedOutside = false;
    };

    dialog.addEventListener("pointerdown", onDown);
    dialog.addEventListener("pointerup", onUp);
    return () => {
      dialog.removeEventListener("pointerdown", onDown);
      dialog.removeEventListener("pointerup", onUp);
    };
  }, [active, dialogRef]);
}

function TodoQuickAddDialog() {
  const { quickAddRequest, closeQuickAdd } = useTodos();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const isOpen = quickAddRequest !== null;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  useDialogLightDismissFallback(dialogRef, isOpen);

  if (!quickAddRequest) return null;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      {...({ closedby: "any" } as Record<string, string>)}
      onClose={closeQuickAdd}
      className="settings-dialog m-auto w-[min(92vw,36rem)] overflow-visible rounded-xl border border-border bg-surface p-0 text-foreground shadow-2xl"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 id={titleId} className="text-sm font-semibold text-foreground">
          Add task
        </h2>
        <button
          type="button"
          aria-label="Close add task dialog"
          onClick={closeQuickAdd}
          className="inline-flex size-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
        >
          <Icon name="x" className="size-4" />
        </button>
      </div>

      <div className="p-4">
        <TodoTaskComposer
          mode="create"
          defaultProjectId={quickAddRequest.defaultProjectId ?? null}
          defaultSectionId={quickAddRequest.defaultSectionId ?? null}
          defaultDueDate={quickAddRequest.defaultDueDate ?? ""}
          defaultPriority={quickAddRequest.defaultPriority ?? 4}
          defaultLabels={quickAddRequest.defaultLabels ?? []}
          onCancel={closeQuickAdd}
          onSaved={closeQuickAdd}
        />
      </div>
    </dialog>
  );
}

const RECURRENCE_OPTIONS: ReadonlyArray<{
  id: string;
  label: string;
  value?: TodoRecurrence;
}> = [
  { id: "none", label: "No repeat" },
  { id: "daily", label: "Every day", value: { frequency: "daily", interval: 1 } },
  {
    id: "weekdays",
    label: "Every weekday",
    value: { frequency: "weekdays", interval: 1 },
  },
  { id: "weekly", label: "Every week", value: { frequency: "weekly", interval: 1 } },
  {
    id: "biweekly",
    label: "Every 2 weeks",
    value: { frequency: "weekly", interval: 2 },
  },
  {
    id: "monthly",
    label: "Every month",
    value: { frequency: "monthly", interval: 1 },
  },
  { id: "yearly", label: "Every year", value: { frequency: "yearly", interval: 1 } },
];

function getRecurrenceOptionId(rec: TodoRecurrence | undefined): string {
  if (!rec) return "none";
  if (rec.frequency === "daily" && rec.interval === 1) return "daily";
  if (rec.frequency === "weekdays") return "weekdays";
  if (rec.frequency === "weekly" && rec.interval === 1) return "weekly";
  if (rec.frequency === "weekly" && rec.interval === 2) return "biweekly";
  if (rec.frequency === "monthly" && rec.interval === 1) return "monthly";
  if (rec.frequency === "yearly" && rec.interval === 1) return "yearly";
  return "custom";
}

function TodoTaskDetailInner({ task }: { task: TodoTask }) {
  const router = useRouter();
  const todayIso = useTodayIsoDate() ?? "";
  const {
    projects,
    sections,
    labels,
    tasks,
    getProject,
    getTask,
    upsertLabel,
    updateTask,
    duplicateTask,
    deleteTask,
    toggleTaskComplete,
    addComment,
    deleteComment,
    openTaskModal,
    closeTaskModal,
  } = useTodos();

  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();
  const commentInputId = useId();
  const newLabelId = useId();

  const [draftTitle, setDraftTitle] = useState(task.title);
  const [draftDescription, setDraftDescription] = useState(
    task.description ?? ""
  );
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [labelInput, setLabelInput] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
  }, []);

  useDialogLightDismissFallback(dialogRef, true);

  const project = task.projectId ? getProject(task.projectId) : undefined;
  const parentTask = task.parentId ? getTask(task.parentId) : undefined;
  const flattenedProjects = useMemo(
    () => flattenProjectTree(projects),
    [projects]
  );

  const projectSections = useMemo(() => {
    if (!task.projectId) return [];
    return sections
      .filter((s) => s.projectId === task.projectId)
      .sort((a, b) => a.order - b.order);
  }, [sections, task.projectId]);

  const subtasks = useMemo(
    () =>
      tasks
        .filter((t) => t.parentId === task.id)
        .sort(
          (a, b) =>
            Number(a.completed) - Number(b.completed) ||
            a.order - b.order ||
            a.createdAt.localeCompare(b.createdAt)
        ),
    [task.id, tasks]
  );

  const labelColorMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const lbl of labels) {
      map.set(lbl.name, NOTION_COLOR_PILL_CLASS[lbl.color]);
    }
    return map;
  }, [labels]);

  const commitTitle = () => {
    const clean = draftTitle.trim();
    if (!clean) {
      setDraftTitle(task.title);
      return;
    }
    if (clean !== task.title) {
      updateTask(task.id, { title: clean });
    }
  };

  const commitDescription = () => {
    const clean = draftDescription.trim();
    if (clean !== (task.description ?? "").trim()) {
      updateTask(task.id, { description: clean || undefined });
    }
  };

  const handleAddComment = (event: FormEvent) => {
    event.preventDefault();
    if (!commentText.trim()) return;
    addComment(task.id, commentText);
    setCommentText("");
  };

  const handleAddLabel = () => {
    const norm = normalizeLabelName(labelInput);
    if (!norm) return;
    upsertLabel(norm, "blue");
    if (!task.labels.includes(norm)) {
      updateTask(task.id, { labels: [...task.labels, norm] });
    }
    setLabelInput("");
  };

  const toggleLabel = (name: string) => {
    const exists = task.labels.includes(name);
    updateTask(task.id, {
      labels: exists
        ? task.labels.filter((l) => l !== name)
        : [...task.labels, name],
    });
  };

  const dueInfo = task.dueDate
    ? formatTodoDueLabel(task.dueDate, task.dueTime, todayIso)
    : null;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      {...({ closedby: "any" } as Record<string, string>)}
      onClose={closeTaskModal}
      className="settings-dialog m-auto w-[min(94vw,52rem)] max-h-[min(88dvh,44rem)] overflow-hidden rounded-xl border border-border bg-surface p-0 text-foreground shadow-2xl"
    >
      <div className="flex h-[min(84dvh,42rem)] flex-col">
        {/* Top bar */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-canvas/50 px-5 py-3">
          <div className="flex min-w-0 items-center gap-2 text-xs text-muted">
            <button
              type="button"
              onClick={() => {
                closeTaskModal();
                router.push(
                  project
                    ? `/todos/project/${encodeURIComponent(project.id)}`
                    : "/todos/inbox"
                );
              }}
              className="inline-flex min-w-0 items-center gap-1.5 rounded px-1.5 py-1 font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary"
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
                    <Icon name="hash" className="size-3.5" />
                  </span>
                )
              ) : (
                <Icon name="inbox" className="size-3.5 text-primary" />
              )}
              <span className="truncate">
                {project ? projectDisplayName(project) : "Inbox"}
              </span>
            </button>

            {parentTask && (
              <>
                <span aria-hidden="true">/</span>
                <button
                  type="button"
                  onClick={() => openTaskModal(parentTask.id)}
                  className="max-w-44 truncate rounded px-1.5 py-1 hover:bg-secondary hover:text-foreground"
                >
                  {parentTask.title}
                </button>
              </>
            )}
          </div>

          <button
            type="button"
            aria-label="Close task details"
            onClick={closeTaskModal}
            className="inline-flex size-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
          >
            <Icon name="x" className="size-4" />
          </button>
        </div>

        {/* Two-column body */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
          {/* Left main column */}
          <div className="scroll-region min-w-0 flex-1 space-y-5 p-5">
            <div className="flex items-start gap-3">
              <label className="mt-1 inline-flex size-11 -m-3 shrink-0 cursor-pointer items-center justify-center">
                <input
                  type="checkbox"
                  checked={task.completed}
                  data-priority={task.priority}
                  aria-label={
                    task.completed
                      ? `Mark "${task.title}" incomplete`
                      : `Complete "${task.title}"`
                  }
                  onChange={() => toggleTaskComplete(task.id)}
                  className="todo-checkbox text-lg"
                />
              </label>

              <div className="min-w-0 flex-1 space-y-1.5">
                <label htmlFor={titleId} className="sr-only">
                  Task title
                </label>
                <input
                  id={titleId}
                  type="text"
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  onBlur={commitTitle}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commitTitle();
                      e.currentTarget.blur();
                    }
                  }}
                  className={`w-full rounded-md bg-transparent px-1 py-0.5 text-lg font-semibold focus-visible:outline-2 focus-visible:outline-primary ${
                    task.completed
                      ? "text-muted line-through"
                      : "text-foreground"
                  }`}
                />

                <label htmlFor={descId} className="sr-only">
                  Task description
                </label>
                <textarea
                  id={descId}
                  rows={2}
                  value={draftDescription}
                  onChange={(e) => setDraftDescription(e.target.value)}
                  onBlur={commitDescription}
                  placeholder="Add description…"
                  className="auto-fit-textarea w-full rounded-md bg-transparent px-1 py-0.5 text-sm text-muted placeholder:text-muted/60 focus-visible:outline-2 focus-visible:outline-primary"
                />
              </div>
            </div>

            {/* Sub-tasks */}
            <section aria-label="Sub-tasks" className="space-y-2.5 border-t border-border pt-4">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-muted uppercase">
                  <Icon name="subtasks" className="size-3.5" />
                  <span>
                    Sub-tasks{" "}
                    {subtasks.length > 0 &&
                      `(${subtasks.filter((s) => s.completed).length}/${subtasks.length})`}
                  </span>
                </h3>
                {!addingSubtask && (
                  <button
                    type="button"
                    onClick={() => setAddingSubtask(true)}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-secondary"
                  >
                    <Icon name="plus" className="size-3.5" />
                    Add sub-task
                  </button>
                )}
              </div>

              {subtasks.length > 0 && (
                <ul className="divide-y divide-border/70 rounded-lg border border-border bg-canvas/60">
                  {subtasks.map((sub) => {
                    const subDue = sub.dueDate
                      ? formatTodoDueLabel(sub.dueDate, sub.dueTime, todayIso)
                      : null;
                    return (
                      <li
                        key={sub.id}
                        className="flex items-center justify-between gap-2 px-3 py-2"
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-2.5">
                          <label className="inline-flex size-8 -m-1.5 shrink-0 cursor-pointer items-center justify-center">
                            <input
                              type="checkbox"
                              checked={sub.completed}
                              data-priority={sub.priority}
                              aria-label={`Complete sub-task "${sub.title}"`}
                              onChange={() => toggleTaskComplete(sub.id)}
                              className="todo-checkbox text-sm"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => openTaskModal(sub.id)}
                            className={`min-w-0 flex-1 truncate text-start text-xs hover:text-primary ${
                              sub.completed
                                ? "text-muted line-through"
                                : "text-foreground"
                            }`}
                          >
                            {sub.title}
                          </button>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {subDue && (
                            <span className="text-[11px] text-muted">
                              {subDue.label}
                            </span>
                          )}
                          <button
                            type="button"
                            aria-label={`Delete sub-task "${sub.title}"`}
                            onClick={() => deleteTask(sub.id)}
                            className="inline-flex size-6 items-center justify-center rounded text-muted hover:bg-secondary hover:text-danger"
                          >
                            <Icon name="trash" className="size-3" />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              {addingSubtask && (
                <TodoTaskComposer
                  mode="create"
                  defaultParentId={task.id}
                  defaultProjectId={task.projectId}
                  compact
                  onCancel={() => setAddingSubtask(false)}
                  onSaved={() => setAddingSubtask(false)}
                />
              )}
            </section>

            {/* Comments */}
            <section aria-label="Comments" className="space-y-3 border-t border-border pt-4">
              <h3 className="text-xs font-semibold tracking-wider text-muted uppercase">
                Comments{" "}
                {task.comments && task.comments.length > 0
                  ? `(${task.comments.length})`
                  : ""}
              </h3>

              {task.comments && task.comments.length > 0 && (
                <ul className="space-y-2">
                  {task.comments.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-start justify-between gap-2 rounded-lg border border-border bg-canvas/60 px-3 py-2 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="whitespace-pre-wrap text-foreground">
                          {c.text}
                        </p>
                        <p className="mt-1 text-[10px] text-muted">
                          {c.createdAt.slice(0, 10)}
                        </p>
                      </div>
                      <button
                        type="button"
                        aria-label="Delete comment"
                        onClick={() => deleteComment(task.id, c.id)}
                        className="inline-flex size-6 shrink-0 items-center justify-center rounded text-muted hover:bg-secondary hover:text-danger"
                      >
                        <Icon name="trash" className="size-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <form onSubmit={handleAddComment} className="flex gap-2">
                <label htmlFor={commentInputId} className="sr-only">
                  Add a comment
                </label>
                <input
                  id={commentInputId}
                  type="text"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Write a comment…"
                  className="h-9 min-w-0 flex-1 rounded-md border border-border bg-canvas px-3 text-xs text-foreground placeholder:text-muted focus-visible:outline-2 focus-visible:outline-primary"
                />
                <button
                  type="submit"
                  disabled={!commentText.trim()}
                  className="primary inline-flex h-9 items-center rounded-md px-3 text-xs font-medium disabled:opacity-45"
                >
                  Comment
                </button>
              </form>
            </section>
          </div>

          {/* Right metadata sidebar */}
          <aside className="scroll-region w-full shrink-0 space-y-4 border-t border-border bg-canvas/40 p-4 md:w-64 md:border-s md:border-t-0">
            {/* Project */}
            {!task.parentId && (
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold tracking-wider text-muted uppercase">
                  Project
                </label>
                <select
                  aria-label="Task project"
                  value={task.projectId ?? "__inbox__"}
                  onChange={(e) => {
                    const val = e.target.value;
                    updateTask(task.id, {
                      projectId: val === "__inbox__" ? null : val,
                      sectionId: null,
                    });
                  }}
                  className="h-8 w-full rounded-md border border-border bg-canvas px-2 text-xs text-foreground focus-visible:outline-2 focus-visible:outline-primary"
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

            {/* Section */}
            {!task.parentId && projectSections.length > 0 && (
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold tracking-wider text-muted uppercase">
                  Section
                </label>
                <select
                  aria-label="Task section"
                  value={task.sectionId ?? ""}
                  onChange={(e) =>
                    updateTask(task.id, {
                      sectionId: e.target.value || null,
                    })
                  }
                  className="h-8 w-full rounded-md border border-border bg-canvas px-2 text-xs text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <option value="">No section</option>
                  {projectSections.map((sec) => (
                    <option key={sec.id} value={sec.id}>
                      {sec.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Due date & repeat */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold tracking-wider text-muted uppercase">
                  Due date
                </span>
                {dueInfo && (
                  <span className="text-[11px] font-medium text-foreground">
                    {dueInfo.label}
                  </span>
                )}
              </div>

              {todayIso && (
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() => updateTask(task.id, { dueDate: todayIso })}
                    className="rounded border border-border bg-canvas px-2 py-1 text-[11px] text-foreground hover:bg-secondary"
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      updateTask(task.id, { dueDate: addDaysIso(todayIso, 1) })
                    }
                    className="rounded border border-border bg-canvas px-2 py-1 text-[11px] text-foreground hover:bg-secondary"
                  >
                    Tomorrow
                  </button>
                  {task.dueDate && (
                    <button
                      type="button"
                      onClick={() =>
                        updateTask(task.id, {
                          dueDate: undefined,
                          dueTime: undefined,
                          recurrence: undefined,
                        })
                      }
                      className="rounded border border-border bg-canvas px-2 py-1 text-[11px] text-muted hover:bg-secondary hover:text-danger"
                    >
                      Clear
                    </button>
                  )}
                </div>
              )}

              <div className="flex gap-1.5">
                <input
                  type="date"
                  aria-label="Due date"
                  value={task.dueDate ?? ""}
                  onChange={(e) =>
                    updateTask(task.id, {
                      dueDate: e.target.value || undefined,
                    })
                  }
                  className="h-8 min-w-0 flex-1 rounded-md border border-border bg-canvas px-2 text-xs text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                />
                <input
                  type="time"
                  aria-label="Due time"
                  value={task.dueTime ?? ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val && !task.dueDate && todayIso) {
                      updateTask(task.id, { dueDate: todayIso, dueTime: val });
                    } else {
                      updateTask(task.id, { dueTime: val || undefined });
                    }
                  }}
                  className="h-8 w-24 rounded-md border border-border bg-canvas px-1.5 text-xs text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                />
              </div>

              <select
                aria-label="Repeat schedule"
                value={getRecurrenceOptionId(task.recurrence)}
                onChange={(e) => {
                  const preset = RECURRENCE_OPTIONS.find(
                    (o) => o.id === e.target.value
                  );
                  if (preset?.value && !task.dueDate && todayIso) {
                    updateTask(task.id, {
                      dueDate: todayIso,
                      recurrence: preset.value,
                    });
                  } else {
                    updateTask(task.id, { recurrence: preset?.value });
                  }
                }}
                className="h-8 w-full rounded-md border border-border bg-canvas px-2 text-xs text-foreground focus-visible:outline-2 focus-visible:outline-primary"
              >
                {RECURRENCE_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
                {getRecurrenceOptionId(task.recurrence) === "custom" &&
                  task.recurrence && (
                    <option value="custom">
                      {formatRecurrenceLabel(task.recurrence)}
                    </option>
                  )}
              </select>
            </div>

            {/* Priority */}
            <div className="space-y-1.5">
              <span className="block text-[11px] font-semibold tracking-wider text-muted uppercase">
                Priority
              </span>
              <div className="grid grid-cols-4 gap-1">
                {([1, 2, 3, 4] as const).map((lvl: TodoPriority) => (
                  <button
                    key={lvl}
                    type="button"
                    aria-pressed={task.priority === lvl}
                    onClick={() => updateTask(task.id, { priority: lvl })}
                    className={`inline-flex h-8 items-center justify-center gap-1 rounded-md border text-xs transition-colors ${
                      task.priority === lvl
                        ? "border-primary bg-secondary font-medium text-foreground"
                        : "border-border bg-canvas text-muted hover:bg-secondary"
                    }`}
                  >
                    <span style={{ color: PRIORITY_META[lvl].colorVar }}>
                      <Icon name="flag" className="size-3" />
                    </span>
                    <span>{PRIORITY_META[lvl].short}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Labels */}
            <div className="space-y-2">
              <span className="block text-[11px] font-semibold tracking-wider text-muted uppercase">
                Labels
              </span>
              <div className="flex flex-wrap gap-1">
                {labels.map((lbl) => {
                  const active = task.labels.includes(lbl.name);
                  return (
                    <button
                      key={lbl.name}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleLabel(lbl.name)}
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                        active
                          ? `border-primary ${labelColorMap.get(lbl.name) ?? "notion-pill-blue"}`
                          : "border-border bg-canvas text-muted hover:text-foreground"
                      }`}
                    >
                      @{lbl.name}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-1">
                <label htmlFor={newLabelId} className="sr-only">
                  Add label
                </label>
                <input
                  id={newLabelId}
                  type="text"
                  value={labelInput}
                  onChange={(e) => setLabelInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddLabel();
                    }
                  }}
                  placeholder="Add @label…"
                  className="h-7 min-w-0 flex-1 rounded-md border border-border bg-canvas px-2 text-xs text-foreground placeholder:text-muted focus-visible:outline-2 focus-visible:outline-primary"
                />
                <button
                  type="button"
                  onClick={handleAddLabel}
                  disabled={!normalizeLabelName(labelInput)}
                  className="h-7 rounded-md border border-border bg-canvas px-2 text-xs font-medium text-foreground hover:bg-secondary disabled:opacity-40"
                >
                  Add
                </button>
              </div>
            </div>

            {/* Footer meta & actions */}
            <div className="space-y-2 border-t border-border pt-3 text-xs">
              <p className="text-[11px] text-muted">
                Created {task.createdAt.slice(0, 10)}
              </p>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    const copy = duplicateTask(task.id);
                    if (copy) openTaskModal(copy.id);
                  }}
                  className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-md border border-border bg-canvas px-2 text-xs font-medium text-foreground hover:bg-secondary"
                >
                  <Icon name="copy" className="size-3.5 text-muted" />
                  Duplicate
                </button>
                <button
                  type="button"
                  onClick={() => deleteTask(task.id)}
                  className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-md border border-danger/30 bg-danger/10 px-2 text-xs font-medium text-danger hover:bg-danger/20"
                >
                  <Icon name="trash" className="size-3.5" />
                  Delete
                </button>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </dialog>
  );
}

function TodoTaskDetailDialog() {
  const { activeTaskModalId, getTask } = useTodos();
  const task = activeTaskModalId ? getTask(activeTaskModalId) : undefined;
  if (!task) return null;
  return <TodoTaskDetailInner key={task.id} task={task} />;
}

function TodoProjectDialogInner({
  mode,
  initialProject,
  defaultParentId,
}: {
  mode: "create" | "edit";
  initialProject?: TodoProject;
  defaultParentId?: string;
}) {
  const router = useRouter();
  const { projects, createProject, updateProject, closeProjectDialog } =
    useTodos();

  const dialogRef = useRef<HTMLDialogElement>(null);
  const iconWrapRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const nameInputId = useId();

  const [name, setName] = useState(initialProject?.name ?? "");
  const [color, setColor] = useState<NotionColor>(
    initialProject?.color ?? "blue"
  );
  const [icon, setIcon] = useState<string | undefined>(initialProject?.icon);
  const [parentId, setParentId] = useState<string>(
    initialProject?.parentId ?? defaultParentId ?? ""
  );
  const [favorite, setFavorite] = useState<boolean>(
    Boolean(initialProject?.favorite)
  );
  const [viewLayout, setViewLayout] = useState<TodoViewLayout>(
    initialProject?.viewLayout ?? "list"
  );
  const [iconPickerOpen, setIconPickerOpen] = useState(false);

  useDismissible(iconPickerOpen, [iconWrapRef], () => setIconPickerOpen(false));

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
  }, []);

  useDialogLightDismissFallback(dialogRef, true);

  const parentOptions = useMemo(() => {
    const flattened = flattenProjectTree(projects);
    if (!initialProject) return flattened;
    const forbidden = new Set<string>([initialProject.id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const p of projects) {
        if (p.parentId && forbidden.has(p.parentId) && !forbidden.has(p.id)) {
          forbidden.add(p.id);
          changed = true;
        }
      }
    }
    return flattened.filter(({ project }) => !forbidden.has(project.id));
  }, [initialProject, projects]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) return;

    if (mode === "edit" && initialProject) {
      updateProject(initialProject.id, {
        name: cleanName,
        color,
        icon,
        parentId: parentId || undefined,
        favorite,
        viewLayout,
      });
      closeProjectDialog();
      return;
    }

    const created = createProject({
      name: cleanName,
      color,
      icon,
      parentId: parentId || undefined,
      favorite,
      viewLayout,
    });
    closeProjectDialog();
    router.push(`/todos/project/${encodeURIComponent(created.id)}`);
  };

  const handleKeyDownCapture = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && iconPickerOpen) {
      event.preventDefault();
      event.stopPropagation();
      setIconPickerOpen(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      {...({ closedby: "any" } as Record<string, string>)}
      onClose={closeProjectDialog}
      className="settings-dialog m-auto w-[min(92vw,30rem)] overflow-visible rounded-xl border border-border bg-surface p-0 text-foreground shadow-2xl"
    >
      <div onKeyDownCapture={handleKeyDownCapture}>
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h2 id={titleId} className="text-base font-semibold text-foreground">
            {mode === "edit" ? "Edit project" : "Add project"}
          </h2>
          <button
            type="button"
            aria-label="Close project dialog"
            onClick={closeProjectDialog}
            className="inline-flex size-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
          >
            <Icon name="x" className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          {/* Name + Icon */}
          <div className="space-y-1.5">
            <label
              htmlFor={nameInputId}
              className="block text-xs font-medium text-muted"
            >
              Name
            </label>
            <div className="flex items-center gap-2">
              <div ref={iconWrapRef} className="relative">
                <button
                  type="button"
                  aria-label="Choose project icon"
                  aria-expanded={iconPickerOpen}
                  onClick={() => setIconPickerOpen((prev) => !prev)}
                  className="inline-flex size-9 items-center justify-center rounded-md border border-border bg-canvas text-base hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary"
                >
                  {icon ? (
                    <span>{icon}</span>
                  ) : (
                    <span
                      className="inline-flex items-center"
                      style={{ color: `var(--notion-${color})` }}
                    >
                      <Icon name="hash" className="size-4" />
                    </span>
                  )}
                </button>
                {iconPickerOpen && (
                  <IconPickerPopover
                    selectedIcon={icon}
                    label="Choose project icon"
                    onSelect={(emoji) => {
                      setIcon(emoji);
                      setIconPickerOpen(false);
                    }}
                  />
                )}
              </div>
              <input
                id={nameInputId}
                type="text"
                autoFocus
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Work, Personal, Fitness"
                className="h-9 min-w-0 flex-1 rounded-md border border-border bg-canvas px-3 text-sm text-foreground placeholder:text-muted focus-visible:outline-2 focus-visible:outline-primary"
              />
            </div>
          </div>

          {/* Color */}
          <div className="space-y-1.5">
            <span className="block text-xs font-medium text-muted">Color</span>
            <div className="flex flex-wrap gap-2">
              {PROJECT_COLORS.map((c) => {
                const selected = color === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    aria-label={c.label}
                    aria-pressed={selected}
                    title={c.label}
                    onClick={() => setColor(c.id)}
                    className={`inline-flex size-7 items-center justify-center rounded-full border transition-transform ${
                      selected
                        ? "scale-110 border-foreground ring-2 ring-primary ring-offset-2 ring-offset-surface"
                        : "border-border hover:scale-105"
                    }`}
                    style={{ backgroundColor: c.dotVar }}
                  >
                    {selected && (
                      <span
                        aria-hidden="true"
                        className="size-2 rounded-full bg-canvas"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Parent project */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-muted">
              Parent project
            </label>
            <select
              aria-label="Parent project"
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className="h-9 w-full rounded-md border border-border bg-canvas px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-primary"
            >
              <option value="">No parent (top-level)</option>
              {parentOptions.map(({ project: p, depth }) => (
                <option key={p.id} value={p.id}>
                  {"\u00A0".repeat(depth * 2)}
                  {projectDisplayName(p)}
                </option>
              ))}
            </select>
          </div>

          {/* Default view + Favorite */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted">View:</span>
              <div className="inline-flex rounded-md border border-border bg-canvas p-0.5">
                <button
                  type="button"
                  aria-pressed={viewLayout === "list"}
                  onClick={() => setViewLayout("list")}
                  className={`inline-flex h-7 items-center gap-1 rounded px-2.5 text-xs font-medium ${
                    viewLayout === "list"
                      ? "bg-secondary text-foreground"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  <Icon name="list" className="size-3.5" />
                  List
                </button>
                <button
                  type="button"
                  aria-pressed={viewLayout === "board"}
                  onClick={() => setViewLayout("board")}
                  className={`inline-flex h-7 items-center gap-1 rounded px-2.5 text-xs font-medium ${
                    viewLayout === "board"
                      ? "bg-secondary text-foreground"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  <Icon name="board" className="size-3.5" />
                  Board
                </button>
              </div>
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-foreground">
              <input
                type="checkbox"
                checked={favorite}
                onChange={(e) => setFavorite(e.currentTarget.checked)}
                className="size-4 rounded border-border accent-primary"
              />
              <span>Add to favorites</span>
            </label>
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-3">
            <button
              type="button"
              onClick={closeProjectDialog}
              className="inline-flex h-9 items-center rounded-md border border-border px-3.5 text-xs font-medium text-muted hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="primary inline-flex h-9 items-center rounded-md px-4 text-xs font-medium transition-opacity hover:opacity-90 disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {mode === "edit" ? "Save" : "Add"}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
}

function TodoProjectDialog() {
  const { projectDialogRequest } = useTodos();
  if (!projectDialogRequest) return null;

  const key =
    projectDialogRequest.mode === "edit"
      ? `edit-${projectDialogRequest.project.id}`
      : `create-${projectDialogRequest.parentId ?? "root"}`;

  return (
    <TodoProjectDialogInner
      key={key}
      mode={projectDialogRequest.mode}
      initialProject={
        projectDialogRequest.mode === "edit"
          ? projectDialogRequest.project
          : undefined
      }
      defaultParentId={
        projectDialogRequest.mode === "create"
          ? projectDialogRequest.parentId
          : undefined
      }
    />
  );
}

const emptySubscribe = () => () => {};

function useSupportsPopover(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => Object.hasOwn(HTMLElement.prototype, "popover"),
    () => true
  );
}

function TodoToastHost({ suppressed }: { suppressed: boolean }) {
  const { toast, dismissToast } = useTodos();
  const popoverRef = useRef<HTMLDivElement>(null);
  const toastId = useId();
  const [paused, setPaused] = useState(false);
  const [liveAnnouncement, setLiveAnnouncement] = useState("");
  const priorFocusRef = useRef<HTMLElement | null>(null);
  const supportsPopover = useSupportsPopover();

  useEffect(() => {
    const el = popoverRef.current;
    if (!el) return;

    const shouldShow = Boolean(toast) && !suppressed;
    if (supportsPopover) {
      const isOpen = el.matches(":popover-open");
      if (shouldShow && !isOpen) {
        try {
          el.showPopover();
        } catch {
          // Ignore if already open or disconnected
        }
      } else if (!shouldShow && isOpen) {
        try {
          el.hidePopover();
        } catch {
          // Ignore
        }
      }
    }
  }, [supportsPopover, suppressed, toast]);

  useEffect(() => {
    if (!toast || suppressed) return;

    const announcement = toast.onUndo
      ? `${toast.message}. Actions available`
      : toast.message;

    const doc = document as Document & { ariaNotify?: (text: string) => void };
    if (typeof doc.ariaNotify === "function") {
      doc.ariaNotify(announcement);
      return;
    }

    const frame = requestAnimationFrame(() => {
      setLiveAnnouncement(announcement);
    });
    return () => cancelAnimationFrame(frame);
  }, [suppressed, toast]);

  useEffect(() => {
    if (!toast || suppressed || paused) return;
    const timer = window.setTimeout(() => {
      dismissToast();
    }, 5200);
    return () => window.clearTimeout(timer);
  }, [dismissToast, paused, suppressed, toast]);

  const handleClose = () => {
    const wasFocusedInside = popoverRef.current?.contains(
      document.activeElement
    );
    dismissToast();
    if (wasFocusedInside && priorFocusRef.current?.isConnected) {
      priorFocusRef.current.focus();
    }
  };

  const fallbackVisible = Boolean(toast) && !suppressed && !supportsPopover;

  return (
    <div role="region" aria-label="Notifications">
      <p className="sr-only">Screen reader announcements</p>
      <div aria-live="polite" className="sr-only">
        {toast && !suppressed ? liveAnnouncement : ""}
      </div>

      <div
        ref={popoverRef}
        id={toastId}
        {...(supportsPopover ? ({ popover: "manual" } as Record<string, string>) : {})}
        onPointerEnter={() => setPaused(true)}
        onPointerLeave={() => setPaused(false)}
        onFocusCapture={(event) => {
          if (
            event.relatedTarget instanceof HTMLElement &&
            !popoverRef.current?.contains(event.relatedTarget)
          ) {
            priorFocusRef.current = event.relatedTarget;
          }
          setPaused(true);
        }}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setPaused(false);
          }
        }}
        className={`todo-toast-popover z-50 items-center justify-between gap-3 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-xs text-foreground shadow-xl ${
          fallbackVisible ? "flex" : supportsPopover ? "" : "hidden"
        }`}
      >
        <span className="min-w-0 flex-1 truncate font-medium">
          {toast?.message}
        </span>

        <div className="flex shrink-0 items-center gap-1.5">
          {toast?.onUndo && (
            <button
              type="button"
              onClick={() => {
                const undo = toast.onUndo;
                dismissToast();
                undo?.();
              }}
              className="rounded-md bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/20 focus-visible:outline-2 focus-visible:outline-primary"
            >
              {toast.undoLabel ?? "Undo"}
            </button>
          )}
          <button
            type="button"
            aria-label="Close notification"
            popoverTarget={supportsPopover ? toastId : undefined}
            popoverTargetAction={supportsPopover ? "hide" : undefined}
            onClick={handleClose}
            className="inline-flex size-6 items-center justify-center rounded-md text-muted transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
          >
            <Icon name="x" className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

/** Hosts global Todos keyboard shortcuts ('Q' Quick Add), task/project dialogs, and Undo toast notifications. */
export function TodoDialogsHost() {
  const pathname = usePathname();
  const { settingsOpen } = useAgent();
  const {
    quickAddRequest,
    activeTaskModalId,
    projectDialogRequest,
    openQuickAdd,
  } = useTodos();

  const isTodosRoute =
    pathname === "/todos" || pathname.startsWith("/todos/");
  const activeProjectId = pathname.startsWith("/todos/project/")
    ? decodeURIComponent(
        pathname.slice("/todos/project/".length).split("/")[0] ?? ""
      )
    : null;

  const anyModalOpen =
    quickAddRequest !== null ||
    activeTaskModalId !== null ||
    projectDialogRequest !== null ||
    settingsOpen;

  useEffect(() => {
    if (!isTodosRoute) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return;
      }
      if (event.key.toLowerCase() !== "q") return;
      if (anyModalOpen || document.querySelector("dialog[open]")) return;

      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      event.preventDefault();
      openQuickAdd(
        activeProjectId
          ? { defaultProjectId: activeProjectId }
          : pathname === "/todos/inbox"
            ? { defaultProjectId: null }
            : {}
      );
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [activeProjectId, anyModalOpen, isTodosRoute, openQuickAdd, pathname]);

  return (
    <>
      <TodoQuickAddDialog />
      <TodoTaskDetailDialog />
      <TodoProjectDialog />
      <TodoToastHost suppressed={anyModalOpen} />
    </>
  );
}
