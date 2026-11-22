"use client";

import { useMemo, useRef, useState } from "react";
import { Icon } from "../../assets/icons";
import { useTodos } from "../../lib/todos-store";
import {
  addDaysIso,
  getNextWeekMondayIso,
  PRIORITY_META,
  type TodoPriority,
  type TodoTask,
} from "../../lib/todos-utils";
import { useDismissible } from "../../lib/use-dismissible";
import { TodoTaskComposer } from "./TodoTaskComposer";
import { TodoTaskRow } from "./TodoTaskRow";

/** Groups child sub-tasks by parentId sorted by completion and order. */
export function buildSubtasksMap(tasks: TodoTask[]): Map<string, TodoTask[]> {
  const map = new Map<string, TodoTask[]>();
  for (const task of tasks) {
    if (!task.parentId) continue;
    const list = map.get(task.parentId) ?? [];
    list.push(task);
    map.set(task.parentId, list);
  }
  for (const list of map.values()) {
    list.sort(
      (a, b) =>
        Number(a.completed) - Number(b.completed) ||
        a.order - b.order ||
        a.createdAt.localeCompare(b.createdAt)
    );
  }
  return map;
}

/** Todoist-style inline "+ Add task" button that toggles into TodoTaskComposer. */
export function InlineAddTaskTrigger({
  label = "Add task",
  defaultProjectId = null,
  defaultSectionId = null,
  defaultDueDate = "",
  defaultPriority = 4,
  defaultLabels = [],
  compact = false,
}: {
  label?: string;
  defaultProjectId?: string | null;
  defaultSectionId?: string | null;
  defaultDueDate?: string;
  defaultPriority?: TodoPriority;
  defaultLabels?: string[];
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (open) {
    return (
      <div className={compact ? "pt-1" : "pt-2"}>
        <TodoTaskComposer
          mode="create"
          defaultProjectId={defaultProjectId}
          defaultSectionId={defaultSectionId}
          defaultDueDate={defaultDueDate}
          defaultPriority={defaultPriority}
          defaultLabels={defaultLabels}
          compact={compact}
          onCancel={() => setOpen(false)}
          onSaved={() => setOpen(false)}
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="group inline-flex w-full items-center gap-2 rounded-md py-1.5 text-xs font-medium text-muted transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
    >
      <span className="inline-flex size-5 items-center justify-center rounded-full text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
        <Icon name="plus" className="size-3.5" />
      </span>
      <span>{label}</span>
    </button>
  );
}

/** Collapsible Overdue section with batch Todoist Reschedule dropdown. */
export function TodoOverdueSection({
  overdueTasks,
  subtasksByParent,
  todayIso,
  showProject = true,
  showSection = false,
}: {
  overdueTasks: TodoTask[];
  subtasksByParent: Map<string, TodoTask[]>;
  todayIso: string;
  showProject?: boolean;
  showSection?: boolean;
}) {
  const { rescheduleTasks } = useTodos();
  const [collapsed, setCollapsed] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const rescheduleRef = useRef<HTMLDivElement>(null);

  useDismissible(rescheduleOpen, [rescheduleRef], () =>
    setRescheduleOpen(false)
  );

  const overdueIds = useMemo(
    () => overdueTasks.map((t) => t.id),
    [overdueTasks]
  );

  if (overdueTasks.length === 0 || !todayIso) return null;

  return (
    <section aria-label="Overdue tasks" className="space-y-1">
      <div className="flex items-center justify-between gap-2 border-b border-border pb-1.5">
        <button
          type="button"
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((prev) => !prev)}
          className="inline-flex items-center gap-1.5 rounded px-1 py-0.5 text-sm font-semibold text-foreground hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary"
        >
          <Icon
            name="chevron-right"
            className={`size-3.5 text-muted transition-transform ${
              !collapsed ? "rotate-90" : ""
            }`}
          />
          <span>Overdue</span>
          <span className="text-xs font-normal text-danger tabular-nums">
            {overdueTasks.length}
          </span>
        </button>

        <div ref={rescheduleRef} className="relative">
          <button
            type="button"
            aria-expanded={rescheduleOpen}
            onClick={() => setRescheduleOpen((prev) => !prev)}
            className="rounded-md px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary"
          >
            Reschedule
          </button>

          {rescheduleOpen && (
            <div
              role="dialog"
              aria-label="Reschedule overdue tasks"
              className="absolute end-0 top-full z-30 mt-1 w-44 rounded-lg border border-border bg-canvas p-1.5 shadow-lg"
            >
              <button
                type="button"
                onClick={() => {
                  rescheduleTasks(overdueIds, todayIso);
                  setRescheduleOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-foreground hover:bg-secondary"
              >
                <Icon name="calendar" className="size-3.5 text-success" />
                Today
              </button>
              <button
                type="button"
                onClick={() => {
                  rescheduleTasks(overdueIds, addDaysIso(todayIso, 1));
                  setRescheduleOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-foreground hover:bg-secondary"
              >
                <Icon name="sun" className="size-3.5 notion-text-orange" />
                Tomorrow
              </button>
              <button
                type="button"
                onClick={() => {
                  rescheduleTasks(overdueIds, getNextWeekMondayIso(todayIso));
                  setRescheduleOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-foreground hover:bg-secondary"
              >
                <Icon name="calendar" className="size-3.5 notion-text-purple" />
                Next week
              </button>
            </div>
          )}
        </div>
      </div>

      {!collapsed && (
        <div>
          {overdueTasks.map((task) => (
            <TodoTaskRow
              key={task.id}
              task={task}
              showProject={showProject}
              showSection={showSection}
              todayIso={todayIso}
              subtasks={subtasksByParent.get(task.id) ?? []}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/** Kanban board grouped by priority P1–P4 (used in Today and Inbox Board views). */
export function TodoPriorityBoard({
  tasks,
  subtasksByParent,
  todayIso,
  showProject = false,
  showSection = false,
  defaultProjectId = null,
  defaultSectionId = null,
  defaultDueDate = "",
}: {
  tasks: TodoTask[];
  subtasksByParent: Map<string, TodoTask[]>;
  todayIso: string;
  showProject?: boolean;
  showSection?: boolean;
  defaultProjectId?: string | null;
  defaultSectionId?: string | null;
  defaultDueDate?: string;
}) {
  const { updateTask } = useTodos();
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [hoverPriority, setHoverPriority] = useState<TodoPriority | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<TodoPriority, TodoTask[]>([
      [1, []],
      [2, []],
      [3, []],
      [4, []],
    ]);
    for (const t of tasks) {
      const list = map.get(t.priority);
      if (list) list.push(t);
    }
    return map;
  }, [tasks]);

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {([1, 2, 3, 4] as const).map((priority) => {
        const colTasks = grouped.get(priority) ?? [];
        const isOver = hoverPriority === priority;
        return (
          <section
            key={priority}
            aria-label={PRIORITY_META[priority].label}
            onDragOver={(e) => {
              if (!draggedId) return;
              e.preventDefault();
              setHoverPriority(priority);
            }}
            onDragLeave={() => {
              setHoverPriority((curr) => (curr === priority ? null : curr));
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const id = e.dataTransfer.getData("text/plain") || draggedId;
              setDraggedId(null);
              setHoverPriority(null);
              if (id) {
                updateTask(id, { priority });
              }
            }}
            className={`flex w-72 shrink-0 flex-col rounded-xl border p-3 transition-colors ${
              isOver
                ? "border-primary bg-secondary/70"
                : "border-border bg-surface/60"
            }`}
          >
            <div className="mb-2.5 flex items-center justify-between gap-2 px-1">
              <div className="flex items-center gap-1.5">
                <span style={{ color: PRIORITY_META[priority].colorVar }}>
                  <Icon name="flag" className="size-3.5" />
                </span>
                <h2 className="text-xs font-semibold text-foreground">
                  {PRIORITY_META[priority].label}
                </h2>
              </div>
              <span className="text-[11px] text-muted tabular-nums">
                {colTasks.length}
              </span>
            </div>

            <div className="space-y-2">
              {colTasks.map((task) => (
                <TodoTaskRow
                  key={task.id}
                  task={task}
                  variant="card"
                  showProject={showProject}
                  showSection={showSection}
                  todayIso={todayIso}
                  subtasks={subtasksByParent.get(task.id) ?? []}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", task.id);
                    e.dataTransfer.effectAllowed = "move";
                    setDraggedId(task.id);
                  }}
                />
              ))}
            </div>

            <div className="mt-2 pt-1">
              <InlineAddTaskTrigger
                compact
                defaultProjectId={defaultProjectId}
                defaultSectionId={defaultSectionId}
                defaultDueDate={defaultDueDate}
                defaultPriority={priority}
              />
            </div>
          </section>
        );
      })}
    </div>
  );
}
