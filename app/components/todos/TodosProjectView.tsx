"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Icon } from "../../assets/icons";
import { useTodos } from "../../lib/todos-store";
import {
  buildProjectTree,
  buildTodoProjectUrl,
  PROJECT_COLORS,
  projectDisplayName,
  sortTodoTasks,
  type TodoSortBy,
  type TodoTask,
  type TodoViewLayout,
} from "../../lib/todos-utils";
import { useTodayIsoDate } from "../../lib/use-client-date";
import { useDismissible } from "../../lib/use-dismissible";
import { IconPickerPopover } from "../IconPickerPopover";
import { buildSubtasksMap, InlineAddTaskTrigger } from "./TodoSharedBlocks";
import { TodoTaskRow } from "./TodoTaskRow";
import { TodoViewOptionsButton } from "./TodoViewHeader";

function legacyCopyText(text: string): boolean {
  const field = Object.assign(document.createElement("textarea"), {
    value: text,
  });
  field.setAttribute("readonly", "");
  field.style.cssText = "position:fixed;inset-block-start:0;opacity:0";
  document.body.append(field);
  field.select();
  try {
    return document.execCommand("copy");
  } finally {
    field.remove();
  }
}

/** Todoist-style Project workspace with editable header, sub-projects, sections, List & Board views, and drag-and-drop. */
export function TodosProjectView() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId
    ? decodeURIComponent(params.projectId)
    : "";
  const router = useRouter();
  const searchParams = useSearchParams();
  const focusedSectionId = searchParams.get("section")?.trim() || null;
  const todayIso = useTodayIsoDate() ?? "";
  const titleInputId = useId();
  const newSectionInputId = useId();

  const {
    hydrated,
    projects,
    sections,
    tasks,
    getProject,
    updateProject,
    toggleProjectFavorite,
    createSection,
    updateSection,
    deleteSection,
    moveTask,
  } = useTodos();

  const project = getProject(projectId);

  const [sortBy, setSortBy] = useState<TodoSortBy>("manual");
  const [showCompleted, setShowCompleted] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [addingSection, setAddingSection] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [hoverSectionDrop, setHoverSectionDrop] = useState<
    string | "__none__" | null
  >(null);
  const [copiedFeedback, setCopiedFeedback] = useState<{
    key: string;
    ok: boolean;
  } | null>(null);
  const [copyStatusMessage, setCopyStatusMessage] = useState("");

  const appearanceRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());
  const copyTimerRef = useRef<number | null>(null);
  const lastCopyAnnouncementRef = useRef("");
  const lastScrolledFocusRef = useRef<string | null>(null);

  useDismissible(appearanceOpen, [appearanceRef], () =>
    setAppearanceOpen(false)
  );

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const setSectionRef = useCallback((id: string, el: HTMLElement | null) => {
    if (el) sectionRefs.current.set(id, el);
    else sectionRefs.current.delete(id);
  }, []);

  const copyLink = useCallback(async (key: string, url: string) => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(url);
      ok = true;
    } catch {
      try {
        ok = legacyCopyText(url);
      } catch {
        ok = false;
      }
    }

    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current);
    }

    let message = ok ? "Copied link" : "Copy failed";
    if (message === lastCopyAnnouncementRef.current) {
      message += "\u00A0";
    }
    lastCopyAnnouncementRef.current = message;

    setCopyStatusMessage("");
    setCopiedFeedback({ key, ok });
    requestAnimationFrame(() => setCopyStatusMessage(message));

    copyTimerRef.current = window.setTimeout(() => {
      setCopiedFeedback(null);
      setCopyStatusMessage("");
      copyTimerRef.current = null;
    }, 2000);
  }, []);

  const subtasksByParent = useMemo(() => buildSubtasksMap(tasks), [tasks]);

  const childProjects = useMemo(
    () =>
      buildProjectTree(projects).childrenByParent.get(projectId) ?? [],
    [projectId, projects]
  );

  const projectSections = useMemo(
    () =>
      sections
        .filter((s) => s.projectId === projectId)
        .sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt)),
    [projectId, sections]
  );

  // Expand and scroll a ?section= deep link into view once hydrated.
  useEffect(() => {
    if (!hydrated || !project || !focusedSectionId) return;
    const target = projectSections.find((s) => s.id === focusedSectionId);
    if (!target) return;
    if (target.collapsed) {
      updateSection(target.id, { collapsed: false });
    }
    const focusKey = `${project.id}:${target.id}`;
    if (lastScrolledFocusRef.current === focusKey) return;
    lastScrolledFocusRef.current = focusKey;
    const frame = requestAnimationFrame(() => {
      const el = sectionRefs.current.get(target.id);
      if (!el) return;
      const reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;
      el.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "nearest",
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [focusedSectionId, hydrated, project, projectSections, updateSection]);

  const { unsectionedOpen, tasksBySection, completedTasks } = useMemo(() => {
    const projectTop = tasks.filter(
      (t) => !t.parentId && t.projectId === projectId
    );
    const openTop = projectTop.filter((t) => !t.completed);
    const doneTop = projectTop
      .filter((t) => t.completed)
      .sort((a, b) =>
        (b.completedAt ?? b.updatedAt).localeCompare(
          a.completedAt ?? a.updatedAt
        )
      );

    const sectionIds = new Set(projectSections.map((s) => s.id));
    const unsec: TodoTask[] = [];
    const bySec = new Map<string, TodoTask[]>();
    for (const sec of projectSections) bySec.set(sec.id, []);

    for (const task of openTop) {
      if (task.sectionId && sectionIds.has(task.sectionId)) {
        bySec.get(task.sectionId)!.push(task);
      } else {
        unsec.push(task);
      }
    }

    for (const [secId, list] of bySec.entries()) {
      bySec.set(secId, sortTodoTasks(list, sortBy));
    }

    return {
      unsectionedOpen: sortTodoTasks(unsec, sortBy),
      tasksBySection: bySec,
      completedTasks: doneTop,
    };
  }, [projectId, projectSections, sortBy, tasks]);

  if (!hydrated) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6 text-sm text-muted sm:px-8">
        Loading…
      </div>
    );
  }

  if (!project) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 text-center sm:px-8">
        <p className="text-sm font-medium text-foreground">Project not found</p>
        <p className="mt-1 text-xs text-muted">
          It may have been moved to trash.
        </p>
        <button
          type="button"
          onClick={() => router.push("/todos")}
          className="mt-4 h-9 rounded-md border border-border px-3 text-sm font-medium hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary"
        >
          Back to Todos
        </button>
      </div>
    );
  }

  const layout: TodoViewLayout = project.viewLayout ?? "list";
  const canManualReorder = sortBy === "manual";

  const handleAddSection = (event: FormEvent) => {
    event.preventDefault();
    if (!newSectionName.trim()) return;
    createSection(project.id, newSectionName.trim());
    setNewSectionName("");
    setAddingSection(false);
  };

  const renderTaskList = (
    list: TodoTask[],
    targetSectionId: string | null
  ) => (
    <div>
      {list.map((task, idx) => (
        <TodoTaskRow
          key={task.id}
          task={task}
          todayIso={todayIso}
          subtasks={subtasksByParent.get(task.id) ?? []}
          draggable={canManualReorder}
          onDragStart={(e) => {
            e.dataTransfer.setData("text/plain", task.id);
            e.dataTransfer.effectAllowed = "move";
            setDraggedTaskId(task.id);
          }}
          onDragOver={(e) => {
            if (draggedTaskId) e.preventDefault();
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const sourceId =
              e.dataTransfer.getData("text/plain") || draggedTaskId;
            setDraggedTaskId(null);
            setHoverSectionDrop(null);
            if (sourceId && sourceId !== task.id) {
              moveTask(sourceId, {
                projectId: project.id,
                sectionId: targetSectionId,
                beforeTaskId: task.id,
              });
            }
          }}
          onMoveUp={
            canManualReorder && idx > 0
              ? () =>
                  moveTask(task.id, {
                    projectId: project.id,
                    sectionId: targetSectionId,
                    beforeTaskId: list[idx - 1].id,
                  })
              : undefined
          }
          onMoveDown={
            canManualReorder && idx < list.length - 1
              ? () =>
                  moveTask(task.id, {
                    projectId: project.id,
                    sectionId: targetSectionId,
                    afterTaskId: list[idx + 1].id,
                  })
              : undefined
          }
        />
      ))}
    </div>
  );

  return (
    <div
      className={`mx-auto space-y-6 px-4 py-6 sm:px-8 lg:px-12 ${
        layout === "board" ? "max-w-6xl" : "max-w-3xl"
      }`}
    >
      {/* Project Header */}
      <header className="space-y-3 border-b border-border pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div ref={appearanceRef} className="relative">
              <button
                type="button"
                aria-label="Change project color or icon"
                aria-expanded={appearanceOpen}
                onClick={() => setAppearanceOpen((prev) => !prev)}
                className="inline-flex size-10 items-center justify-center rounded-lg text-xl transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary"
              >
                {project.icon ? (
                  <span>{project.icon}</span>
                ) : (
                  <span
                    className="inline-flex items-center"
                    style={{ color: `var(--notion-${project.color})` }}
                  >
                    <Icon name="hash" className="size-5" />
                  </span>
                )}
              </button>

              {appearanceOpen && (
                <div className="absolute start-0 top-full z-30 mt-1 space-y-2">
                  <div
                    role="dialog"
                    aria-label="Choose project color"
                    className="w-72 rounded-lg border border-border bg-canvas p-2.5 shadow-lg"
                  >
                    <p className="pb-2 text-xs font-semibold text-muted">
                      Color
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {PROJECT_COLORS.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          aria-label={c.label}
                          title={c.label}
                          onClick={() =>
                            updateProject(project.id, { color: c.id })
                          }
                          className={`inline-flex size-6 items-center justify-center rounded-full border ${
                            project.color === c.id
                              ? "border-foreground ring-2 ring-primary ring-offset-1 ring-offset-canvas"
                              : "border-border"
                          }`}
                          style={{ backgroundColor: c.dotVar }}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="relative">
                    <IconPickerPopover
                      selectedIcon={project.icon}
                      label="Choose project icon"
                      className="static mt-0"
                      onSelect={(emoji) => {
                        updateProject(project.id, { icon: emoji });
                        setAppearanceOpen(false);
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            <label htmlFor={titleInputId} className="sr-only">
              Project name
            </label>
            <input
              id={titleInputId}
              key={project.id}
              type="text"
              autoFocus={!project.name}
              autoComplete="off"
              value={project.name}
              onChange={(e) =>
                updateProject(project.id, { name: e.target.value })
              }
              placeholder="Untitled project"
              className="min-w-0 flex-1 rounded-md bg-transparent px-1 py-1 text-2xl font-bold tracking-tight text-foreground placeholder:text-muted/60 focus-visible:outline-2 focus-visible:outline-primary"
            />
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <span className="inline-flex items-center">
              <button
                type="button"
                aria-label={`Copy link to project ${projectDisplayName(project)}`}
                title="Copy project link"
                data-copied={
                  copiedFeedback?.key === "project" && copiedFeedback.ok
                    ? ""
                    : undefined
                }
                data-failed={
                  copiedFeedback?.key === "project" && !copiedFeedback.ok
                    ? ""
                    : undefined
                }
                onClick={() =>
                  void copyLink(
                    "project",
                    buildTodoProjectUrl(
                      project.id,
                      null,
                      window.location.origin
                    )
                  )
                }
                className={`inline-flex min-h-8 min-w-8 items-center justify-center rounded-md border border-border transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary ${
                  copiedFeedback?.key === "project" && copiedFeedback.ok
                    ? "text-success"
                    : copiedFeedback?.key === "project" && !copiedFeedback.ok
                      ? "text-danger"
                      : "text-muted hover:text-foreground"
                }`}
              >
                <Icon
                  name={
                    copiedFeedback?.key === "project" && copiedFeedback.ok
                      ? "check-circle"
                      : "link"
                  }
                  className="size-4"
                />
              </button>
              <span role="status" className="sr-only">
                {copyStatusMessage}
              </span>
            </span>

            <button
              type="button"
              aria-label={
                project.favorite
                  ? "Remove from favorites"
                  : "Add to favorites"
              }
              aria-pressed={Boolean(project.favorite)}
              onClick={() => toggleProjectFavorite(project.id)}
              className="inline-flex size-8 items-center justify-center rounded-md border border-border text-muted transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
            >
              <span
                style={
                  project.favorite ? { color: "var(--notion-yellow)" } : undefined
                }
              >
                <Icon
                  name={project.favorite ? "star-solid" : "star"}
                  className="size-4"
                />
              </span>
            </button>

            <TodoViewOptionsButton
              layout={layout}
              onLayoutChange={(nextLayout) =>
                updateProject(project.id, { viewLayout: nextLayout })
              }
              sortBy={sortBy}
              onSortChange={setSortBy}
              showCompleted={showCompleted}
              onShowCompletedChange={setShowCompleted}
            />
          </div>
        </div>

        {/* Sub-projects navigation pills */}
        {childProjects.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 ps-1">
            <span className="text-[11px] font-medium text-muted">
              Sub-projects:
            </span>
            {childProjects.map((child) => (
              <Link
                key={child.id}
                href={`/todos/project/${encodeURIComponent(child.id)}`}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-0.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
              >
                {child.icon ? (
                  <span aria-hidden="true">{child.icon}</span>
                ) : (
                  <span
                    aria-hidden="true"
                    style={{ color: `var(--notion-${child.color})` }}
                  >
                    <Icon name="hash" className="size-3" />
                  </span>
                )}
                <span>{projectDisplayName(child)}</span>
              </Link>
            ))}
          </div>
        )}
      </header>

      {/* Board Layout */}
      {layout === "board" ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {[
            { id: "__none__" as const, name: "(No section)", sectionId: null },
            ...projectSections.map((s) => ({
              id: s.id,
              name: s.name,
              sectionId: s.id as string | null,
            })),
          ].map((col) => {
            const colTasks =
              col.sectionId === null
                ? unsectionedOpen
                : (tasksBySection.get(col.sectionId) ?? []);
            const isOver = hoverSectionDrop === col.id;
            const isFocusedSec =
              col.sectionId !== null && focusedSectionId === col.sectionId;
            const copyKey = col.sectionId ? `sec:${col.sectionId}` : "";
            const isSecCopied =
              Boolean(copyKey) &&
              copiedFeedback?.key === copyKey &&
              copiedFeedback.ok;
            const isSecFailed =
              Boolean(copyKey) &&
              copiedFeedback?.key === copyKey &&
              !copiedFeedback.ok;
            return (
              <section
                key={col.id}
                ref={
                  col.sectionId
                    ? (el) => setSectionRef(col.sectionId!, el)
                    : undefined
                }
                aria-label={col.name}
                onDragOver={(e) => {
                  if (!draggedTaskId) return;
                  e.preventDefault();
                  setHoverSectionDrop(col.id);
                }}
                onDragLeave={() => {
                  setHoverSectionDrop((curr) =>
                    curr === col.id ? null : curr
                  );
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData("text/plain") || draggedTaskId;
                  setDraggedTaskId(null);
                  setHoverSectionDrop(null);
                  if (id) {
                    moveTask(id, {
                      projectId: project.id,
                      sectionId: col.sectionId,
                    });
                  }
                }}
                className={`flex w-72 shrink-0 flex-col rounded-xl border p-3 transition-colors ${
                  isOver
                    ? "border-primary bg-secondary/70"
                    : isFocusedSec
                      ? "border-primary/60 bg-secondary/35"
                      : "border-border bg-surface/60"
                }`}
              >
                <div className="group mb-2.5 flex items-center justify-between gap-2 px-1">
                  <h2 className="truncate text-xs font-semibold text-foreground">
                    {col.name}
                  </h2>
                  <div className="flex shrink-0 items-center gap-1">
                    {col.sectionId !== null && (
                      <button
                        type="button"
                        aria-label={`Copy link to section ${col.name}`}
                        title="Copy section link"
                        data-copied={isSecCopied ? "" : undefined}
                        data-failed={isSecFailed ? "" : undefined}
                        onClick={() =>
                          void copyLink(
                            copyKey,
                            buildTodoProjectUrl(
                              project.id,
                              col.sectionId,
                              window.location.origin
                            )
                          )
                        }
                        className={`inline-flex min-h-6 min-w-6 items-center justify-center rounded transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100 data-[copied]:opacity-100 data-[failed]:opacity-100 focus-visible:opacity-100 hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary ${
                          isSecCopied
                            ? "text-success"
                            : isSecFailed
                              ? "text-danger"
                              : "text-muted hover:text-foreground"
                        }`}
                      >
                        <Icon
                          name={isSecCopied ? "check-circle" : "link"}
                          className="size-3.5"
                        />
                      </button>
                    )}
                    <span className="text-[11px] text-muted tabular-nums">
                      {colTasks.length}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  {colTasks.map((task) => (
                    <TodoTaskRow
                      key={task.id}
                      task={task}
                      variant="card"
                      todayIso={todayIso}
                      subtasks={subtasksByParent.get(task.id) ?? []}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", task.id);
                        e.dataTransfer.effectAllowed = "move";
                        setDraggedTaskId(task.id);
                      }}
                      onDragOver={(e) => {
                        if (draggedTaskId) e.preventDefault();
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const sourceId =
                          e.dataTransfer.getData("text/plain") || draggedTaskId;
                        setDraggedTaskId(null);
                        setHoverSectionDrop(null);
                        if (sourceId && sourceId !== task.id) {
                          moveTask(sourceId, {
                            projectId: project.id,
                            sectionId: col.sectionId,
                            beforeTaskId: task.id,
                          });
                        }
                      }}
                    />
                  ))}
                </div>

                <div className="mt-2 pt-1">
                  <InlineAddTaskTrigger
                    compact
                    defaultProjectId={project.id}
                    defaultSectionId={col.sectionId}
                  />
                </div>
              </section>
            );
          })}

          {/* Add section column */}
          <div className="w-72 shrink-0">
            {addingSection ? (
              <form
                onSubmit={handleAddSection}
                className="space-y-2 rounded-xl border border-border bg-surface p-3"
              >
                <input
                  type="text"
                  autoFocus
                  value={newSectionName}
                  onChange={(e) => setNewSectionName(e.target.value)}
                  placeholder="Section name"
                  className="h-8 w-full rounded-md border border-border bg-canvas px-2.5 text-xs text-foreground placeholder:text-muted focus-visible:outline-2 focus-visible:outline-primary"
                />
                <div className="flex justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => setAddingSection(false)}
                    className="h-7 rounded-md px-2.5 text-xs text-muted hover:bg-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!newSectionName.trim()}
                    className="primary h-7 rounded-md px-3 text-xs font-medium disabled:opacity-45"
                  >
                    Add section
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setAddingSection(true)}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-3 text-xs font-medium text-muted transition-colors hover:border-primary hover:text-primary"
              >
                <Icon name="plus" className="size-3.5" />
                <span>Add section</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        /* List Layout */
        <div className="space-y-6">
          {/* Unsectioned tasks */}
          <section
            aria-label="Unsectioned tasks"
            onDragOver={(e) => {
              if (!draggedTaskId) return;
              e.preventDefault();
              setHoverSectionDrop("__none__");
            }}
            onDragLeave={() => {
              setHoverSectionDrop((curr) =>
                curr === "__none__" ? null : curr
              );
            }}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData("text/plain") || draggedTaskId;
              setDraggedTaskId(null);
              setHoverSectionDrop(null);
              if (id) {
                moveTask(id, { projectId: project.id, sectionId: null });
              }
            }}
            className={`space-y-1 rounded-lg transition-colors ${
              hoverSectionDrop === "__none__" ? "bg-secondary/40 p-1" : ""
            }`}
          >
            {unsectionedOpen.length > 0 && renderTaskList(unsectionedOpen, null)}
            <InlineAddTaskTrigger
              defaultProjectId={project.id}
              defaultSectionId={null}
            />
          </section>

          {/* Sections */}
          {projectSections.map((sec) => {
            const secTasks = tasksBySection.get(sec.id) ?? [];
            const isOver = hoverSectionDrop === sec.id;
            const isFocusedSec = focusedSectionId === sec.id;
            const secCopyKey = `sec:${sec.id}`;
            const isSecCopied =
              copiedFeedback?.key === secCopyKey && copiedFeedback.ok;
            const isSecFailed =
              copiedFeedback?.key === secCopyKey && !copiedFeedback.ok;
            return (
              <section
                key={sec.id}
                ref={(el) => setSectionRef(sec.id, el)}
                aria-label={sec.name}
                onDragOver={(e) => {
                  if (!draggedTaskId) return;
                  e.preventDefault();
                  setHoverSectionDrop(sec.id);
                }}
                onDragLeave={() => {
                  setHoverSectionDrop((curr) =>
                    curr === sec.id ? null : curr
                  );
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const id =
                    e.dataTransfer.getData("text/plain") || draggedTaskId;
                  setDraggedTaskId(null);
                  setHoverSectionDrop(null);
                  if (id) {
                    moveTask(id, { projectId: project.id, sectionId: sec.id });
                  }
                }}
                className={`space-y-1 rounded-lg transition-colors ${
                  isOver
                    ? "bg-secondary/40 p-1"
                    : isFocusedSec
                      ? "bg-secondary/20 p-2 ring-1 ring-primary/50"
                      : ""
                }`}
              >
                <div className="group flex items-center justify-between gap-2 border-b border-border pb-1.5">
                  <div className="flex min-w-0 flex-1 items-center gap-1.5">
                    <button
                      type="button"
                      aria-label={`Toggle section ${sec.name}`}
                      aria-expanded={!sec.collapsed}
                      onClick={() =>
                        updateSection(sec.id, { collapsed: !sec.collapsed })
                      }
                      className="inline-flex size-6 shrink-0 items-center justify-center rounded text-muted hover:bg-secondary hover:text-foreground"
                    >
                      <Icon
                        name="chevron-right"
                        className={`size-3.5 transition-transform ${
                          !sec.collapsed ? "rotate-90" : ""
                        }`}
                      />
                    </button>

                    <input
                      type="text"
                      aria-label="Section name"
                      value={sec.name}
                      onChange={(e) =>
                        updateSection(sec.id, { name: e.target.value })
                      }
                      className="min-w-0 flex-1 rounded bg-transparent px-1 py-0.5 text-sm font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                    />
                    <span className="shrink-0 text-xs text-muted tabular-nums">
                      {secTasks.length}
                    </span>
                  </div>

                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      aria-label={`Copy link to section ${sec.name}`}
                      title="Copy section link"
                      data-copied={isSecCopied ? "" : undefined}
                      data-failed={isSecFailed ? "" : undefined}
                      onClick={() =>
                        void copyLink(
                          secCopyKey,
                          buildTodoProjectUrl(
                            project.id,
                            sec.id,
                            window.location.origin
                          )
                        )
                      }
                      className={`inline-flex min-h-6 min-w-6 shrink-0 items-center justify-center rounded transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100 data-[copied]:opacity-100 data-[failed]:opacity-100 focus-visible:opacity-100 hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary ${
                        isSecCopied
                          ? "text-success"
                          : isSecFailed
                            ? "text-danger"
                            : "text-muted hover:text-foreground"
                      }`}
                    >
                      <Icon
                        name={isSecCopied ? "check-circle" : "link"}
                        className="size-3.5"
                      />
                    </button>

                    <button
                      type="button"
                      aria-label={`Delete section ${sec.name}`}
                      title="Delete section"
                      onClick={() => deleteSection(sec.id)}
                      className="inline-flex size-6 shrink-0 items-center justify-center rounded text-muted opacity-100 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100 hover:bg-danger/15 hover:text-danger focus-visible:opacity-100"
                    >
                      <Icon name="trash" className="size-3.5" />
                    </button>
                  </div>
                </div>

                {!sec.collapsed && (
                  <div className="space-y-1">
                    {secTasks.length > 0 && renderTaskList(secTasks, sec.id)}
                    <InlineAddTaskTrigger
                      compact
                      defaultProjectId={project.id}
                      defaultSectionId={sec.id}
                    />
                  </div>
                )}
              </section>
            );
          })}

          {/* Add section inline trigger */}
          <div>
            {addingSection ? (
              <form
                onSubmit={handleAddSection}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface p-3"
              >
                <label htmlFor={newSectionInputId} className="sr-only">
                  Section name
                </label>
                <input
                  id={newSectionInputId}
                  type="text"
                  autoFocus
                  value={newSectionName}
                  onChange={(e) => setNewSectionName(e.target.value)}
                  placeholder="Name this section"
                  className="h-8 min-w-48 flex-1 rounded-md border border-border bg-canvas px-2.5 text-xs text-foreground placeholder:text-muted focus-visible:outline-2 focus-visible:outline-primary"
                />
                <button
                  type="submit"
                  disabled={!newSectionName.trim()}
                  className="primary h-8 rounded-md px-3 text-xs font-medium disabled:opacity-45"
                >
                  Add section
                </button>
                <button
                  type="button"
                  onClick={() => setAddingSection(false)}
                  className="h-8 rounded-md border border-border px-3 text-xs text-muted hover:bg-secondary"
                >
                  Cancel
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setAddingSection(true)}
                className="flex w-full items-center justify-center gap-2 py-2 text-xs font-medium text-muted transition-colors hover:text-primary"
              >
                <span className="h-px flex-1 bg-border" />
                <span>+ Add section</span>
                <span className="h-px flex-1 bg-border" />
              </button>
            )}
          </div>

          {showCompleted && completedTasks.length > 0 && (
            <section
              aria-label="Completed project tasks"
              className="space-y-1 pt-4"
            >
              <h2 className="border-b border-border pb-1.5 text-xs font-semibold tracking-wider text-muted uppercase">
                Completed ({completedTasks.length})
              </h2>
              <div>
                {completedTasks.map((task) => (
                  <TodoTaskRow
                    key={task.id}
                    task={task}
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
  );
}
