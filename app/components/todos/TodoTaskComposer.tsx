"use client";

import {
  type FormEvent,
  type KeyboardEvent,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Icon } from "../../assets/icons";
import { useTodos } from "../../lib/todos-store";
import {
  addDaysIso,
  flattenProjectTree,
  formatRecurrenceLabel,
  formatTodoDueLabel,
  getNextWeekendIso,
  getNextWeekMondayIso,
  normalizeLabelName,
  parseTodoQuickInput,
  PRIORITY_META,
  projectDisplayName,
  type TodoPriority,
  type TodoRecurrence,
  type TodoTask,
} from "../../lib/todos-utils";
import { useTodayIsoDate } from "../../lib/use-client-date";
import { useDismissible } from "../../lib/use-dismissible";

type PickerKind = "date" | "priority" | "labels" | "project" | null;

const RECURRENCE_PRESETS: ReadonlyArray<{
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

function recurrenceToPresetId(rec: TodoRecurrence | undefined): string {
  if (!rec) return "none";
  if (rec.frequency === "daily" && rec.interval === 1) return "daily";
  if (rec.frequency === "weekdays") return "weekdays";
  if (rec.frequency === "weekly" && rec.interval === 1) return "weekly";
  if (rec.frequency === "weekly" && rec.interval === 2) return "biweekly";
  if (rec.frequency === "monthly" && rec.interval === 1) return "monthly";
  if (rec.frequency === "yearly" && rec.interval === 1) return "yearly";
  return "custom";
}

export interface TodoTaskComposerProps {
  mode?: "create" | "edit";
  task?: TodoTask;
  defaultProjectId?: string | null;
  defaultSectionId?: string | null;
  defaultParentId?: string | null;
  defaultDueDate?: string;
  defaultPriority?: TodoPriority;
  defaultLabels?: string[];
  autoFocus?: boolean;
  compact?: boolean;
  onCancel: () => void;
  onSaved?: (task: TodoTask) => void;
}

/** Todoist-style inline & modal task composer with smart natural-language token parsing and metadata pickers. */
export function TodoTaskComposer({
  mode = "create",
  task,
  defaultProjectId = null,
  defaultSectionId = null,
  defaultParentId = null,
  defaultDueDate = "",
  defaultPriority = 4,
  defaultLabels = [],
  autoFocus = true,
  compact = false,
  onCancel,
  onSaved,
}: TodoTaskComposerProps) {
  const todayIso = useTodayIsoDate() ?? "";
  const { projects, sections, labels: allLabels, upsertLabel, createTask, updateTask } =
    useTodos();

  const titleInputId = useId();
  const descInputId = useId();
  const newLabelInputId = useId();
  const pickerContainerRef = useRef<HTMLDivElement>(null);

  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [projectId, setProjectId] = useState<string | null>(
    task ? task.projectId : defaultProjectId
  );
  const [sectionId, setSectionId] = useState<string | null>(
    task ? (task.sectionId ?? null) : defaultSectionId
  );
  const [priority, setPriority] = useState<TodoPriority>(
    task ? task.priority : defaultPriority
  );
  const [dueDate, setDueDate] = useState<string>(
    task ? (task.dueDate ?? "") : defaultDueDate
  );
  const [dueTime, setDueTime] = useState<string>(task?.dueTime ?? "");
  const [recurrence, setRecurrence] = useState<TodoRecurrence | undefined>(
    task?.recurrence
  );
  const [selectedLabels, setSelectedLabels] = useState<string[]>(
    task ? task.labels : defaultLabels
  );

  const [smartParse, setSmartParse] = useState(mode === "create");
  const [touchedFields, setTouchedFields] = useState<{
    priority?: boolean;
    date?: boolean;
    project?: boolean;
  }>({});
  const [openPicker, setOpenPicker] = useState<PickerKind>(null);
  const [newLabelText, setNewLabelText] = useState("");

  useDismissible(openPicker !== null, [pickerContainerRef], () =>
    setOpenPicker(null)
  );

  const parsedPreview = useMemo(() => {
    if (!smartParse || !title.trim()) return null;
    return parseTodoQuickInput(title, todayIso, projects);
  }, [projects, smartParse, title, todayIso]);

  const effectivePriority: TodoPriority =
    !touchedFields.priority && parsedPreview?.priority
      ? parsedPreview.priority
      : priority;
  const effectiveDueDate: string =
    !touchedFields.date && parsedPreview?.dueDate
      ? parsedPreview.dueDate
      : dueDate;
  const effectiveDueTime: string =
    !touchedFields.date && parsedPreview?.dueTime
      ? parsedPreview.dueTime
      : dueTime;
  const effectiveRecurrence: TodoRecurrence | undefined =
    !touchedFields.date && parsedPreview?.recurrence
      ? parsedPreview.recurrence
      : recurrence;
  const effectiveProjectId: string | null =
    defaultParentId
      ? projectId
      : !touchedFields.project && parsedPreview?.projectId !== undefined
        ? parsedPreview.projectId
        : projectId;
  const effectiveSectionId: string | null =
    effectiveProjectId === projectId ? sectionId : null;
  const effectiveLabels = useMemo(() => {
    const merged = new Set(selectedLabels);
    if (parsedPreview) {
      for (const l of parsedPreview.labels) merged.add(l);
    }
    return [...merged];
  }, [parsedPreview, selectedLabels]);

  const flattenedProjects = useMemo(
    () => flattenProjectTree(projects),
    [projects]
  );

  const sectionsForSelectedProject = useMemo(() => {
    if (!effectiveProjectId) return [];
    return sections
      .filter((s) => s.projectId === effectiveProjectId)
      .sort((a, b) => a.order - b.order);
  }, [effectiveProjectId, sections]);

  const selectedProjectObj = useMemo(
    () =>
      effectiveProjectId
        ? projects.find((p) => p.id === effectiveProjectId) ?? null
        : null,
    [effectiveProjectId, projects]
  );

  const dueSummary = useMemo(() => {
    if (!effectiveDueDate) return null;
    return formatTodoDueLabel(
      effectiveDueDate,
      effectiveDueTime || undefined,
      todayIso
    );
  }, [effectiveDueDate, effectiveDueTime, todayIso]);

  const handleToggleLabel = (rawName: string) => {
    const norm = normalizeLabelName(rawName);
    if (!norm) return;
    setSelectedLabels((prev) =>
      prev.includes(norm) ? prev.filter((l) => l !== norm) : [...prev, norm]
    );
  };

  const handleCreateInlineLabel = () => {
    const norm = normalizeLabelName(newLabelText);
    if (!norm) return;
    upsertLabel(norm, "blue");
    setSelectedLabels((prev) => (prev.includes(norm) ? prev : [...prev, norm]));
    setNewLabelText("");
  };

  const handleSubmit = (event?: FormEvent) => {
    event?.preventDefault();
    const finalTitle = smartParse
      ? (parsedPreview?.cleanedTitle || title).trim()
      : title.trim();
    if (!finalTitle) return;

    if (mode === "edit" && task) {
      updateTask(task.id, {
        title: finalTitle,
        description: description.trim() || undefined,
        projectId: effectiveProjectId,
        sectionId: effectiveProjectId ? effectiveSectionId : null,
        priority: effectivePriority,
        dueDate: effectiveDueDate || undefined,
        dueTime: effectiveDueDate && effectiveDueTime ? effectiveDueTime : undefined,
        recurrence: effectiveRecurrence,
        labels: effectiveLabels,
      });
      onSaved?.(task);
      return;
    }

    const created = createTask({
      title: finalTitle,
      description: description.trim() || undefined,
      projectId: defaultParentId ? undefined : effectiveProjectId,
      sectionId:
        !defaultParentId && effectiveProjectId ? effectiveSectionId : null,
      parentId: defaultParentId,
      priority: effectivePriority,
      dueDate: effectiveDueDate || undefined,
      dueTime: effectiveDueDate && effectiveDueTime ? effectiveDueTime : undefined,
      recurrence: effectiveRecurrence,
      labels: effectiveLabels,
    });
    onSaved?.(created);
  };

  const handleTitleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (openPicker) {
        setOpenPicker(null);
      } else {
        onCancel();
      }
    }
  };

  const handleContainerKeyDownCapture = (
    event: KeyboardEvent<HTMLDivElement>
  ) => {
    if (event.key === "Escape" && openPicker !== null) {
      event.preventDefault();
      event.stopPropagation();
      setOpenPicker(null);
    }
  };

  const hasParsedPreviewTokens =
    Boolean(parsedPreview) &&
    (Boolean(parsedPreview?.priority) ||
      Boolean(parsedPreview?.dueDate) ||
      Boolean(parsedPreview?.dueTime) ||
      Boolean(parsedPreview?.recurrence) ||
      (parsedPreview?.labels.length ?? 0) > 0 ||
      parsedPreview?.projectId !== undefined);

  return (
    <div
      ref={pickerContainerRef}
      onKeyDownCapture={handleContainerKeyDownCapture}
      className={`rounded-xl border border-border bg-canvas ${
        compact ? "p-3" : "p-3.5"
      }`}
    >
      <form onSubmit={handleSubmit} className="space-y-2.5">
        <div className="space-y-1">
          <label htmlFor={titleInputId} className="sr-only">
            Task name
          </label>
          <input
            id={titleInputId}
            type="text"
            autoFocus={autoFocus}
            autoComplete="off"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={handleTitleKeyDown}
            placeholder={
              mode === "create"
                ? "Task name (try: Pay rent tomorrow 9am p1 @finance #Home)"
                : "Task name"
            }
            className="w-full bg-transparent text-sm font-medium text-foreground placeholder:text-muted/70 focus:outline-none"
          />

          <label htmlFor={descInputId} className="sr-only">
            Description
          </label>
          <textarea
            id={descInputId}
            rows={compact ? 1 : 2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSubmit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                onCancel();
              }
            }}
            placeholder="Description"
            className="w-full resize-none bg-transparent text-xs text-muted placeholder:text-muted/60 focus:outline-none"
          />
        </div>

        {/* Live smart-parse token preview */}
        {smartParse && hasParsedPreviewTokens && (
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="text-muted">Detected:</span>
            {parsedPreview?.dueDate && (
              <span className="rounded-full bg-secondary px-2 py-0.5 font-medium text-foreground">
                {formatTodoDueLabel(
                  parsedPreview.dueDate,
                  parsedPreview.dueTime,
                  todayIso
                ).label}
              </span>
            )}
            {parsedPreview?.recurrence && (
              <span className="rounded-full bg-secondary px-2 py-0.5 font-medium text-primary">
                {formatRecurrenceLabel(parsedPreview.recurrence)}
              </span>
            )}
            {parsedPreview?.priority && (
              <span
                className={`rounded-full px-2 py-0.5 font-medium ${PRIORITY_META[parsedPreview.priority].pillClass}`}
              >
                {PRIORITY_META[parsedPreview.priority].short}
              </span>
            )}
            {parsedPreview?.matchedProjectName && (
              <span className="rounded-full bg-secondary px-2 py-0.5 font-medium text-foreground">
                #{parsedPreview.matchedProjectName}
              </span>
            )}
            {parsedPreview?.labels.map((lbl) => (
              <span
                key={lbl}
                className="rounded-full bg-secondary px-2 py-0.5 font-medium text-muted"
              >
                @{lbl}
              </span>
            ))}
          </div>
        )}

        {/* Metadata action pills */}
        <div className="relative flex flex-wrap items-center gap-1.5">
          {/* Due date button */}
          <div className="relative">
            <button
              type="button"
              aria-expanded={openPicker === "date"}
              onClick={() =>
                setOpenPicker((curr) => (curr === "date" ? null : "date"))
              }
              className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
                dueSummary
                  ? "border-border bg-secondary/70 font-medium text-foreground"
                  : "border-border text-muted hover:bg-secondary hover:text-foreground"
              }`}
            >
              <Icon
                name="calendar"
                className={`size-3.5 ${
                  dueSummary?.tone === "overdue"
                    ? "text-danger"
                    : dueSummary?.tone === "today"
                      ? "text-success"
                      : "text-muted"
                }`}
              />
              <span>{dueSummary ? dueSummary.label : "Due date"}</span>
              {effectiveRecurrence && (
                <Icon name="repeat" className="size-3 text-primary" />
              )}
            </button>

            {openPicker === "date" && (
              <div
                role="dialog"
                aria-label="Choose due date"
                className="absolute start-0 top-full z-40 mt-1 w-64 rounded-lg border border-border bg-canvas p-2.5 shadow-xl"
              >
                <div className="space-y-1">
                  {todayIso && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setDueDate(todayIso);
                          setTouchedFields((p) => ({ ...p, date: true }));
                          setOpenPicker(null);
                        }}
                        className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs text-foreground hover:bg-secondary"
                      >
                        <span className="flex items-center gap-2">
                          <Icon name="calendar" className="size-3.5 text-success" />
                          Today
                        </span>
                        <span className="text-muted">
                          {formatTodoDueLabel(todayIso, undefined, todayIso).label}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setDueDate(addDaysIso(todayIso, 1));
                          setTouchedFields((p) => ({ ...p, date: true }));
                          setOpenPicker(null);
                        }}
                        className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs text-foreground hover:bg-secondary"
                      >
                        <span className="flex items-center gap-2">
                          <Icon
                            name="sun"
                            className="size-3.5 notion-text-orange"
                          />
                          Tomorrow
                        </span>
                        <span className="text-muted">
                          {addDaysIso(todayIso, 1)}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setDueDate(getNextWeekendIso(todayIso));
                          setTouchedFields((p) => ({ ...p, date: true }));
                          setOpenPicker(null);
                        }}
                        className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs text-foreground hover:bg-secondary"
                      >
                        <span className="flex items-center gap-2">
                          <Icon
                            name="calendar"
                            className="size-3.5 text-primary"
                          />
                          This weekend
                        </span>
                        <span className="text-muted">
                          {getNextWeekendIso(todayIso)}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setDueDate(getNextWeekMondayIso(todayIso));
                          setTouchedFields((p) => ({ ...p, date: true }));
                          setOpenPicker(null);
                        }}
                        className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs text-foreground hover:bg-secondary"
                      >
                        <span className="flex items-center gap-2">
                          <Icon
                            name="calendar"
                            className="size-3.5 notion-text-purple"
                          />
                          Next week
                        </span>
                        <span className="text-muted">
                          {getNextWeekMondayIso(todayIso)}
                        </span>
                      </button>
                    </>
                  )}

                  {effectiveDueDate && (
                    <button
                      type="button"
                      onClick={() => {
                        setDueDate("");
                        setDueTime("");
                        setRecurrence(undefined);
                        setTouchedFields((p) => ({ ...p, date: true }));
                        setOpenPicker(null);
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted hover:bg-secondary hover:text-danger"
                    >
                      <Icon name="x" className="size-3.5" />
                      No date
                    </button>
                  )}
                </div>

                <hr className="my-2 border-border" />

                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="date"
                      aria-label="Custom due date"
                      value={effectiveDueDate}
                      onChange={(e) => {
                        setDueDate(e.target.value);
                        setTouchedFields((p) => ({ ...p, date: true }));
                      }}
                      className="h-8 min-w-0 flex-1 rounded-md border border-border bg-surface px-2 text-xs text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                    />
                    <input
                      type="time"
                      aria-label="Due time"
                      value={effectiveDueTime}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDueTime(val);
                        if (val && !effectiveDueDate && todayIso) {
                          setDueDate(todayIso);
                        }
                        setTouchedFields((p) => ({ ...p, date: true }));
                      }}
                      className="h-8 w-24 rounded-md border border-border bg-surface px-1.5 text-xs text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                    />
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Icon
                      name="repeat"
                      className="size-3.5 shrink-0 text-muted"
                    />
                    <select
                      aria-label="Repeat schedule"
                      value={recurrenceToPresetId(effectiveRecurrence)}
                      onChange={(e) => {
                        const preset = RECURRENCE_PRESETS.find(
                          (p) => p.id === e.target.value
                        );
                        setRecurrence(preset?.value);
                        if (preset?.value && !effectiveDueDate && todayIso) {
                          setDueDate(todayIso);
                        }
                        setTouchedFields((p) => ({ ...p, date: true }));
                      }}
                      className="h-8 w-full rounded-md border border-border bg-surface px-2 text-xs text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      {RECURRENCE_PRESETS.map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {preset.label}
                        </option>
                      ))}
                      {recurrenceToPresetId(effectiveRecurrence) === "custom" &&
                        effectiveRecurrence && (
                          <option value="custom">
                            {formatRecurrenceLabel(effectiveRecurrence)}
                          </option>
                        )}
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Priority button */}
          <div className="relative">
            <button
              type="button"
              aria-expanded={openPicker === "priority"}
              onClick={() =>
                setOpenPicker((curr) =>
                  curr === "priority" ? null : "priority"
                )
              }
              className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
                effectivePriority < 4
                  ? "border-border bg-secondary/70 font-medium text-foreground"
                  : "border-border text-muted hover:bg-secondary hover:text-foreground"
              }`}
            >
              <span
                aria-hidden="true"
                className="inline-flex items-center"
                style={{ color: PRIORITY_META[effectivePriority].colorVar }}
              >
                <Icon name="flag" className="size-3.5" />
              </span>
              <span>
                {effectivePriority < 4
                  ? PRIORITY_META[effectivePriority].short
                  : "Priority"}
              </span>
            </button>

            {openPicker === "priority" && (
              <div
                role="dialog"
                aria-label="Choose priority"
                className="absolute start-0 top-full z-40 mt-1 w-44 rounded-lg border border-border bg-canvas p-1.5 shadow-xl"
              >
                {([1, 2, 3, 4] as const).map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => {
                      setPriority(lvl);
                      setTouchedFields((p) => ({ ...p, priority: true }));
                      setOpenPicker(null);
                    }}
                    className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-secondary ${
                      effectivePriority === lvl
                        ? "bg-secondary font-medium text-foreground"
                        : "text-foreground"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        style={{ color: PRIORITY_META[lvl].colorVar }}
                      >
                        <Icon name="flag" className="size-3.5" />
                      </span>
                      {PRIORITY_META[lvl].label}
                    </span>
                    {effectivePriority === lvl && (
                      <span aria-hidden="true" className="text-primary">
                        ✓
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Labels button */}
          <div className="relative">
            <button
              type="button"
              aria-expanded={openPicker === "labels"}
              onClick={() =>
                setOpenPicker((curr) => (curr === "labels" ? null : "labels"))
              }
              className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
                effectiveLabels.length > 0
                  ? "border-border bg-secondary/70 font-medium text-foreground"
                  : "border-border text-muted hover:bg-secondary hover:text-foreground"
              }`}
            >
              <Icon name="tag" className="size-3.5" />
              <span>
                {effectiveLabels.length > 0
                  ? `${effectiveLabels.length} ${effectiveLabels.length === 1 ? "label" : "labels"}`
                  : "Labels"}
              </span>
            </button>

            {openPicker === "labels" && (
              <div
                role="dialog"
                aria-label="Manage task labels"
                className="absolute start-0 top-full z-40 mt-1 w-60 rounded-lg border border-border bg-canvas p-2.5 shadow-xl"
              >
                <div className="flex items-center gap-1.5">
                  <label htmlFor={newLabelInputId} className="sr-only">
                    New label
                  </label>
                  <input
                    id={newLabelInputId}
                    type="text"
                    value={newLabelText}
                    onChange={(e) => setNewLabelText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleCreateInlineLabel();
                      }
                    }}
                    placeholder="Add @label…"
                    className="h-7 min-w-0 flex-1 rounded-md border border-border bg-surface px-2 text-xs text-foreground placeholder:text-muted focus-visible:outline-2 focus-visible:outline-primary"
                  />
                  <button
                    type="button"
                    onClick={handleCreateInlineLabel}
                    disabled={!normalizeLabelName(newLabelText)}
                    className="h-7 rounded-md bg-secondary px-2 text-xs font-medium text-foreground hover:opacity-90 disabled:opacity-40"
                  >
                    Add
                  </button>
                </div>

                <div className="mt-2 max-h-40 space-y-0.5 overflow-y-auto">
                  {allLabels.length === 0 ? (
                    <p className="px-1 py-2 text-center text-xs text-muted">
                      No labels yet
                    </p>
                  ) : (
                    allLabels.map((lbl) => {
                      const checked = effectiveLabels.includes(lbl.name);
                      return (
                        <label
                          key={lbl.name}
                          className="flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1 text-xs hover:bg-secondary"
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => handleToggleLabel(lbl.name)}
                              className="size-3.5 rounded border-border accent-primary"
                            />
                            <span className="truncate text-foreground">
                              @{lbl.name}
                            </span>
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {mode === "create" && (
            <button
              type="button"
              aria-pressed={smartParse}
              onClick={() => setSmartParse((prev) => !prev)}
              title="Toggle natural-language parsing (dates, p1-p4, @labels, #project)"
              className={`inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
                smartParse
                  ? "border-primary/40 bg-primary/10 font-medium text-primary"
                  : "border-border text-muted hover:bg-secondary hover:text-foreground"
              }`}
            >
              <span>Smart parse</span>
            </button>
          )}
        </div>

        {/* Footer: Project/section selector + Cancel / Save */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2.5">
          {!defaultParentId ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-xs">
                {selectedProjectObj ? (
                  selectedProjectObj.icon ? (
                    <span aria-hidden="true" className="leading-none">
                      {selectedProjectObj.icon}
                    </span>
                  ) : (
                    <span
                      aria-hidden="true"
                      className="inline-flex items-center"
                      style={{
                        color: `var(--notion-${selectedProjectObj.color})`,
                      }}
                    >
                      <Icon name="hash" className="size-3.5" />
                    </span>
                  )
                ) : (
                  <Icon name="inbox" className="size-3.5 text-primary" />
                )}
                <select
                  aria-label="Project"
                  value={effectiveProjectId ?? "__inbox__"}
                  onChange={(e) => {
                    const val = e.target.value;
                    setProjectId(val === "__inbox__" ? null : val);
                    setSectionId(null);
                    setTouchedFields((p) => ({ ...p, project: true }));
                  }}
                  className="max-w-40 bg-transparent text-xs font-medium text-foreground focus:outline-none"
                >
                  <option value="__inbox__">Inbox</option>
                  {flattenedProjects.map(({ project, depth }) => (
                    <option key={project.id} value={project.id}>
                      {"\u00A0".repeat(depth * 2)}
                      {projectDisplayName(project)}
                    </option>
                  ))}
                </select>
              </div>

              {sectionsForSelectedProject.length > 0 && (
                <select
                  aria-label="Section"
                  value={effectiveSectionId ?? ""}
                  onChange={(e) => setSectionId(e.target.value || null)}
                  className="h-7 max-w-36 rounded-md border border-border bg-surface px-2 text-xs text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <option value="">No section</option>
                  {sectionsForSelectedProject.map((sec) => (
                    <option key={sec.id} value={sec.id}>
                      {sec.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ) : (
            <span className="text-xs text-muted">Sub-task</span>
          )}

          <div className="ms-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium text-muted transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim()}
              className="primary inline-flex h-8 items-center rounded-md px-3 text-xs font-medium transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {mode === "edit" ? "Save" : "Add task"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
