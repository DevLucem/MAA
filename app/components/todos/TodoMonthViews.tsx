"use client";

import { useMemo, useState } from "react";
import { Icon } from "../../assets/icons";
import {
  addMonthsPlainDate,
  dayOfWeek,
  daysInMonth,
  formatPlainDate,
  parsePlainDate,
  type PlainDateParts,
} from "../../lib/database-types";
import { useTodos } from "../../lib/todos-store";
import type { TodoTask } from "../../lib/todos-utils";
import { InlineAddTaskTrigger, TodoOverdueSection } from "./TodoSharedBlocks";
import { TodoTaskRow } from "./TodoTaskRow";
import { formatWeekColumnHeading } from "./TodoWeekBoard";

const WEEKDAY_HEADERS = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
] as const;

export interface TodoMonthViewProps {
  selectedIso: string;
  todayIso: string;
  overdueTasks: TodoTask[];
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

/** Full-width 7-column Monthly Calendar Board with drag-and-drop rescheduling. */
export function TodoMonthBoard({
  selectedIso,
  todayIso,
  openByDate,
  completedByDate,
  showCompleted,
  showProject = true,
  defaultProjectId = null,
  defaultSectionId = null,
  unscheduledTasks,
  onSelectDay,
}: TodoMonthViewProps) {
  const { getProject, toggleTaskComplete, updateTask, openQuickAdd, openTaskModal } =
    useTodos();

  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [hoverDateIso, setHoverDateIso] = useState<
    string | "__unscheduled__" | null
  >(null);

  const monthParts = useMemo(
    () => (selectedIso ? parsePlainDate(selectedIso) : null),
    [selectedIso]
  );

  const gridCells = useMemo(() => {
    if (!monthParts) return [];
    const firstOfMonth: PlainDateParts = {
      year: monthParts.year,
      month: monthParts.month,
      day: 1,
    };
    const startOffset = dayOfWeek(firstOfMonth);
    const totalDays = daysInMonth(monthParts.year, monthParts.month);
    const totalCells = Math.ceil((startOffset + totalDays) / 7) * 7;

    const prevMonth = addMonthsPlainDate(monthParts.year, monthParts.month, -1);
    const prevMonthDays = daysInMonth(prevMonth.year, prevMonth.month);
    const nextMonth = addMonthsPlainDate(monthParts.year, monthParts.month, 1);

    const cells: Array<{
      date: PlainDateParts;
      iso: string;
      inCurrentMonth: boolean;
    }> = [];

    for (let i = 0; i < totalCells; i += 1) {
      if (i < startOffset) {
        const day = prevMonthDays - startOffset + i + 1;
        const date = { year: prevMonth.year, month: prevMonth.month, day };
        cells.push({
          date,
          iso: formatPlainDate(date),
          inCurrentMonth: false,
        });
      } else if (i < startOffset + totalDays) {
        const day = i - startOffset + 1;
        const date = { year: monthParts.year, month: monthParts.month, day };
        cells.push({
          date,
          iso: formatPlainDate(date),
          inCurrentMonth: true,
        });
      } else {
        const day = i - (startOffset + totalDays) + 1;
        const date = { year: nextMonth.year, month: nextMonth.month, day };
        cells.push({
          date,
          iso: formatPlainDate(date),
          inCurrentMonth: false,
        });
      }
    }
    return cells;
  }, [monthParts]);

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-border bg-canvas">
        <div className="grid grid-cols-7 border-b border-border bg-surface text-center text-[11px] font-semibold text-muted">
          {WEEKDAY_HEADERS.map((wd) => (
            <div key={wd} className="py-2">
              {wd}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {gridCells.map((cell, idx) => {
            const openList = openByDate.get(cell.iso) ?? [];
            const doneList = showCompleted
              ? (completedByDate.get(cell.iso) ?? [])
              : [];
            const cellTasks = [...openList, ...doneList];
            const visibleTasks = cellTasks.slice(0, 3);
            const overflowCount = cellTasks.length - visibleTasks.length;
            const isToday = cell.iso === todayIso;
            const isHover = hoverDateIso === cell.iso;
            const isLastRow = idx >= gridCells.length - 7;

            return (
              <div
                key={cell.iso}
                onDragOver={(e) => {
                  if (!draggedTaskId) return;
                  e.preventDefault();
                  setHoverDateIso(cell.iso);
                }}
                onDragLeave={() => {
                  setHoverDateIso((curr) => (curr === cell.iso ? null : curr));
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const id = e.dataTransfer.getData("text/plain") || draggedTaskId;
                  setDraggedTaskId(null);
                  setHoverDateIso(null);
                  if (id) {
                    updateTask(id, { dueDate: cell.iso });
                  }
                }}
                className={`group flex min-h-28 flex-col border-e border-border p-1.5 transition-colors [&:nth-child(7n)]:border-e-0 ${
                  isLastRow ? "" : "border-b"
                } ${
                  isHover
                    ? "bg-secondary/70"
                    : cell.inCurrentMonth
                      ? "bg-canvas"
                      : "bg-surface/40"
                }`}
              >
                <div className="mb-1 flex items-center justify-between gap-1">
                  <button
                    type="button"
                    aria-label={`View ${cell.iso}`}
                    onClick={() => onSelectDay(cell.iso)}
                    className={`inline-flex size-6 items-center justify-center rounded-full text-xs font-medium tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
                      isToday
                        ? "primary font-semibold"
                        : cell.inCurrentMonth
                          ? "text-foreground hover:bg-secondary"
                          : "text-muted/60 hover:bg-secondary"
                    }`}
                  >
                    {cell.date.day}
                  </button>

                  <button
                    type="button"
                    aria-label={`Add task for ${cell.iso}`}
                    title="Add task"
                    onClick={() =>
                      openQuickAdd({
                        defaultDueDate: cell.iso,
                        ...(defaultProjectId !== undefined
                          ? { defaultProjectId }
                          : {}),
                        ...(defaultSectionId ? { defaultSectionId } : {}),
                      })
                    }
                    className="inline-flex size-5 items-center justify-center rounded text-muted opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-secondary hover:text-foreground focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    <Icon name="plus" className="size-3" />
                  </button>
                </div>

                <div className="space-y-1">
                  {visibleTasks.map((task) => {
                    const project = task.projectId
                      ? getProject(task.projectId)
                      : undefined;
                    return (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", task.id);
                          e.dataTransfer.effectAllowed = "move";
                          setDraggedTaskId(task.id);
                        }}
                        onDragEnd={() => {
                          setDraggedTaskId(null);
                          setHoverDateIso(null);
                        }}
                        className="flex items-center gap-1.5 rounded border border-border/80 bg-surface px-1.5 py-0.5 text-[11px]"
                      >
                        <label className="inline-flex size-5 -m-1 shrink-0 cursor-pointer items-center justify-center">
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
                            className="todo-checkbox text-[10px]"
                          />
                        </label>

                        <button
                          type="button"
                          onClick={() => openTaskModal(task.id)}
                          className={`min-w-0 flex-1 truncate text-start focus-visible:outline-2 focus-visible:outline-primary ${
                            task.completed
                              ? "text-muted line-through"
                              : "text-foreground hover:text-primary"
                          }`}
                        >
                          {task.title}
                        </button>

                        {showProject && project && (
                          <span
                            aria-hidden="true"
                            className="size-1.5 shrink-0 rounded-full"
                            style={{
                              backgroundColor: `var(--notion-${project.color})`,
                            }}
                          />
                        )}
                      </div>
                    );
                  })}

                  {overflowCount > 0 && (
                    <button
                      type="button"
                      onClick={() => onSelectDay(cell.iso)}
                      className="w-full rounded px-1 py-0.5 text-start text-[10px] font-medium text-muted hover:bg-secondary hover:text-foreground"
                    >
                      +{overflowCount} more
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

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
            className={`space-y-2 rounded-xl border p-3 transition-colors ${
              hoverDateIso === "__unscheduled__"
                ? "border-primary bg-secondary/40"
                : "border-border bg-surface/60"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-baseline gap-1.5">
                <span className="text-xs font-semibold text-foreground">
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
              <div className="flex flex-wrap gap-2">
                {unscheduledTasks.map((task) => (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", task.id);
                      e.dataTransfer.effectAllowed = "move";
                      setDraggedTaskId(task.id);
                    }}
                    onDragEnd={() => {
                      setDraggedTaskId(null);
                      setHoverDateIso(null);
                    }}
                    className="flex max-w-64 items-center gap-1.5 rounded-md border border-border bg-canvas px-2 py-1 text-xs"
                  >
                    <label className="inline-flex size-5 -m-1 shrink-0 cursor-pointer items-center justify-center">
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
                        className="todo-checkbox text-[10px]"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => openTaskModal(task.id)}
                      className={`min-w-0 flex-1 truncate text-start focus-visible:outline-2 focus-visible:outline-primary ${
                        task.completed
                          ? "text-muted line-through"
                          : "text-foreground hover:text-primary"
                      }`}
                    >
                      {task.title}
                    </button>
                  </div>
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

/** Full-width chronological Monthly Agenda List grouped by active dates in the displayed month. */
export function TodoMonthList({
  selectedIso,
  todayIso,
  overdueTasks,
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
}: TodoMonthViewProps) {
  const { updateTask } = useTodos();
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [hoverDateIso, setHoverDateIso] = useState<
    string | "__unscheduled__" | null
  >(null);

  const monthParts = useMemo(
    () => (selectedIso ? parsePlainDate(selectedIso) : null),
    [selectedIso]
  );

  const todayParts = useMemo(
    () => (todayIso ? parsePlainDate(todayIso) : null),
    [todayIso]
  );

  const monthIncludesToday = Boolean(
    monthParts &&
      todayParts &&
      monthParts.year === todayParts.year &&
      monthParts.month === todayParts.month
  );

  const activeDayIsos = useMemo(() => {
    if (!monthParts) return [];
    const totalDays = daysInMonth(monthParts.year, monthParts.month);
    const out: string[] = [];
    for (let d = 1; d <= totalDays; d += 1) {
      const iso = formatPlainDate({
        year: monthParts.year,
        month: monthParts.month,
        day: d,
      });
      const openCount = openByDate.get(iso)?.length ?? 0;
      const doneCount = showCompleted
        ? (completedByDate.get(iso)?.length ?? 0)
        : 0;
      if (openCount > 0 || doneCount > 0 || iso === todayIso) {
        out.push(iso);
      }
    }
    return out;
  }, [completedByDate, monthParts, openByDate, showCompleted, todayIso]);

  const firstDayOfMonthIso = monthParts
    ? formatPlainDate({ year: monthParts.year, month: monthParts.month, day: 1 })
    : todayIso;

  const hasUnscheduled = Boolean(
    unscheduledTasks && unscheduledTasks.length > 0
  );

  return (
    <div className="max-w-3xl space-y-6">
      {monthIncludesToday && (
        <TodoOverdueSection
          overdueTasks={overdueTasks}
          subtasksByParent={subtasksByParent}
          todayIso={todayIso}
          showProject={showProject}
          showSection={showSection}
        />
      )}

      {activeDayIsos.length === 0 && !hasUnscheduled ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-dashed border-border bg-surface/60 px-6 py-10 text-center">
            <Icon
              name="calendar"
              className="mx-auto size-9 text-muted/70"
            />
            <p className="mt-3 text-sm font-semibold text-foreground">
              No tasks scheduled for this month
            </p>
            <p className="mt-1 text-xs text-muted">
              Add a task below or switch to Board view to schedule on the
              calendar.
            </p>
          </div>
          <InlineAddTaskTrigger
            defaultProjectId={defaultProjectId}
            defaultSectionId={defaultSectionId}
            defaultDueDate={firstDayOfMonthIso}
          />
        </div>
      ) : (
        activeDayIsos.map((dayIso) => {
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
                const id =
                  e.dataTransfer.getData("text/plain") || draggedTaskId;
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
        })
      )}

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
