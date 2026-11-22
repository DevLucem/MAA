"use client";

import Link from "next/link";
import {
  type FormEvent,
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
import type {
  TodoEmbedConfig,
  TodoEmbedLayout,
  TodoEmbedRange,
} from "../../lib/docs-utils";
import { useTodos } from "../../lib/todos-store";
import {
  addDaysIso,
  addMonthsIso,
  buildTodoProjectHref,
  flattenProjectTree,
  formatDayHeader,
  isOverdue,
  parseTodoEmbedLink,
  projectDisplayName,
  sortTodoTasks,
  type TodoProject,
  type TodoSection,
  type TodoSortBy,
  type TodoTask,
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

const RANGE_TABS: ReadonlyArray<{ id: TodoEmbedRange; label: string }> = [
  { id: "all", label: "All" },
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
  return `${SHORT_MONTHS[s.month - 1]} ${s.day}, ${s.year} – ${SHORT_MONTHS[e.month - 1]} ${e.day}, ${s.year}`;
}

export interface InlineTodoEmbedBlockProps {
  config?: TodoEmbedConfig;
  fallbackLabel?: string;
  onUpdateConfig: (next: TodoEmbedConfig, label?: string) => void;
}

/** Inline picker shown when a `todo-embed` block is created via slash command before choosing a project or section. */
function TodoEmbedPicker({
  fallbackLabel,
  onUpdateConfig,
}: {
  fallbackLabel?: string;
  onUpdateConfig: (next: TodoEmbedConfig, label?: string) => void;
}) {
  const { projects, sections, getProject } = useTodos();
  const urlInputId = useId();
  const projectSelectId = useId();
  const sectionSelectId = useId();

  const flattened = useMemo(() => flattenProjectTree(projects), [projects]);
  const [selectedProjectId, setSelectedProjectId] = useState(
    () => flattened[0]?.project.id ?? ""
  );
  const [selectedSectionId, setSelectedSectionId] = useState("");
  const [urlDraft, setUrlDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const effectiveProjectId = projects.some((p) => p.id === selectedProjectId)
    ? selectedProjectId
    : (flattened[0]?.project.id ?? "");

  const projectSections = useMemo(
    () =>
      sections
        .filter((s) => s.projectId === effectiveProjectId)
        .sort(
          (a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt)
        ),
    [effectiveProjectId, sections]
  );

  const effectiveSectionId = projectSections.some(
    (s) => s.id === selectedSectionId
  )
    ? selectedSectionId
    : "";

  const handleSubmitSelection = (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (urlDraft.trim()) {
      const origin =
        typeof window !== "undefined" ? window.location.origin : undefined;
      const parsed = parseTodoEmbedLink(urlDraft, origin);
      if (!parsed) {
        setError("Enter a valid MAA Todo project or section link.");
        return;
      }
      const targetProject = getProject(parsed.projectId);
      if (!targetProject) {
        setError("That Todo project was not found in your active projects.");
        return;
      }
      const targetSection = parsed.sectionId
        ? sections.find(
            (s) => s.id === parsed.sectionId && s.projectId === targetProject.id
          )
        : undefined;
      if (parsed.sectionId && !targetSection) {
        setError("That section was not found inside the linked project.");
        return;
      }
      const label = targetSection
        ? `${projectDisplayName(targetProject)} / ${targetSection.name}`
        : projectDisplayName(targetProject);
      onUpdateConfig(
        {
          projectId: targetProject.id,
          ...(targetSection ? { sectionId: targetSection.id } : {}),
          range: "all",
          layout: "list",
        },
        label
      );
      return;
    }

    const chosenProject = getProject(effectiveProjectId);
    if (!chosenProject) {
      setError("Create a Todo project first or paste a project/section link.");
      return;
    }
    const chosenSection = effectiveSectionId
      ? projectSections.find((s) => s.id === effectiveSectionId)
      : undefined;
    const label = chosenSection
      ? `${projectDisplayName(chosenProject)} / ${chosenSection.name}`
      : projectDisplayName(chosenProject);
    onUpdateConfig(
      {
        projectId: chosenProject.id,
        ...(chosenSection ? { sectionId: chosenSection.id } : {}),
        range: "all",
        layout: "list",
      },
      label
    );
  };

  return (
    <form
      onSubmit={handleSubmitSelection}
      className="space-y-3 rounded-xl border border-border bg-surface/60 p-4"
    >
      <div className="flex items-center gap-2">
        <Icon name="check-circle" className="size-4 shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">
            {fallbackLabel || "Embed Todo project or section"}
          </p>
          <p className="text-xs text-muted">
            Paste a copied Todo link or pick a project/section below. Sections
            show all tasks; projects show tasks with a due date.
          </p>
        </div>
      </div>

      <div className="space-y-1">
        <label
          htmlFor={urlInputId}
          className="block text-[11px] font-medium text-muted"
        >
          Paste project or section link (optional)
        </label>
        <input
          id={urlInputId}
          type="text"
          value={urlDraft}
          onChange={(e) => {
            setUrlDraft(e.currentTarget.value);
            setError(null);
          }}
          placeholder="/todos/project/... or full copied URL"
          className="h-8 w-full rounded-md border border-border bg-canvas px-2.5 text-xs text-foreground placeholder:text-muted focus-visible:outline-2 focus-visible:outline-primary"
        />
      </div>

      {flattened.length > 0 && !urlDraft.trim() && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <label
              htmlFor={projectSelectId}
              className="block text-[11px] font-medium text-muted"
            >
              Project
            </label>
            <select
              id={projectSelectId}
              value={effectiveProjectId}
              onChange={(e) => {
                setSelectedProjectId(e.currentTarget.value);
                setSelectedSectionId("");
                setError(null);
              }}
              className="h-8 w-full rounded-md border border-border bg-canvas px-2 text-xs text-foreground focus-visible:outline-2 focus-visible:outline-primary"
            >
              {flattened.map(({ project, depth }) => (
                <option key={project.id} value={project.id}>
                  {"\u00A0".repeat(depth * 2)}
                  {projectDisplayName(project)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label
              htmlFor={sectionSelectId}
              className="block text-[11px] font-medium text-muted"
            >
              Scope
            </label>
            <select
              id={sectionSelectId}
              value={effectiveSectionId}
              onChange={(e) => {
                setSelectedSectionId(e.currentTarget.value);
                setError(null);
              }}
              className="h-8 w-full rounded-md border border-border bg-canvas px-2 text-xs text-foreground focus-visible:outline-2 focus-visible:outline-primary"
            >
              <option value="">Entire project (due dates only)</option>
              {projectSections.map((sec) => (
                <option key={sec.id} value={sec.id}>
                  Section: {sec.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        <button
          type="submit"
          className="primary inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium focus-visible:outline-2 focus-visible:outline-primary"
        >
          <Icon name="check-circle" className="size-3.5" />
          <span>Embed tasks</span>
        </button>
      </div>
    </form>
  );
}

interface CompletedSectionProps {
  tasks: TodoTask[];
  subtasksByParent: Map<string, TodoTask[]>;
  todayIso: string;
  showSection: boolean;
}

function CompletedTasksList({
  tasks,
  subtasksByParent,
  todayIso,
  showSection,
}: CompletedSectionProps) {
  if (tasks.length === 0) return null;
  return (
    <section
      aria-label="Completed tasks"
      className="max-w-3xl space-y-1 pt-2"
    >
      <h4 className="border-b border-border pb-1.5 text-xs font-semibold tracking-wider text-muted uppercase">
        Completed ({tasks.length})
      </h4>
      <div>
        {tasks.map((task) => (
          <TodoTaskRow
            key={task.id}
            task={task}
            showProject={false}
            showSection={showSection}
            todayIso={todayIso}
            subtasks={subtasksByParent.get(task.id) ?? []}
          />
        ))}
      </div>
    </section>
  );
}

function InlineTodoEmbedContent({
  config,
  fallbackLabel,
  onUpdateConfig,
}: {
  config: TodoEmbedConfig;
  fallbackLabel?: string;
  onUpdateConfig: (next: TodoEmbedConfig, label?: string) => void;
}) {
  const todayIso = useTodayIsoDate() ?? "";
  const {
    hydrated,
    sections,
    tasks,
    getProject,
    getAnyProject,
    restoreProjects,
  } = useTodos();

  const baseId = useId();
  const [cursorIso, setCursorIso] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<TodoSortBy>("manual");
  const [showCompleted, setShowCompleted] = useState(false);

  const tabRefs = useRef<Record<TodoEmbedRange, HTMLButtonElement | null>>({
    all: null,
    day: null,
    week: null,
    month: null,
  });
  const allPanelRef = useRef<HTMLDivElement>(null);
  const dayPanelRef = useRef<HTMLDivElement>(null);
  const weekPanelRef = useRef<HTMLDivElement>(null);
  const monthPanelRef = useRef<HTMLDivElement>(null);

  const project: TodoProject | undefined = getProject(config.projectId);
  const trashedProject = !project ? getAnyProject(config.projectId) : undefined;
  const section: TodoSection | undefined =
    project && config.sectionId
      ? sections.find(
          (s) => s.id === config.sectionId && s.projectId === project.id
        )
      : undefined;

  const isSection = Boolean(section);
  const activeRange: TodoEmbedRange = config.range ?? "all";
  const activeLayout: TodoEmbedLayout = config.layout ?? "list";
  const isFullWidth = Boolean(config.fullWidth);
  const selectedIso = cursorIso ?? todayIso;

  const patchConfig = useCallback(
    (patch: Partial<TodoEmbedConfig>, label?: string) => {
      onUpdateConfig({ ...config, ...patch }, label);
    },
    [config, onUpdateConfig]
  );

  const selectRange = useCallback(
    (nextRange: TodoEmbedRange) => {
      patchConfig({ range: nextRange });
      requestAnimationFrame(() => {
        tabRefs.current[nextRange]?.scrollIntoView({
          block: "nearest",
          inline: "nearest",
        });
      });
    },
    [patchConfig]
  );

  // Sync tab selection when browser find-in-page reveals hidden="until-found" content.
  useEffect(() => {
    const entries: Array<[TodoEmbedRange, HTMLDivElement | null]> = [
      ["all", allPanelRef.current],
      ["day", dayPanelRef.current],
      ["week", weekPanelRef.current],
      ["month", monthPanelRef.current],
    ];
    const cleanups: Array<() => void> = [];
    for (const [tabId, el] of entries) {
      if (!el) continue;
      const onBeforeMatch = () => selectRange(tabId);
      el.addEventListener("beforematch", onBeforeMatch);
      cleanups.push(() => el.removeEventListener("beforematch", onBeforeMatch));
    }
    return () => {
      for (const cleanup of cleanups) cleanup();
    };
  }, [hydrated, selectRange]);

  const subtasksByParent = useMemo(() => buildSubtasksMap(tasks), [tasks]);

  // Task scoping:
  // - Section embed -> all top-level tasks in that section (dated + undated)
  // - Project embed -> top-level tasks in that project that have a dueDate
  const {
    allOpenTasks,
    allCompletedTasks,
    overdueTasks,
    scheduledNonOverdueOpen,
    openByDate,
    completedByDate,
    unscheduledOpen,
    unscheduledCompleted,
  } = useMemo(() => {
    if (!project) {
      return {
        allOpenTasks: [] as TodoTask[],
        allCompletedTasks: [] as TodoTask[],
        overdueTasks: [] as TodoTask[],
        scheduledNonOverdueOpen: [] as TodoTask[],
        openByDate: new Map<string, TodoTask[]>(),
        completedByDate: new Map<string, TodoTask[]>(),
        unscheduledOpen: [] as TodoTask[],
        unscheduledCompleted: [] as TodoTask[],
      };
    }

    const overdue: TodoTask[] = [];
    const scheduledNonOverdue: TodoTask[] = [];
    const unschedOpen: TodoTask[] = [];
    const unschedDone: TodoTask[] = [];
    const openMap = new Map<string, TodoTask[]>();
    const doneMap = new Map<string, TodoTask[]>();
    const openAllRaw: TodoTask[] = [];
    const doneAllRaw: TodoTask[] = [];

    for (const task of tasks) {
      if (task.parentId || task.projectId !== project.id) continue;
      if (section) {
        if (task.sectionId !== section.id) continue;
      } else if (!task.dueDate) {
        continue;
      }

      if (task.completed) {
        doneAllRaw.push(task);
        if (task.dueDate) {
          const list = doneMap.get(task.dueDate) ?? [];
          list.push(task);
          doneMap.set(task.dueDate, list);
        } else {
          unschedDone.push(task);
        }
      } else {
        openAllRaw.push(task);
        if (task.dueDate) {
          if (todayIso && isOverdue(task.dueDate, todayIso)) {
            overdue.push(task);
          } else {
            scheduledNonOverdue.push(task);
          }
          const list = openMap.get(task.dueDate) ?? [];
          list.push(task);
          openMap.set(task.dueDate, list);
        } else {
          unschedOpen.push(task);
        }
      }
    }

    for (const [iso, list] of openMap.entries()) {
      openMap.set(iso, sortTodoTasks(list, sortBy));
    }
    const sortDoneDesc = (a: TodoTask, b: TodoTask) =>
      (b.completedAt ?? b.updatedAt).localeCompare(
        a.completedAt ?? a.updatedAt
      );
    for (const [iso, list] of doneMap.entries()) {
      doneMap.set(iso, [...list].sort(sortDoneDesc));
    }

    const effectiveProjectSort =
      !section && sortBy === "manual" ? "due" : sortBy;

    return {
      allOpenTasks: sortTodoTasks(openAllRaw, effectiveProjectSort),
      allCompletedTasks: [...doneAllRaw].sort(sortDoneDesc),
      overdueTasks: sortTodoTasks(overdue, sortBy),
      scheduledNonOverdueOpen: sortTodoTasks(
        scheduledNonOverdue,
        effectiveProjectSort
      ),
      openByDate: openMap,
      completedByDate: doneMap,
      unscheduledOpen: sortTodoTasks(unschedOpen, sortBy),
      unscheduledCompleted: [...unschedDone].sort(sortDoneDesc),
    };
  }, [project, section, sortBy, tasks, todayIso]);

  // Day computations
  const dayOpenTasks = useMemo(
    () => (selectedIso ? (openByDate.get(selectedIso) ?? []) : []),
    [openByDate, selectedIso]
  );
  const dayCompletedTasks = useMemo(
    () => (selectedIso ? (completedByDate.get(selectedIso) ?? []) : []),
    [completedByDate, selectedIso]
  );
  const isViewingToday = Boolean(todayIso && selectedIso === todayIso);

  // Week computations
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

  // Month computations
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
    for (const task of allOpenTasks) {
      if (task.dueDate?.startsWith(prefix)) count += 1;
    }
    return count;
  }, [allOpenTasks, monthParts]);

  if (!hydrated || !todayIso) {
    return (
      <div className="rounded-xl border border-border bg-surface/50 px-4 py-5 text-xs text-muted">
        Loading tasks…
      </div>
    );
  }

  if (!project) {
    if (trashedProject?.trashedAt) {
      const trashedName = projectDisplayName(trashedProject);
      return (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface/60 p-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">
              {trashedName} is in Trash
            </p>
            <p className="text-xs text-muted">
              Restore this project to view and manage its embedded tasks.
            </p>
          </div>
          <button
            type="button"
            onClick={() => restoreProjects([trashedProject.id])}
            className="primary inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium"
          >
            <Icon name="restore" className="size-3.5" />
            <span>Restore project</span>
          </button>
        </div>
      );
    }

    return (
      <div className="rounded-xl border border-border bg-surface/50 p-4 text-xs text-muted">
        {fallbackLabel
          ? `Embedded project "${fallbackLabel}" was not found.`
          : "Todo project not found."}
      </div>
    );
  }

  if (config.sectionId && !section) {
    const projName = projectDisplayName(project);
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface/60 p-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            Section not found in {projName}
          </p>
          <p className="text-xs text-muted">
            The linked section may have been deleted.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            const nextConfig: TodoEmbedConfig = {
              projectId: project.id,
              range: activeRange,
              layout: activeLayout,
              ...(isFullWidth ? { fullWidth: true } : {}),
            };
            onUpdateConfig(nextConfig, projName);
          }}
          className="secondary inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium"
        >
          Show project&apos;s dated tasks instead
        </button>
      </div>
    );
  }

  const handleTabKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    idx: number
  ) => {
    let nextIdx: number | null = null;
    if (event.key === "ArrowRight") {
      nextIdx = (idx + 1) % RANGE_TABS.length;
    } else if (event.key === "ArrowLeft") {
      nextIdx = (idx - 1 + RANGE_TABS.length) % RANGE_TABS.length;
    } else if (event.key === "Home") {
      nextIdx = 0;
    } else if (event.key === "End") {
      nextIdx = RANGE_TABS.length - 1;
    }
    if (nextIdx === null) return;
    event.preventDefault();
    const nextTab = RANGE_TABS[nextIdx].id;
    selectRange(nextTab);
    tabRefs.current[nextTab]?.focus();
  };

  const handleStep = (direction: -1 | 1) => {
    if (!selectedIso) return;
    if (activeRange === "day") {
      setCursorIso(addDaysIso(selectedIso, direction));
    } else if (activeRange === "week") {
      setCursorIso(addDaysIso(selectedIso, direction * 7));
    } else if (activeRange === "month") {
      setCursorIso(addMonthsIso(selectedIso, direction));
    }
  };

  const projectName = projectDisplayName(project);
  const targetHref = buildTodoProjectHref(project.id, section?.id);
  const dayHeader = formatDayHeader(selectedIso, todayIso);
  const subtitle =
    activeRange === "all"
      ? "All tasks"
      : activeRange === "day"
        ? `${dayHeader.primary} · ${dayHeader.secondary}`
        : activeRange === "week" && weekDays.length === 7
          ? formatWeekRangeLabel(weekDays[0], weekDays[6])
          : monthParts
            ? `${FULL_MONTHS[monthParts.month - 1]} ${monthParts.year}`
            : "";

  const activeCount =
    activeRange === "all"
      ? allOpenTasks.length
      : activeRange === "day"
        ? dayOpenTasks.length +
          (isViewingToday ? overdueTasks.length : 0) +
          (isSection ? unscheduledOpen.length : 0)
        : activeRange === "week"
          ? weekOpenCount + (isSection ? unscheduledOpen.length : 0)
          : monthOpenCount + (isSection ? unscheduledOpen.length : 0);

  const dayCombinedBoardTasks = isViewingToday
    ? [...overdueTasks, ...dayOpenTasks]
    : dayOpenTasks;

  const visibleUnscheduledForCalendar = isSection
    ? showCompleted
      ? [...unscheduledOpen, ...unscheduledCompleted]
      : unscheduledOpen
    : undefined;

  return (
    <section
      aria-label={
        section
          ? `${projectName} / ${section.name} tasks`
          : `${projectName} dated tasks`
      }
      className="@container space-y-3 rounded-xl border border-border bg-canvas p-4 shadow-2xs"
    >
      {/* Embed Header: Row 1 (Title + Width/Open) & Row 2 (Range Tabs + View/Date Controls) */}
      <header className="space-y-2.5">
        {/* Row 1: Title, scope & metadata on left; Full width & Open actions on right */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <Link
              href={targetHref}
              className="inline-flex min-w-0 items-center gap-1.5 rounded text-base font-semibold text-foreground transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
            >
              {project.icon ? (
                <span aria-hidden="true" className="shrink-0 leading-none">
                  {project.icon}
                </span>
              ) : (
                <span
                  aria-hidden="true"
                  className="inline-flex shrink-0 items-center"
                  style={{ color: `var(--notion-${project.color})` }}
                >
                  <Icon name="hash" className="size-4" />
                </span>
              )}
              <span className="truncate">
                {section ? `${projectName} / ${section.name}` : projectName}
              </span>
            </Link>

            {!isSection && (
              <span className="inline-flex items-center rounded-full border border-border bg-surface px-2 py-0.5 text-[10px] font-medium text-muted">
                Due dates only
              </span>
            )}

            <span className="inline-flex items-center gap-1.5 text-xs text-muted">
              <Icon name="check-circle" className="size-3.5 shrink-0" />
              <span className="tabular-nums">
                {activeCount} {activeCount === 1 ? "task" : "tasks"}
              </span>
              {subtitle && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{subtitle}</span>
                </>
              )}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              aria-label={
                isFullWidth
                  ? "Switch task embed to page width"
                  : "Expand task embed to full width"
              }
              aria-pressed={isFullWidth}
              title={isFullWidth ? "Default width" : "Full width"}
              onClick={() => patchConfig({ fullWidth: !isFullWidth })}
              className={`inline-flex h-7 items-center gap-1 rounded px-2 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
                isFullWidth
                  ? "bg-secondary font-medium text-foreground"
                  : "text-muted hover:bg-secondary hover:text-foreground"
              }`}
            >
              <Icon name="full-width" className="size-3.5" />
              <span className="hidden sm:inline">Full width</span>
            </button>

            <Link
              href={targetHref}
              aria-label={`Open ${section ? section.name : projectName} in Todos`}
              title="Open in Todos"
              className="inline-flex size-7 items-center justify-center rounded text-muted transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
            >
              <Icon name="external-link" className="size-3.5" />
            </Link>
          </div>
        </div>

        {/* Row 2: Range Tabs (left) & Stepper + List/Board + View Options (right) */}
        <div className="flex flex-col gap-2 border-b border-border @xl:flex-row @xl:items-end @xl:justify-between">
          <div
            role="tablist"
            aria-label="Embedded task range"
            {...({ focusgroup: "tablist nomemory" } as Record<string, string>)}
            className="todo-tabs-list -mb-px flex items-center gap-1"
          >
            {RANGE_TABS.map((tab, idx) => {
              const isSelected = activeRange === tab.id;
              return (
                <button
                  key={tab.id}
                  ref={(el) => {
                    tabRefs.current[tab.id] = el;
                  }}
                  type="button"
                  id={`${baseId}-tab-${tab.id}`}
                  role="tab"
                  aria-selected={isSelected}
                  tabIndex={isSelected ? 0 : -1}
                  {...(isSelected ? { focusgroupstart: "" } : {})}
                  onClick={() => selectRange(tab.id)}
                  onKeyDown={(e) => handleTabKeyDown(e, idx)}
                  className="todo-tab rounded-t-md px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-1.5 pb-1.5">
            {activeRange !== "all" && (
              <div className="inline-flex h-7 items-center rounded-md border border-border bg-surface p-0.5">
                <button
                  type="button"
                  aria-label={
                    activeRange === "day"
                      ? "Previous day"
                      : activeRange === "week"
                        ? "Previous week"
                        : "Previous month"
                  }
                  onClick={() => handleStep(-1)}
                  className="inline-flex size-6 items-center justify-center rounded text-muted transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <Icon name="chevron-right" className="size-3.5 rotate-180" />
                </button>
                <button
                  type="button"
                  onClick={() => setCursorIso(null)}
                  className={`h-6 rounded px-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
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
                    activeRange === "day"
                      ? "Next day"
                      : activeRange === "week"
                        ? "Next week"
                        : "Next month"
                  }
                  onClick={() => handleStep(1)}
                  className="inline-flex size-6 items-center justify-center rounded text-muted transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <Icon name="chevron-right" className="size-3.5" />
                </button>
              </div>
            )}

            <div
              role="group"
              aria-label="View layout"
              className="inline-flex h-7 items-center rounded-md border border-border bg-surface p-0.5"
            >
              <button
                type="button"
                aria-pressed={activeLayout === "list"}
                onClick={() => patchConfig({ layout: "list" })}
                className={`inline-flex h-6 items-center gap-1.5 rounded px-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
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
                onClick={() => patchConfig({ layout: "board" })}
                className={`inline-flex h-6 items-center gap-1.5 rounded px-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
                  activeLayout === "board"
                    ? "bg-canvas text-foreground shadow-2xs"
                    : "text-muted hover:text-foreground"
                }`}
              >
                <Icon name="board" className="size-3.5" />
                <span>Board</span>
              </button>
            </div>

            <TodoViewOptionsButton
              compact
              sortBy={sortBy}
              onSortChange={setSortBy}
              showCompleted={showCompleted}
              onShowCompletedChange={setShowCompleted}
            />
          </div>
        </div>
      </header>

      {/* Tab Panels */}
      <div>
        {/* ALL PANEL */}
        <div
          ref={allPanelRef}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-all`}
          {...(activeRange !== "all"
            ? { hidden: "until-found" as unknown as boolean }
            : {})}
        >
          {activeLayout === "board" ? (
            <div className="space-y-4">
              <TodoPriorityBoard
                tasks={allOpenTasks}
                subtasksByParent={subtasksByParent}
                todayIso={todayIso}
                showProject={false}
                showSection={!isSection}
                defaultProjectId={project.id}
                defaultSectionId={section?.id ?? null}
                defaultDueDate={isSection ? "" : todayIso}
              />
              {showCompleted && (
                <CompletedTasksList
                  tasks={allCompletedTasks}
                  subtasksByParent={subtasksByParent}
                  todayIso={todayIso}
                  showSection={!isSection}
                />
              )}
            </div>
          ) : (
            <div className="max-w-3xl space-y-5">
              {!isSection && (
                <TodoOverdueSection
                  overdueTasks={overdueTasks}
                  subtasksByParent={subtasksByParent}
                  todayIso={todayIso}
                  showProject={false}
                  showSection
                />
              )}

              <div className="space-y-1">
                {!isSection
                  ? scheduledNonOverdueOpen.length > 0 && (
                      <div>
                        {scheduledNonOverdueOpen.map((task) => (
                          <TodoTaskRow
                            key={task.id}
                            task={task}
                            showProject={false}
                            showSection
                            todayIso={todayIso}
                            subtasks={subtasksByParent.get(task.id) ?? []}
                          />
                        ))}
                      </div>
                    )
                  : allOpenTasks.length > 0 && (
                      <div>
                        {allOpenTasks.map((task) => (
                          <TodoTaskRow
                            key={task.id}
                            task={task}
                            showProject={false}
                            todayIso={todayIso}
                            subtasks={subtasksByParent.get(task.id) ?? []}
                          />
                        ))}
                      </div>
                    )}

                <InlineAddTaskTrigger
                  compact
                  defaultProjectId={project.id}
                  defaultSectionId={section?.id ?? null}
                  defaultDueDate={isSection ? "" : todayIso}
                />
              </div>

              {allOpenTasks.length === 0 && (
                <div className="rounded-xl border border-dashed border-border bg-surface/50 px-5 py-7 text-center">
                  <Icon
                    name="check-circle"
                    className="mx-auto size-7 text-success/80"
                  />
                  <p className="mt-2 text-xs font-semibold text-foreground">
                    {isSection
                      ? `No open tasks in "${section?.name}"`
                      : `No dated tasks in "${projectName}"`}
                  </p>
                </div>
              )}

              {showCompleted && (
                <CompletedTasksList
                  tasks={allCompletedTasks}
                  subtasksByParent={subtasksByParent}
                  todayIso={todayIso}
                  showSection={!isSection}
                />
              )}
            </div>
          )}
        </div>

        {/* DAY PANEL */}
        <div
          ref={dayPanelRef}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-day`}
          {...(activeRange !== "day"
            ? { hidden: "until-found" as unknown as boolean }
            : {})}
        >
          {activeLayout === "board" ? (
            <div className="space-y-6">
              {isViewingToday && overdueTasks.length > 0 && (
                <div className="max-w-3xl">
                  <TodoOverdueSection
                    overdueTasks={overdueTasks}
                    subtasksByParent={subtasksByParent}
                    todayIso={todayIso}
                    showProject={false}
                    showSection={!isSection}
                  />
                </div>
              )}

              <TodoPriorityBoard
                tasks={
                  isSection
                    ? [...dayCombinedBoardTasks, ...unscheduledOpen]
                    : dayCombinedBoardTasks
                }
                subtasksByParent={subtasksByParent}
                todayIso={todayIso}
                showProject={false}
                showSection={!isSection}
                defaultProjectId={project.id}
                defaultSectionId={section?.id ?? null}
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
                  showProject={false}
                  showSection={!isSection}
                />
              )}

              <section aria-label={dayHeader.primary} className="space-y-1">
                {isViewingToday && overdueTasks.length > 0 && (
                  <h4 className="border-b border-border pb-1.5 text-sm font-semibold text-foreground">
                    {dayHeader.primary} · {dayHeader.secondary}
                  </h4>
                )}

                {dayOpenTasks.length > 0 && (
                  <div>
                    {dayOpenTasks.map((task) => (
                      <TodoTaskRow
                        key={task.id}
                        task={task}
                        showProject={false}
                        showSection={!isSection}
                        todayIso={todayIso}
                        subtasks={subtasksByParent.get(task.id) ?? []}
                      />
                    ))}
                  </div>
                )}

                <InlineAddTaskTrigger
                  compact
                  defaultProjectId={project.id}
                  defaultSectionId={section?.id ?? null}
                  defaultDueDate={selectedIso}
                />
              </section>

              {isSection && unscheduledOpen.length > 0 && (
                <section aria-label="No due date" className="space-y-1">
                  <div className="flex items-center gap-2 border-b border-border pb-1.5">
                    <h4 className="text-sm font-semibold text-foreground">
                      No due date
                    </h4>
                    <span className="text-xs text-muted tabular-nums">
                      {unscheduledOpen.length}
                    </span>
                  </div>
                  <div>
                    {unscheduledOpen.map((task) => (
                      <TodoTaskRow
                        key={task.id}
                        task={task}
                        showProject={false}
                        todayIso={todayIso}
                        subtasks={subtasksByParent.get(task.id) ?? []}
                      />
                    ))}
                  </div>
                  <InlineAddTaskTrigger
                    compact
                    defaultProjectId={project.id}
                    defaultSectionId={section?.id ?? null}
                    defaultDueDate=""
                  />
                </section>
              )}

              {dayOpenTasks.length === 0 &&
                (!isViewingToday || overdueTasks.length === 0) &&
                (!isSection || unscheduledOpen.length === 0) && (
                  <div className="rounded-xl border border-dashed border-border bg-surface/50 px-5 py-7 text-center">
                    <Icon
                      name="check-circle"
                      className="mx-auto size-7 text-success/80"
                    />
                    <p className="mt-2 text-xs font-semibold text-foreground">
                      {isViewingToday
                        ? "Nothing due today"
                        : `Nothing scheduled for ${dayHeader.primary}`}
                    </p>
                  </div>
                )}

              {showCompleted && (
                <CompletedTasksList
                  tasks={
                    isSection
                      ? [...dayCompletedTasks, ...unscheduledCompleted]
                      : dayCompletedTasks
                  }
                  subtasksByParent={subtasksByParent}
                  todayIso={todayIso}
                  showSection={!isSection}
                />
              )}
            </div>
          )}
        </div>

        {/* WEEK PANEL */}
        <div
          ref={weekPanelRef}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-week`}
          {...(activeRange !== "week"
            ? { hidden: "until-found" as unknown as boolean }
            : {})}
        >
          {activeLayout === "board" ? (
            <TodoWeekBoard
              weekDays={weekDays}
              todayIso={todayIso}
              overdueTasks={overdueTasks}
              weekIncludesToday={weekIncludesToday}
              openByDate={openByDate}
              completedByDate={completedByDate}
              subtasksByParent={subtasksByParent}
              showCompleted={showCompleted}
              showProject={false}
              showSection={!isSection}
              defaultProjectId={project.id}
              defaultSectionId={section?.id ?? null}
              unscheduledTasks={visibleUnscheduledForCalendar}
              onSelectDay={(dayIso) => {
                setCursorIso(dayIso);
                selectRange("day");
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
              showProject={false}
              showSection={!isSection}
              defaultProjectId={project.id}
              defaultSectionId={section?.id ?? null}
              unscheduledTasks={visibleUnscheduledForCalendar}
              onSelectDay={(dayIso) => {
                setCursorIso(dayIso);
                selectRange("day");
              }}
            />
          )}
        </div>

        {/* MONTH PANEL */}
        <div
          ref={monthPanelRef}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-month`}
          {...(activeRange !== "month"
            ? { hidden: "until-found" as unknown as boolean }
            : {})}
        >
          {activeLayout === "board" ? (
            <div className="summary-scroller overflow-x-auto">
              <div className="min-w-[36rem]">
                <TodoMonthBoard
                  selectedIso={selectedIso}
                  todayIso={todayIso}
                  overdueTasks={overdueTasks}
                  openByDate={openByDate}
                  completedByDate={completedByDate}
                  subtasksByParent={subtasksByParent}
                  showCompleted={showCompleted}
                  showProject={false}
                  showSection={!isSection}
                  defaultProjectId={project.id}
                  defaultSectionId={section?.id ?? null}
                  unscheduledTasks={visibleUnscheduledForCalendar}
                  onSelectDay={(dayIso) => {
                    setCursorIso(dayIso);
                    selectRange("day");
                  }}
                />
              </div>
            </div>
          ) : (
            <TodoMonthList
              selectedIso={selectedIso}
              todayIso={todayIso}
              overdueTasks={overdueTasks}
              openByDate={openByDate}
              completedByDate={completedByDate}
              subtasksByParent={subtasksByParent}
              showCompleted={showCompleted}
              showProject={false}
              showSection={!isSection}
              defaultProjectId={project.id}
              defaultSectionId={section?.id ?? null}
              unscheduledTasks={visibleUnscheduledForCalendar}
              onSelectDay={(dayIso) => {
                setCursorIso(dayIso);
                selectRange("day");
              }}
            />
          )}
        </div>
      </div>
    </section>
  );
}

/** Interactive embedded Todo project/section view rendered inside a Doc page. */
export function InlineTodoEmbedBlock({
  config,
  fallbackLabel,
  onUpdateConfig,
}: InlineTodoEmbedBlockProps) {
  if (!config?.projectId) {
    return (
      <TodoEmbedPicker
        fallbackLabel={fallbackLabel}
        onUpdateConfig={onUpdateConfig}
      />
    );
  }

  return (
    <InlineTodoEmbedContent
      config={config}
      fallbackLabel={fallbackLabel}
      onUpdateConfig={onUpdateConfig}
    />
  );
}