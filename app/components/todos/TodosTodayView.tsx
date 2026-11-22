"use client";

import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Icon } from "../../assets/icons";
import { FULL_MONTHS, parsePlainDate } from "../../lib/database-types";
import { useTodos } from "../../lib/todos-store";
import {
  addDaysIso,
  addMonthsIso,
  formatDayHeader,
  isOverdue,
  sortTodoTasks,
  type TodoSortBy,
  type TodoTask,
  type TodoViewLayout,
} from "../../lib/todos-utils";
import { useTodayIsoDate } from "../../lib/use-client-date";
import { TodoMonthBoard, TodoMonthList } from "./TodoMonthViews";
import {
  buildSubtasksMap,
  InlineAddTaskTrigger,
  TodoOverdueSection,
  TodoPriorityBoard,
} from "./TodoSharedBlocks";
import { TodoTaskRow } from "./TodoTaskRow";
import { TodoViewOptionsButton } from "./TodoViewHeader";
import { TodoWeekBoard, TodoWeekList } from "./TodoWeekBoard";

type TodosRangeTab = "day" | "week" | "month";

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

const TABS: ReadonlyArray<{ id: TodosRangeTab; label: string }> = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
];

function formatWeekRangeLabel(startIso: string, endIso: string): string {
  const s = parsePlainDate(startIso);
  const e = parsePlainDate(endIso);
  if (!s || !e) return "";
  if (s.year === e.year) {
    if (s.month === e.month) {
      return `${SHORT_MONTHS[s.month - 1]} ${s.day} – ${e.day}, ${s.year}`;
    }
    return `${SHORT_MONTHS[s.month - 1]} ${s.day} – ${SHORT_MONTHS[e.month - 1]} ${e.day}, ${s.year}`;
  }
  return `${SHORT_MONTHS[s.month - 1]} ${s.day}, ${s.year} – ${SHORT_MONTHS[e.month - 1]} ${e.day}, ${e.year}`;
}

