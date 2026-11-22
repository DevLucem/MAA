"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { Icon } from "../../assets/icons";
import {
  dayOfWeek,
  parsePlainDate,
  plainDateToEpochDay,
} from "../../lib/database-types";
import { useTodos } from "../../lib/todos-store";
import {
  addDaysIso,
  buildTodoProjectHref,
  formatRecurrenceLabel,
  formatTodoDueLabel,
  getNextWeekMondayIso,
  projectDisplayName,
  type TodoSection,
  type TodoTask,
} from "../../lib/todos-utils";
import { useDismissible } from "../../lib/use-dismissible";
import { InlineAddTaskTrigger, TodoOverdueSection } from "./TodoSharedBlocks";
import { TodoTaskRow } from "./TodoTaskRow";

const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const FULL_WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export function formatWeekColumnHeading(
  iso: string,
  todayIso: string
): { dateLabel: string; relationLabel: string } {
  const dParts = parsePlainDate(iso);
  const tParts = parsePlainDate(todayIso);
  if (!dParts) return { dateLabel: iso, relationLabel: "" };

  const dateLabel = `${dParts.day} ${SHORT_MONTHS[dParts.month - 1]}`;
  const weekday = FULL_WEEKDAYS[dayOfWeek(dParts)];
  if (!tParts) return { dateLabel, relationLabel: weekday };

  const diff = plainDateToEpochDay(dParts) - plainDateToEpochDay(tParts);
  if (diff === 0) return { dateLabel, relationLabel: "Today" };
  if (diff === 1) return { dateLabel, relationLabel: "Tomorrow" };
  if (diff === -1) return { dateLabel, relationLabel: "Yesterday" };
  return { dateLabel, relationLabel: weekday };
}

function getColumnTimeToneClass(iso: string, todayIso: string): string {
  const dParts = parsePlainDate(iso);
  const tParts = parsePlainDate(todayIso);
  if (!dParts || !tParts) return "text-muted";
  const diff = plainDateToEpochDay(dParts) - plainDateToEpochDay(tParts);
  if (diff < 0) return "text-danger";
  if (diff === 0) return "text-success";
  if (diff === 1) return "notion-text-orange";
  if (diff <= 6) return "notion-text-purple";
  return "text-muted";
}

interface TodoWeekCardProps {
  task: TodoTask;
  isOverdueColumn?: boolean;
  showProject?: boolean;
  showSection?: boolean;
  todayIso: string;
  subtasks: TodoTask[];
  sectionById: Map<string, TodoSection>;
  onDragStart: (taskId: string) => void;
  onDragEnd: () => void;
}