/** Main Todos page (/todos) with full-width Day, Week, and Month tabs plus List/Board switcher. */
export function TodosTodayView() {
  const todayIso = useTodayIsoDate() ?? "";
  const { hydrated, tasks, activeTasks } = useTodos();

  const baseId = useId();
  const [activeTab, setActiveTab] = useState<TodosRangeTab>("day");
  const [cursorIso, setCursorIso] = useState<string | null>(null);
  const [layoutsByTab, setLayoutsByTab] = useState<
    Record<TodosRangeTab, TodoViewLayout>
  >({
    day: "list",
    week: "board",
    month: "board",
  });
  const [sortBy, setSortBy] = useState<TodoSortBy>("manual");
  const [showCompleted, setShowCompleted] = useState(false);

  const tabRefs = useRef<Record<TodosRangeTab, HTMLButtonElement | null>>({
    day: null,
    week: null,
    month: null,
  });
  const dayPanelRef = useRef<HTMLDivElement>(null);
  const weekPanelRef = useRef<HTMLDivElement>(null);
  const monthPanelRef = useRef<HTMLDivElement>(null);

  const selectedIso = cursorIso ?? todayIso;
  const subtasksByParent = useMemo(() => buildSubtasksMap(tasks), [tasks]);

  const selectTab = useCallback((nextTab: TodosRangeTab) => {
    setActiveTab(nextTab);
    requestAnimationFrame(() => {
      tabRefs.current[nextTab]?.scrollIntoView({
        block: "nearest",
        inline: "nearest",
      });
    });
  }, []);

  // Sync tab state when browser find-in-page reveals content inside a hidden="until-found" panel.
  useEffect(() => {
    const entries: Array<[TodosRangeTab, HTMLDivElement | null]> = [
      ["day", dayPanelRef.current],
      ["week", weekPanelRef.current],
      ["month", monthPanelRef.current],
    ];
    const cleanups: Array<() => void> = [];
    for (const [tabId, el] of entries) {
      if (!el) continue;
      const onBeforeMatch = () => selectTab(tabId);
      el.addEventListener("beforematch", onBeforeMatch);
      cleanups.push(() => el.removeEventListener("beforematch", onBeforeMatch));
    }
    return () => {
      for (const cleanup of cleanups) cleanup();
    };
  }, [hydrated, selectTab]);

  const handleTabKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    idx: number
  ) => {
    let nextIdx: number | null = null;
    if (event.key === "ArrowRight") {
      nextIdx = (idx + 1) % TABS.length;
    } else if (event.key === "ArrowLeft") {
      nextIdx = (idx - 1 + TABS.length) % TABS.length;
    } else if (event.key === "Home") {
      nextIdx = 0;
    } else if (event.key === "End") {
      nextIdx = TABS.length - 1;
    }
    if (nextIdx === null) return;
    event.preventDefault();
    const nextTab = TABS[nextIdx].id;
    selectTab(nextTab);
    tabRefs.current[nextTab]?.focus();
  };

  // Top-level tasks grouped by dueDate
  const { overdueTasks, openByDate, completedByDate } = useMemo(() => {
    const overdue: TodoTask[] = [];
    const openMap = new Map<string, TodoTask[]>();
    const doneMap = new Map<string, TodoTask[]>();

    for (const task of tasks) {
      if (task.parentId || !task.dueDate) continue;
      if (task.completed) {
        const list = doneMap.get(task.dueDate) ?? [];
        list.push(task);
        doneMap.set(task.dueDate, list);
      } else {
        if (todayIso && isOverdue(task.dueDate, todayIso)) {
          overdue.push(task);
        }
        const list = openMap.get(task.dueDate) ?? [];
        list.push(task);
        openMap.set(task.dueDate, list);
      }
    }

    for (const [iso, list] of openMap.entries()) {
      openMap.set(iso, sortTodoTasks(list, sortBy));
    }
    for (const [iso, list] of doneMap.entries()) {
      doneMap.set(
        iso,
        list.sort((a, b) =>
          (b.completedAt ?? b.updatedAt).localeCompare(
            a.completedAt ?? a.updatedAt
          )
        )
      );
    }

    return {
      overdueTasks: sortTodoTasks(overdue, sortBy),
      openByDate: openMap,
      completedByDate: doneMap,
    };
  }, [sortBy, tasks, todayIso]);

  // Day tab computations
  const dayOpenTasks = useMemo(
    () => (selectedIso ? (openByDate.get(selectedIso) ?? []) : []),
    [openByDate, selectedIso]
  );
  const dayCompletedTasks = useMemo(
    () => (selectedIso ? (completedByDate.get(selectedIso) ?? []) : []),
    [completedByDate, selectedIso]
  );
  const isViewingToday = Boolean(todayIso && selectedIso === todayIso);

  // Week tab computations (7 consecutive days starting at selectedIso)
  const weekDays = useMemo(() => {
    if (!selectedIso) return [];
    return Array.from({ length: 7 }, (_, i) => addDaysIso(selectedIso, i));
  }, [selectedIso]);

  const weekIncludesToday = Boolean(todayIso && weekDays.includes(todayIso));
  const weekOpenCount = useMemo(() => {
    let total = weekIncludesToday ? overdueTasks.length : 0;
    for (const d of weekDays) {
      total += openByDate.get(d)?.length ?? 0;
    }
    return total;
  }, [openByDate, overdueTasks.length, weekDays, weekIncludesToday]);

  // Month tab computations
  const monthParts = useMemo(
    () => (selectedIso ? parsePlainDate(selectedIso) : null),
    [selectedIso]
  );

  const monthOpenCount = useMemo(() => {
    if (!monthParts) return 0;
    const prefix = `${String(monthParts.year).padStart(4, "0")}-${String(
      monthParts.month
    ).padStart(2, "0")}-`;
    let count = 0;
    for (const task of activeTasks) {
      if (!task.parentId && task.dueDate?.startsWith(prefix)) {
        count += 1;
      }
    }
    return count;
  }, [activeTasks, monthParts]);

  const handleStep = (direction: -1 | 1) => {
    if (!selectedIso) return;
    if (activeTab === "day") {
      setCursorIso(addDaysIso(selectedIso, direction));
    } else if (activeTab === "week") {
      setCursorIso(addDaysIso(selectedIso, direction * 7));
    } else {
      setCursorIso(addMonthsIso(selectedIso, direction));
    }
  };

  if (!hydrated || !todayIso) {
    return (
      <div className="w-full px-4 py-6 text-sm text-muted sm:px-8 lg:px-10">
        Loading…
      </div>
    );
  }

  const dayHeader = formatDayHeader(selectedIso, todayIso);
  const subtitle =
    activeTab === "day"
      ? `${dayHeader.primary} · ${dayHeader.secondary}`
      : activeTab === "week" && weekDays.length === 7
        ? formatWeekRangeLabel(weekDays[0], weekDays[6])
        : monthParts
          ? `${FULL_MONTHS[monthParts.month - 1]} ${monthParts.year}`
          : "";

  const activeCount =
    activeTab === "day"
      ? dayOpenTasks.length + (isViewingToday ? overdueTasks.length : 0)
      : activeTab === "week"
        ? weekOpenCount
        : monthOpenCount;

  const activeLayout = layoutsByTab[activeTab];
  const setActiveLayout = (next: TodoViewLayout) =>
    setLayoutsByTab((prev) => ({ ...prev, [activeTab]: next }));

  const dayCombinedBoardTasks = isViewingToday
    ? [...overdueTasks, ...dayOpenTasks]
    : dayOpenTasks;

  return (
    <div className="w-full space-y-5 px-4 py-6 sm:px-8 lg:px-10">
      {/* Header + View Switcher + Date Stepper + View Options + Tabs */}
      <header className="space-y-3 border-b border-border">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Todos
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
              <span className="inline-flex items-center gap-1">
                <Icon name="check-circle" className="size-3.5" />
                <span className="tabular-nums">
                  {activeCount} {activeCount === 1 ? "task" : "tasks"}
                </span>
              </span>
              {subtitle && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{subtitle}</span>
                </>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* List | Board view switcher */}
            <div
              role="group"
              aria-label="View layout"
              className="inline-flex items-center rounded-md border border-border bg-surface p-0.5"
            >
              <button
                type="button"
                aria-pressed={activeLayout === "list"}
                onClick={() => setActiveLayout("list")}
                className={`inline-flex h-7 items-center gap-1.5 rounded px-2.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
                  activeLayout === "list"
                    ? "bg-canvas text-foreground shadow-2xs"
                    : "text-muted hover:text-foreground"
                }`}
              >
                <Icon name="list" className="size-3.5" />
                <span>List</span>
              </button>
              <button
                type="button"
                aria-pressed={activeLayout === "board"}
                onClick={() => setActiveLayout("board")}
                className={`inline-flex h-7 items-center gap-1.5 rounded px-2.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
                  activeLayout === "board"
                    ? "bg-canvas text-foreground shadow-2xs"
                    : "text-muted hover:text-foreground"
                }`}
              >
                <Icon name="board" className="size-3.5" />
                <span>Board</span>
              </button>
            </div>

            {/* Stepper */}
            <div className="inline-flex items-center rounded-md border border-border bg-surface p-0.5">
              <button
                type="button"
                aria-label={
                  activeTab === "day"
                    ? "Previous day"
                    : activeTab === "week"
                      ? "Previous week"
                      : "Previous month"
                }
                onClick={() => handleStep(-1)}
                className="inline-flex size-7 items-center justify-center rounded text-muted transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
              >
                <Icon name="chevron-right" className="size-3.5 rotate-180" />
              </button>
              <button
                type="button"
                onClick={() => setCursorIso(null)}
                className={`h-7 rounded px-2.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
                  cursorIso === null || cursorIso === todayIso
                    ? "bg-canvas text-foreground shadow-2xs"
                    : "text-muted hover:text-foreground"
                }`}
              >
                Today
              </button>
              <button
                type="button"
                aria-label={
                  activeTab === "day"
                    ? "Next day"
                    : activeTab === "week"
                      ? "Next week"
                      : "Next month"
                }
                onClick={() => handleStep(1)}
                className="inline-flex size-7 items-center justify-center rounded text-muted transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
              >
                <Icon name="chevron-right" className="size-3.5" />
              </button>
            </div>

            <TodoViewOptionsButton
              sortBy={sortBy}
              onSortChange={setSortBy}
              showCompleted={showCompleted}
              onShowCompletedChange={setShowCompleted}
            />
          </div>
        </div>

        {/* Day | Week | Month Tabs */}
        <div
          role="tablist"
          aria-label="Todo view range"
          {...({ focusgroup: "tablist nomemory" } as Record<string, string>)}
          className="todo-tabs-list -mb-px flex items-center gap-1"
        >
          {TABS.map((tab, idx) => {
            const isSelected = activeTab === tab.id;
            const tabId = `${baseId}-tab-${tab.id}`;
            return (
              <button
                key={tab.id}
                ref={(el) => {
                  tabRefs.current[tab.id] = el;
                }}
                type="button"
                id={tabId}
                role="tab"
                aria-selected={isSelected}
                tabIndex={isSelected ? 0 : -1}
                {...(isSelected ? { focusgroupstart: "" } : {})}
                onClick={() => selectTab(tab.id)}
                onKeyDown={(e) => handleTabKeyDown(e, idx)}
                className="todo-tab rounded-t-md px-3 py-2 text-xs font-medium text-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </header>

      {/* Tab Panels wrapper (no gap between panels; hidden="until-found" on inactive panels) */}
      <div>
        {/* DAY PANEL */}
        <div
          ref={dayPanelRef}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-day`}
          {...(activeTab !== "day"
            ? { hidden: "until-found" as unknown as boolean }
            : {})}
        >
          <div className="space-y-6">
            {layoutsByTab.day === "board" ? (
              <div className="space-y-6">
                {isViewingToday && (
                  <div className="max-w-3xl">
                    <TodoOverdueSection
                      overdueTasks={overdueTasks}
                      subtasksByParent={subtasksByParent}
                      todayIso={todayIso}
                      showProject
                    />
                  </div>
                )}
                <TodoPriorityBoard
                  tasks={dayCombinedBoardTasks}
                  subtasksByParent={subtasksByParent}
                  todayIso={todayIso}
                  showProject
                  defaultDueDate={selectedIso}
                />
              </div>
            ) : (
              <div className="max-w-3xl space-y-6">
                {isViewingToday && (
                  <TodoOverdueSection
                    overdueTasks={overdueTasks}
                    subtasksByParent={subtasksByParent}
                    todayIso={todayIso}
                    showProject
                  />
                )}

                <section aria-label={dayHeader.primary} className="space-y-1">
                  {isViewingToday && overdueTasks.length > 0 && (
                    <h2 className="border-b border-border pb-1.5 text-sm font-semibold text-foreground">
                      {dayHeader.primary} · {dayHeader.secondary}
                    </h2>
                  )}

                  {dayOpenTasks.length > 0 && (
                    <div>
                      {dayOpenTasks.map((task) => (
                        <TodoTaskRow
                          key={task.id}
                          task={task}
                          showProject
                          todayIso={todayIso}
                          subtasks={subtasksByParent.get(task.id) ?? []}
                        />
                      ))}
                    </div>
                  )}

                  <InlineAddTaskTrigger defaultDueDate={selectedIso} />
                </section>

                {dayOpenTasks.length === 0 &&
                  (!isViewingToday || overdueTasks.length === 0) && (
                    <div className="rounded-xl border border-dashed border-border bg-surface/60 px-6 py-10 text-center">
                      <Icon
                        name="check-circle"
                        className="mx-auto size-9 text-success/80"
                      />
                      <p className="mt-3 text-sm font-semibold text-foreground">
                        {isViewingToday
                          ? "You're all caught up for today"
                          : `Nothing scheduled for ${dayHeader.primary}`}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        Press{" "}
                        <kbd className="rounded border border-border bg-canvas px-1.5 py-0.5 font-mono text-[10px]">
                          Q
                        </kbd>{" "}
                        anywhere in Todos or click Add task above to schedule
                        something.
                      </p>
                    </div>
                  )}

                {showCompleted && dayCompletedTasks.length > 0 && (
                  <section
                    aria-label="Completed tasks for day"
                    className="space-y-1 pt-2"
                  >
                    <h2 className="border-b border-border pb-1.5 text-xs font-semibold tracking-wider text-muted uppercase">
                      Completed ({dayCompletedTasks.length})
                    </h2>
                    <div>
                      {dayCompletedTasks.map((task) => (
                        <TodoTaskRow
                          key={task.id}
                          task={task}
                          showProject
                          todayIso={todayIso}
                          subtasks={subtasksByParent.get(task.id) ?? []}
                        />
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}
          </div>
        </div>

        {/* WEEK PANEL */}
        <div
          ref={weekPanelRef}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-week`}
          {...(activeTab !== "week"
            ? { hidden: "until-found" as unknown as boolean }
            : {})}
        >
          {layoutsByTab.week === "board" ? (
            <TodoWeekBoard
              weekDays={weekDays}
              todayIso={todayIso}
              overdueTasks={overdueTasks}
              weekIncludesToday={weekIncludesToday}
              openByDate={openByDate}
              completedByDate={completedByDate}
              subtasksByParent={subtasksByParent}
              showCompleted={showCompleted}
              onSelectDay={(dayIso) => {
                setCursorIso(dayIso);
                selectTab("day");
              }}
            />
          ) : (
            <TodoWeekList
              weekDays={weekDays}
              todayIso={todayIso}
              overdueTasks={overdueTasks}
              weekIncludesToday={weekIncludesToday}
              openByDate={openByDate}
              completedByDate={completedByDate}
              subtasksByParent={subtasksByParent}
              showCompleted={showCompleted}
              onSelectDay={(dayIso) => {
                setCursorIso(dayIso);
                selectTab("day");
              }}
            />
          )}
        </div>

        {/* MONTH PANEL */}
        <div
          ref={monthPanelRef}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-month`}
          {...(activeTab !== "month"
            ? { hidden: "until-found" as unknown as boolean }
            : {})}
        >
          {layoutsByTab.month === "board" ? (
            <TodoMonthBoard
              selectedIso={selectedIso}
              todayIso={todayIso}
              overdueTasks={overdueTasks}
              openByDate={openByDate}
              completedByDate={completedByDate}
              subtasksByParent={subtasksByParent}
              showCompleted={showCompleted}
              onSelectDay={(dayIso) => {
                setCursorIso(dayIso);
                selectTab("day");
              }}
            />
          ) : (
            <TodoMonthList
              selectedIso={selectedIso}
              todayIso={todayIso}
              overdueTasks={overdueTasks}
              openByDate={openByDate}
              completedByDate={completedByDate}
              subtasksByParent={subtasksByParent}
              showCompleted={showCompleted}
              onSelectDay={(dayIso) => {
                setCursorIso(dayIso);
                selectTab("day");
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