function TodoWeekCard({
  task,
  isOverdueColumn = false,
  showProject = true,
  showSection = false,
  todayIso,
  subtasks,
  sectionById,
  onDragStart,
  onDragEnd,
}: TodoWeekCardProps) {
  const { getProject, toggleTaskComplete, openTaskModal } = useTodos();
  const [subtasksExpanded, setSubtasksExpanded] = useState(false);

  const project = task.projectId ? getProject(task.projectId) : undefined;
  const section = task.sectionId ? sectionById.get(task.sectionId) : undefined;
  const commentCount = task.comments?.length ?? 0;
  const completedSubtaskCount = subtasks.filter((s) => s.completed).length;

  const overdueLabel = useMemo(() => {
    if (!isOverdueColumn || !task.dueDate) return null;
    const dParts = parsePlainDate(task.dueDate);
    if (!dParts) return formatTodoDueLabel(task.dueDate, task.dueTime, todayIso).label;
    const base = `${dParts.day} ${SHORT_MONTHS[dParts.month - 1]}`;
    return task.dueTime ? `${base} ${task.dueTime}` : base;
  }, [isOverdueColumn, task.dueDate, task.dueTime, todayIso]);

  const timeToneClass = task.dueDate
    ? getColumnTimeToneClass(task.dueDate, todayIso)
    : "text-muted";

  const showTimeOrRecurrence = Boolean(
    isOverdueColumn ? overdueLabel : task.dueTime || task.recurrence
  );

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", task.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart(task.id);
      }}
      onDragEnd={onDragEnd}
      className="rounded-xl border border-border bg-surface/65 p-3 transition-colors hover:border-muted/60"
    >
      <div className="flex items-start gap-2.5">
        <label className="inline-flex size-11 -m-3 shrink-0 cursor-pointer items-center justify-center">
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
            className="todo-checkbox text-sm"
          />
        </label>

        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => openTaskModal(task.id)}
            className="block w-full rounded text-start focus-visible:outline-2 focus-visible:outline-primary"
          >
            <span
              className={`block text-[13px] leading-snug font-medium ${
                task.completed
                  ? "text-muted line-through"
                  : "text-foreground hover:text-primary"
              }`}
            >
              {task.title}
            </span>
            {task.description && (
              <span className="mt-0.5 line-clamp-1 block text-xs text-muted">
                {task.description}
              </span>
            )}
          </button>

          {/* Metadata row */}
          {(showTimeOrRecurrence ||
            subtasks.length > 0 ||
            commentCount > 0 ||
            showProject ||
            (showSection && Boolean(section))) && (
            <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px]">
              {showTimeOrRecurrence && (
                <span
                  title={
                    task.recurrence
                      ? formatRecurrenceLabel(task.recurrence)
                      : task.dueDate
                  }
                  className={`inline-flex items-center gap-1 font-medium ${
                    isOverdueColumn ? "text-danger" : timeToneClass
                  }`}
                >
                  <Icon name="calendar" className="size-3" />
                  {isOverdueColumn && overdueLabel ? (
                    <span className="tabular-nums">{overdueLabel}</span>
                  ) : (
                    task.dueTime && (
                      <span className="tabular-nums">{task.dueTime}</span>
                    )
                  )}
                  {task.recurrence && <Icon name="repeat" className="size-3" />}
                </span>
              )}

              {subtasks.length > 0 && (
                <button
                  type="button"
                  aria-expanded={subtasksExpanded}
                  onClick={() => setSubtasksExpanded((prev) => !prev)}
                  className="inline-flex items-center gap-1 rounded border border-border bg-canvas/60 px-1.5 py-0.5 text-[11px] text-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <Icon name="subtasks" className="size-3" />
                  <span className="tabular-nums">
                    {completedSubtaskCount}/{subtasks.length}
                  </span>
                  <Icon
                    name="chevron-right"
                    className={`size-2.5 transition-transform ${
                      subtasksExpanded ? "rotate-90" : ""
                    }`}
                  />
                </button>
              )}

              {commentCount > 0 && (
                <button
                  type="button"
                  aria-label={`${commentCount} ${commentCount === 1 ? "comment" : "comments"}`}
                  onClick={() => openTaskModal(task.id)}
                  className="inline-flex items-center gap-1 text-muted hover:text-foreground"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-3"
                  >
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  <span className="tabular-nums">{commentCount}</span>
                </button>
              )}

              {showProject ? (
                <Link
                  href={
                    project
                      ? `/todos/project/${encodeURIComponent(project.id)}`
                      : "/todos/inbox"
                  }
                  className="inline-flex min-w-0 max-w-full items-center gap-1 text-muted transition-colors hover:text-foreground"
                >
                  {project ? (
                    project.icon ? (
                      <span aria-hidden="true" className="shrink-0 leading-none">
                        {project.icon}
                      </span>
                    ) : (
                      <span
                        aria-hidden="true"
                        className="inline-flex shrink-0 items-center"
                        style={{ color: `var(--notion-${project.color})` }}
                      >
                        <Icon name="hash" className="size-3" />
                      </span>
                    )
                  ) : (
                    <Icon name="inbox" className="size-3 shrink-0" />
                  )}
                  <span className="truncate">
                    {project ? projectDisplayName(project) : "Inbox"}
                    {section ? ` / ${section.name}` : ""}
                  </span>
                </Link>
              ) : (
                showSection &&
                section &&
                task.projectId && (
                  <Link
                    href={buildTodoProjectHref(task.projectId, section.id)}
                    className="inline-flex min-w-0 max-w-full items-center gap-1 text-muted transition-colors hover:text-foreground"
                  >
                    <span className="truncate">{section.name}</span>
                  </Link>
                )
              )}
            </div>
          )}
        </div>
      </div>

      {/* Expandable inline sub-tasks inside card */}
      {subtasksExpanded && subtasks.length > 0 && (
        <ul className="mt-2.5 space-y-2 border-t border-border pt-2.5">
          {subtasks.map((sub) => {
            const subComments = sub.comments?.length ?? 0;
            return (
              <li key={sub.id} className="flex items-start gap-2.5">
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
                    className="todo-checkbox text-xs"
                  />
                </label>
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => openTaskModal(sub.id)}
                    className={`block w-full text-start text-xs leading-snug focus-visible:outline-2 focus-visible:outline-primary ${
                      sub.completed
                        ? "text-muted line-through"
                        : "text-foreground hover:text-primary"
                    }`}
                  >
                    {sub.title}
                  </button>
                  {subComments > 0 && (
                    <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-muted">
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="size-2.5"
                      >
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                      <span className="tabular-nums">{subComments}</span>
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

interface TodoWeekBoardProps {
  weekDays: string[];
  todayIso: string;
  overdueTasks: TodoTask[];
  weekIncludesToday: boolean;
  openByDate: Map<string, TodoTask[]>;
  completedByDate: Map<string, TodoTask[]>;
  subtasksByParent: Map<string, TodoTask[]>;
  showCompleted: boolean;
  showProject?: boolean;
  showSection?: boolean;
  defaultProjectId?: string | null;
  defaultSectionId?: string | null;
  unscheduledTasks?: TodoTask[];
  onSelectDay: (iso: string) => void;
}

/** Todoist-style horizontal multi-column Week board with Overdue + Reschedule and 7 consecutive day lanes. */
export function TodoWeekBoard({
  weekDays,
  todayIso,
  overdueTasks,
  weekIncludesToday,
  openByDate,
  completedByDate,
  subtasksByParent,
  showCompleted,
  showProject = true,
  showSection = false,
  defaultProjectId = null,
  defaultSectionId = null,
  unscheduledTasks,
  onSelectDay,
}: TodoWeekBoardProps) {
  const { sections, rescheduleTasks, updateTask } = useTodos();

  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [hoverDateIso, setHoverDateIso] = useState<
    string | "__unscheduled__" | null
  >(null);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const rescheduleRef = useRef<HTMLDivElement>(null);

  useDismissible(rescheduleOpen, [rescheduleRef], () =>
    setRescheduleOpen(false)
  );

  const sectionById = useMemo(
    () => new Map(sections.map((s) => [s.id, s])),
    [sections]
  );

  const overdueIds = useMemo(
    () => overdueTasks.map((t) => t.id),
    [overdueTasks]
  );

  const showOverdueColumn = weekIncludesToday && overdueTasks.length > 0;

  return (
    <div className="summary-scroller flex items-start gap-4 overflow-x-auto pb-6">
      {showOverdueColumn && (
        <section
          aria-label="Overdue tasks"
          className="w-[17rem] shrink-0 space-y-2.5 sm:w-[17.5rem]"
        >
          <div className="flex items-center justify-between gap-2 px-0.5">
            <div className="flex items-baseline gap-1.5">
              <h2 className="text-xs font-semibold text-foreground">Overdue</h2>
              <span className="text-xs text-muted tabular-nums">
                {overdueTasks.length}
              </span>
            </div>

            <div ref={rescheduleRef} className="relative">
              <button
                type="button"
                aria-expanded={rescheduleOpen}
                onClick={() => setRescheduleOpen((prev) => !prev)}
                className="rounded px-1.5 py-0.5 text-xs font-medium text-primary transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary"
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
                      rescheduleTasks(
                        overdueIds,
                        getNextWeekMondayIso(todayIso)
                      );
                      setRescheduleOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-foreground hover:bg-secondary"
                  >
                    <Icon
                      name="calendar"
                      className="size-3.5 notion-text-purple"
                    />
                    Next week
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2.5">
            {overdueTasks.map((task) => (
              <TodoWeekCard
                key={task.id}
                task={task}
                isOverdueColumn
                showProject={showProject}
                showSection={showSection}
                todayIso={todayIso}
                subtasks={subtasksByParent.get(task.id) ?? []}
                sectionById={sectionById}
                onDragStart={setDraggedTaskId}
                onDragEnd={() => {
                  setDraggedTaskId(null);
                  setHoverDateIso(null);
                }}
              />
            ))}
          </div>
        </section>
      )}

      {weekDays.map((dayIso) => {
        const { dateLabel, relationLabel } = formatWeekColumnHeading(
          dayIso,
          todayIso
        );
        const openList = openByDate.get(dayIso) ?? [];
        const doneList = showCompleted
          ? (completedByDate.get(dayIso) ?? [])
          : [];
        const dayTasks = [...openList, ...doneList];
        const isHover = hoverDateIso === dayIso;

        return (
          <section
            key={dayIso}
            aria-label={`${dateLabel} ${relationLabel}`}
            onDragOver={(e) => {
              if (!draggedTaskId) return;
              e.preventDefault();
              setHoverDateIso(dayIso);
            }}
            onDragLeave={() => {
              setHoverDateIso((curr) => (curr === dayIso ? null : curr));
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const id = e.dataTransfer.getData("text/plain") || draggedTaskId;
              setDraggedTaskId(null);
              setHoverDateIso(null);
              if (id) {
                updateTask(id, { dueDate: dayIso });
              }
            }}
            className={`w-[17rem] shrink-0 space-y-2.5 transition-colors sm:w-[17.5rem] ${
              isHover
                ? "rounded-xl bg-secondary/40 p-1.5 ring-1 ring-primary/50"
                : ""
            }`}
          >
            <div className="flex items-center justify-between gap-2 px-0.5">
              <button
                type="button"
                onClick={() => onSelectDay(dayIso)}
                className="flex min-w-0 items-baseline gap-1.5 rounded px-1 py-0.5 text-start transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary"
              >
                <span className="truncate text-xs font-semibold text-foreground">
                  {dateLabel} · {relationLabel}
                </span>
                {openList.length > 0 && (
                  <span className="shrink-0 text-xs text-muted tabular-nums">
                    {openList.length}
                  </span>
                )}
              </button>
            </div>

            {dayTasks.length > 0 && (
              <div className="space-y-2.5">
                {dayTasks.map((task) => (
                  <TodoWeekCard
                    key={task.id}
                    task={task}
                    showProject={showProject}
                    showSection={showSection}
                    todayIso={todayIso}
                    subtasks={subtasksByParent.get(task.id) ?? []}
                    sectionById={sectionById}
                    onDragStart={setDraggedTaskId}
                    onDragEnd={() => {
                      setDraggedTaskId(null);
                      setHoverDateIso(null);
                    }}
                  />
                ))}
              </div>
            )}

            <InlineAddTaskTrigger
              compact
              defaultProjectId={defaultProjectId}
              defaultSectionId={defaultSectionId}
              defaultDueDate={dayIso}
            />
          </section>
        );
      })}

      {unscheduledTasks !== undefined &&
        (unscheduledTasks.length > 0 || draggedTaskId !== null) && (
          <section
            aria-label="No due date"
            onDragOver={(e) => {
              if (!draggedTaskId) return;
              e.preventDefault();
              setHoverDateIso("__unscheduled__");
            }}
            onDragLeave={() => {
              setHoverDateIso((curr) =>
                curr === "__unscheduled__" ? null : curr
              );
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const id = e.dataTransfer.getData("text/plain") || draggedTaskId;
              setDraggedTaskId(null);
              setHoverDateIso(null);
              if (id) {
                updateTask(id, { dueDate: undefined });
              }
            }}
            className={`w-[17rem] shrink-0 space-y-2.5 transition-colors sm:w-[17.5rem] ${
              hoverDateIso === "__unscheduled__"
                ? "rounded-xl bg-secondary/40 p-1.5 ring-1 ring-primary/50"
                : ""
            }`}
          >
            <div className="flex items-center justify-between gap-2 px-0.5">
              <div className="flex items-baseline gap-1.5 px-1 py-0.5">
                <span className="text-xs font-semibold text-foreground">
                  No due date
                </span>
                {unscheduledTasks.length > 0 && (
                  <span className="shrink-0 text-xs text-muted tabular-nums">
                    {unscheduledTasks.length}
                  </span>
                )}
              </div>
            </div>

            {unscheduledTasks.length > 0 && (
              <div className="space-y-2.5">
                {unscheduledTasks.map((task) => (
                  <TodoWeekCard
                    key={task.id}
                    task={task}
                    showProject={showProject}
                    showSection={showSection}
                    todayIso={todayIso}
                    subtasks={subtasksByParent.get(task.id) ?? []}
                    sectionById={sectionById}
                    onDragStart={setDraggedTaskId}
                    onDragEnd={() => {
                      setDraggedTaskId(null);
                      setHoverDateIso(null);
                    }}
                  />
                ))}
              </div>
            )}

            <InlineAddTaskTrigger
              compact
              defaultProjectId={defaultProjectId}
              defaultSectionId={defaultSectionId}
              defaultDueDate=""
            />
          </section>
        )}
    </div>
  );
}

/** Full-width stacked 7-day Week list view with Overdue + Reschedule and drag-and-drop rescheduling. */
export function TodoWeekList({
  weekDays,
  todayIso,
  overdueTasks,
  weekIncludesToday,
  openByDate,
  completedByDate,
  subtasksByParent,
  showCompleted,
  showProject = true,
  showSection = false,
  defaultProjectId = null,
  defaultSectionId = null,
  unscheduledTasks,
  onSelectDay,
}: TodoWeekBoardProps) {
  const { updateTask } = useTodos();
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [hoverDateIso, setHoverDateIso] = useState<
    string | "__unscheduled__" | null
  >(null);

  return (
    <div className="max-w-3xl space-y-6">
      {weekIncludesToday && (
        <TodoOverdueSection
          overdueTasks={overdueTasks}
          subtasksByParent={subtasksByParent}
          todayIso={todayIso}
          showProject={showProject}
          showSection={showSection}
        />
      )}

      {weekDays.map((dayIso) => {
        const { dateLabel, relationLabel } = formatWeekColumnHeading(
          dayIso,
          todayIso
        );
        const openList = openByDate.get(dayIso) ?? [];
        const doneList = showCompleted
          ? (completedByDate.get(dayIso) ?? [])
          : [];
        const dayTasks = [...openList, ...doneList];
        const isHover = hoverDateIso === dayIso;

        return (
          <section
            key={dayIso}
            aria-label={`${dateLabel} ${relationLabel}`}
            onDragOver={(e) => {
              if (!draggedTaskId) return;
              e.preventDefault();
              setHoverDateIso(dayIso);
            }}
            onDragLeave={() => {
              setHoverDateIso((curr) => (curr === dayIso ? null : curr));
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const id = e.dataTransfer.getData("text/plain") || draggedTaskId;
              setDraggedTaskId(null);
              setHoverDateIso(null);
              if (id) {
                updateTask(id, { dueDate: dayIso });
              }
            }}
            onDragEnd={() => {
              setDraggedTaskId(null);
              setHoverDateIso(null);
            }}
            className={`space-y-1 transition-colors ${
              isHover
                ? "rounded-xl bg-secondary/40 p-2 ring-1 ring-primary/50"
                : ""
            }`}
          >
            <div className="flex items-center justify-between gap-2 border-b border-border pb-1.5">
              <button
                type="button"
                onClick={() => onSelectDay(dayIso)}
                className="inline-flex items-baseline gap-2 rounded px-1 py-0.5 text-start transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary"
              >
                <span className="text-sm font-semibold text-foreground">
                  {dateLabel} · {relationLabel}
                </span>
                {openList.length > 0 && (
                  <span className="text-xs text-muted tabular-nums">
                    {openList.length}
                  </span>
                )}
              </button>
            </div>

            {dayTasks.length > 0 && (
              <div>
                {dayTasks.map((task) => (
                  <TodoTaskRow
                    key={task.id}
                    task={task}
                    showProject={showProject}
                    showSection={showSection}
                    todayIso={todayIso}
                    subtasks={subtasksByParent.get(task.id) ?? []}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", task.id);
                      e.dataTransfer.effectAllowed = "move";
                      setDraggedTaskId(task.id);
                    }}
                  />
                ))}
              </div>
            )}

            <InlineAddTaskTrigger
              compact
              defaultProjectId={defaultProjectId}
              defaultSectionId={defaultSectionId}
              defaultDueDate={dayIso}
            />
          </section>
        );
      })}

      {unscheduledTasks !== undefined &&
        (unscheduledTasks.length > 0 || draggedTaskId !== null) && (
          <section
            aria-label="No due date"
            onDragOver={(e) => {
              if (!draggedTaskId) return;
              e.preventDefault();
              setHoverDateIso("__unscheduled__");
            }}
            onDragLeave={() => {
              setHoverDateIso((curr) =>
                curr === "__unscheduled__" ? null : curr
              );
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const id = e.dataTransfer.getData("text/plain") || draggedTaskId;
              setDraggedTaskId(null);
              setHoverDateIso(null);
              if (id) {
                updateTask(id, { dueDate: undefined });
              }
            }}
            onDragEnd={() => {
              setDraggedTaskId(null);
              setHoverDateIso(null);
            }}
            className={`space-y-1 transition-colors ${
              hoverDateIso === "__unscheduled__"
                ? "rounded-xl bg-secondary/40 p-2 ring-1 ring-primary/50"
                : ""
            }`}
          >
            <div className="flex items-center justify-between gap-2 border-b border-border pb-1.5">
              <div className="inline-flex items-baseline gap-2 px-1 py-0.5">
                <span className="text-sm font-semibold text-foreground">
                  No due date
                </span>
                {unscheduledTasks.length > 0 && (
                  <span className="text-xs text-muted tabular-nums">
                    {unscheduledTasks.length}
                  </span>
                )}
              </div>
            </div>

            {unscheduledTasks.length > 0 && (
              <div>
                {unscheduledTasks.map((task) => (
                  <TodoTaskRow
                    key={task.id}
                    task={task}
                    showProject={showProject}
                    showSection={showSection}
                    todayIso={todayIso}
                    subtasks={subtasksByParent.get(task.id) ?? []}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", task.id);
                      e.dataTransfer.effectAllowed = "move";
                      setDraggedTaskId(task.id);
                    }}
                  />
                ))}
              </div>
            )}

            <InlineAddTaskTrigger
              compact
              defaultProjectId={defaultProjectId}
              defaultSectionId={defaultSectionId}
              defaultDueDate=""
            />
          </section>
        )}
    </div>
  );
}
