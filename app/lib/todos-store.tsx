"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { NotionColor } from "./database-types";
import { formatPlainDate, todayPlainDate } from "./database-types";
import {
  type ImportMode,
  prepareTodosImport,
  type WorkspaceTodosExport,
} from "./docs-transfer";
import { createId } from "./docs-utils";
import {
  collectProjectSubtree,
  computeNextRecurrenceDate,
  isOverdue,
  normalizeDueTime,
  normalizeLabelName,
  normalizePlainDateIso,
  repairProjectHierarchy,
  type TodoComment,
  type TodoLabel,
  type TodoPriority,
  type TodoProject,
  type TodoRecurrence,
  type TodoSection,
  type TodoTask,
  type TodoViewLayout,
} from "./todos-utils";
import { useTodayIsoDate } from "./use-client-date";
import { useWorkspaceServer } from "./workspace-server-store";

export interface CreateTaskInput {
  title: string;
  description?: string;
  projectId?: string | null;
  sectionId?: string | null;
  parentId?: string | null;
  priority?: TodoPriority;
  dueDate?: string;
  dueTime?: string;
  recurrence?: TodoRecurrence;
  labels?: string[];
}

export type TaskPatch = Partial<
  Pick<
    TodoTask,
    | "title"
    | "description"
    | "projectId"
    | "sectionId"
    | "parentId"
    | "priority"
    | "dueDate"
    | "dueTime"
    | "recurrence"
    | "labels"
    | "order"
  >
>;

export interface CreateProjectInput {
  name: string;
  color?: NotionColor;
  icon?: string;
  parentId?: string;
  favorite?: boolean;
  viewLayout?: TodoViewLayout;
}

export type ProjectPatch = Partial<
  Pick<
    TodoProject,
    "name" | "color" | "icon" | "parentId" | "favorite" | "viewLayout" | "order"
  >
>;

export interface QuickAddRequest {
  defaultProjectId?: string | null;
  defaultSectionId?: string | null;
  defaultDueDate?: string;
  defaultLabels?: string[];
  defaultPriority?: TodoPriority;
}

export type ProjectDialogRequest =
  | { mode: "create"; parentId?: string }
  | { mode: "edit"; project: TodoProject };

export interface TodoToast {
  id: string;
  message: string;
  undoLabel?: string;
  onUndo?: () => void;
}

interface TodosContextValue {
  hydrated: boolean;
  hydratedRevision: number;
  projects: TodoProject[];
  trashedProjects: TodoProject[];
  sections: TodoSection[];
  labels: TodoLabel[];
  tasks: TodoTask[];
  activeTasks: TodoTask[];
  inboxCount: number;
  todayCount: number;
  overdueCount: number;
  countByProject: Map<string, number>;
  getProject: (id: string) => TodoProject | undefined;
  getAnyProject: (id: string) => TodoProject | undefined;
  getTask: (id: string) => TodoTask | undefined;
  createProject: (input: CreateProjectInput) => TodoProject;
  updateProject: (id: string, patch: ProjectPatch) => void;
  toggleProjectFavorite: (id: string) => void;
  moveProjectToTrash: (id: string) => void;
  restoreProjects: (ids: string[]) => number;
  permanentlyDeleteProjects: (ids: string[]) => {
    projects: number;
    tasks: number;
  };
  createSection: (projectId: string, name: string) => TodoSection;
  updateSection: (
    id: string,
    patch: Partial<Pick<TodoSection, "name" | "collapsed" | "order">>
  ) => void;
  deleteSection: (id: string) => void;
  upsertLabel: (
    name: string,
    color?: NotionColor,
    favorite?: boolean
  ) => TodoLabel | null;
  renameLabel: (oldName: string, newName: string) => void;
  deleteLabel: (name: string) => void;
  createTask: (input: CreateTaskInput) => TodoTask;
  updateTask: (id: string, patch: TaskPatch) => void;
  duplicateTask: (id: string) => TodoTask | null;
  deleteTask: (id: string) => void;
  toggleTaskComplete: (id: string) => void;
  rescheduleTasks: (taskIds: string[], dueDate: string) => void;
  moveTask: (
    taskId: string,
    target: {
      projectId?: string | null;
      sectionId?: string | null;
      beforeTaskId?: string | null;
      afterTaskId?: string | null;
    }
  ) => void;
  addComment: (taskId: string, text: string) => TodoComment | null;
  deleteComment: (taskId: string, commentId: string) => void;
  quickAddRequest: QuickAddRequest | null;
  openQuickAdd: (request?: QuickAddRequest) => void;
  closeQuickAdd: () => void;
  activeTaskModalId: string | null;
  openTaskModal: (taskId: string) => void;
  closeTaskModal: () => void;
  projectDialogRequest: ProjectDialogRequest | null;
  openProjectDialog: (request: ProjectDialogRequest) => void;
  closeProjectDialog: () => void;
  toast: TodoToast | null;
  dismissToast: () => void;
  getExportSnapshot: () => WorkspaceTodosExport;
  importTodos: (
    data: WorkspaceTodosExport,
    mode: ImportMode
  ) => { projectsCount: number; tasksCount: number; labelsCount: number };
}

const TodosContext = createContext<TodosContextValue | null>(null);

function collectTaskSubtree(tasks: TodoTask[], rootId: string): Set<string> {
  const result = new Set<string>();
  const childrenMap = new Map<string, string[]>();
  for (const t of tasks) {
    if (t.parentId) {
      const list = childrenMap.get(t.parentId) ?? [];
      list.push(t.id);
      childrenMap.set(t.parentId, list);
    }
  }
  const stack = [rootId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (result.has(id)) continue;
    result.add(id);
    for (const childId of childrenMap.get(id) ?? []) {
      stack.push(childId);
    }
  }
  return result;
}

/** Provides Todoist-style projects, sections, labels, and tasks synchronized with the server workspace store. */
export function TodosProvider({ children }: { children: React.ReactNode }) {
  const { loaded, loadRevision, initialState } = useWorkspaceServer();
  const todayIso = useTodayIsoDate() ?? "";

  const [allProjects, setAllProjects] = useState<TodoProject[]>([]);
  const [allSections, setAllSections] = useState<TodoSection[]>([]);
  const [allLabels, setAllLabels] = useState<TodoLabel[]>([]);
  const [allTasks, setAllTasks] = useState<TodoTask[]>([]);
  const [hydratedRevision, setHydratedRevision] = useState(0);
  const lastAppliedRevisionRef = useRef(0);

  const hydrated = hydratedRevision > 0;

  const [quickAddRequest, setQuickAddRequest] =
    useState<QuickAddRequest | null>(null);
  const [activeTaskModalId, setActiveTaskModalId] = useState<string | null>(
    null
  );
  const [projectDialogRequest, setProjectDialogRequest] =
    useState<ProjectDialogRequest | null>(null);
  const [toast, setToast] = useState<TodoToast | null>(null);

  useEffect(() => {
    if (!loaded || loadRevision === 0) return;
    if (lastAppliedRevisionRef.current === loadRevision) return;
    lastAppliedRevisionRef.current = loadRevision;

    const todos = initialState.todos;
    setAllProjects(todos.projects);
    setAllSections(todos.sections);
    setAllLabels(todos.labels);
    setAllTasks(todos.tasks);
    setHydratedRevision(loadRevision);
  }, [initialState, loadRevision, loaded]);

  const allProjectsById = useMemo(
    () => new Map(allProjects.map((p) => [p.id, p])),
    [allProjects]
  );

  const hiddenProjectIds = useMemo(() => {
    const hidden = new Set<string>();
    for (const project of allProjects) {
      if (project.trashedAt) {
        for (const id of collectProjectSubtree(allProjects, project.id)) {
          hidden.add(id);
        }
      }
    }
    return hidden;
  }, [allProjects]);

  const projects = useMemo(
    () => allProjects.filter((p) => !hiddenProjectIds.has(p.id)),
    [allProjects, hiddenProjectIds]
  );

  const trashedProjects = useMemo(
    () => allProjects.filter((p) => Boolean(p.trashedAt)),
    [allProjects]
  );

  const sections = useMemo(
    () => allSections.filter((s) => !hiddenProjectIds.has(s.projectId)),
    [allSections, hiddenProjectIds]
  );

  const tasks = useMemo(
    () =>
      allTasks.filter(
        (t) => t.projectId === null || !hiddenProjectIds.has(t.projectId)
      ),
    [allTasks, hiddenProjectIds]
  );

  const activeTasks = useMemo(
    () => tasks.filter((t) => !t.completed),
    [tasks]
  );

  const labels = useMemo(() => {
    const map = new Map<string, TodoLabel>();
    for (const lbl of allLabels) {
      const key = normalizeLabelName(lbl.name);
      if (key && !map.has(key)) {
        map.set(key, { ...lbl, name: key });
      }
    }
    for (const task of tasks) {
      for (const rawName of task.labels) {
        const key = normalizeLabelName(rawName);
        if (key && !map.has(key)) {
          map.set(key, {
            id: `discovered-${key}`,
            name: key,
            color: "gray",
          });
        }
      }
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [allLabels, tasks]);

  const { inboxCount, todayCount, overdueCount, countByProject } = useMemo(() => {
    let inbox = 0;
    let today = 0;
    let overdue = 0;
    const byProject = new Map<string, number>();

    for (const task of activeTasks) {
      if (!task.parentId) {
        if (task.projectId === null) {
          inbox += 1;
        } else {
          byProject.set(
            task.projectId,
            (byProject.get(task.projectId) ?? 0) + 1
          );
        }
      }

      if (todayIso && task.dueDate) {
        if (isOverdue(task.dueDate, todayIso)) {
          overdue += 1;
          today += 1;
        } else if (task.dueDate === todayIso) {
          today += 1;
        }
      }
    }

    return {
      inboxCount: inbox,
      todayCount: today,
      overdueCount: overdue,
      countByProject: byProject,
    };
  }, [activeTasks, todayIso]);

  const getProject = useCallback(
    (id: string) =>
      hiddenProjectIds.has(id) ? undefined : allProjectsById.get(id),
    [allProjectsById, hiddenProjectIds]
  );

  const getAnyProject = useCallback(
    (id: string) => allProjectsById.get(id),
    [allProjectsById]
  );

  const getTask = useCallback(
    (id: string) => tasks.find((t) => t.id === id),
    [tasks]
  );

  const createProject = useCallback(
    (input: CreateProjectInput): TodoProject => {
      const parent = input.parentId
        ? allProjectsById.get(input.parentId)
        : undefined;
      const maxOrder = allProjects.reduce(
        (max, p) => Math.max(max, p.order),
        -1
      );
      const project: TodoProject = {
        id: createId(),
        name: input.name.trim(),
        color: input.color ?? "blue",
        order: maxOrder + 1,
        createdAt: new Date().toISOString(),
        ...(input.icon ? { icon: input.icon } : {}),
        ...(parent ? { parentId: parent.id } : {}),
        ...(input.favorite ? { favorite: true } : {}),
        ...(input.viewLayout ? { viewLayout: input.viewLayout } : {}),
      };
      setAllProjects((prev) => [...prev, project]);
      return project;
    },
    [allProjects, allProjectsById]
  );

  const updateProject = useCallback((id: string, patch: ProjectPatch) => {
    setAllProjects((prev) => {
      const next = prev.map((p) => {
        if (p.id !== id) return p;
        const updated: TodoProject = { ...p };
        if (patch.name !== undefined) updated.name = patch.name;
        if (patch.color !== undefined) updated.color = patch.color;
        if ("icon" in patch) {
          if (patch.icon) updated.icon = patch.icon;
          else delete updated.icon;
        }
        if ("parentId" in patch) {
          if (patch.parentId && patch.parentId !== id) {
            updated.parentId = patch.parentId;
          } else {
            delete updated.parentId;
          }
        }
        if (patch.favorite !== undefined) {
          if (patch.favorite) updated.favorite = true;
          else delete updated.favorite;
        }
        if (patch.viewLayout !== undefined) {
          updated.viewLayout = patch.viewLayout;
        }
        if (patch.order !== undefined) {
          updated.order = patch.order;
        }
        return updated;
      });
      return repairProjectHierarchy(next);
    });
  }, []);

  const toggleProjectFavorite = useCallback((id: string) => {
    setAllProjects((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        if (p.favorite) {
          const { favorite: _f, ...rest } = p;
          void _f;
          return rest;
        }
        return { ...p, favorite: true };
      })
    );
  }, []);

  const moveProjectToTrash = useCallback((id: string) => {
    const now = new Date().toISOString();
    setAllProjects((prev) =>
      prev.map((p) => (p.id === id ? { ...p, trashedAt: now } : p))
    );
  }, []);

  const restoreProjects = useCallback(
    (ids: string[]) => {
      const restoreSet = new Set(ids);
      const byId = new Map(allProjects.map((p) => [p.id, p]));
      const stillTrashed = (id: string) =>
        !restoreSet.has(id) && Boolean(byId.get(id)?.trashedAt);
      const chainHasTrashed = (id: string) => {
        const seen = new Set<string>();
        let cur = byId.get(id);
        while (cur && !seen.has(cur.id)) {
          if (stillTrashed(cur.id)) return true;
          seen.add(cur.id);
          cur = cur.parentId ? byId.get(cur.parentId) : undefined;
        }
        return false;
      };

      let restored = 0;
      const next = allProjects.map((project) => {
        if (!restoreSet.has(project.id) || !project.trashedAt) return project;
        restored += 1;
        let parentId = project.parentId;
        const seen = new Set<string>();
        while (parentId && !seen.has(parentId) && chainHasTrashed(parentId)) {
          seen.add(parentId);
          parentId = byId.get(parentId)?.parentId;
        }
        if (parentId && !byId.has(parentId)) parentId = undefined;
        const { trashedAt: _t, parentId: _p, ...base } = project;
        void _t;
        void _p;
        return parentId ? { ...base, parentId } : base;
      });
      setAllProjects(next);
      return restored;
    },
    [allProjects]
  );

  const permanentlyDeleteProjects = useCallback(
    (ids: string[]) => {
      const removeIds = new Set<string>();
      for (const id of ids) {
        for (const sub of collectProjectSubtree(allProjects, id)) {
          removeIds.add(sub);
        }
      }
      const removedTasks = allTasks.filter(
        (t) => t.projectId !== null && removeIds.has(t.projectId)
      ).length;
      setAllProjects((prev) => prev.filter((p) => !removeIds.has(p.id)));
      setAllSections((prev) =>
        prev.filter((s) => !removeIds.has(s.projectId))
      );
      setAllTasks((prev) =>
        prev.filter((t) => t.projectId === null || !removeIds.has(t.projectId))
      );
      return { projects: removeIds.size, tasks: removedTasks };
    },
    [allProjects, allTasks]
  );

  const createSection = useCallback(
    (projectId: string, name: string): TodoSection => {
      const maxOrder = allSections
        .filter((s) => s.projectId === projectId)
        .reduce((max, s) => Math.max(max, s.order), -1);
      const section: TodoSection = {
        id: createId(),
        projectId,
        name: name.trim() || "Untitled section",
        order: maxOrder + 1,
        createdAt: new Date().toISOString(),
      };
      setAllSections((prev) => [...prev, section]);
      return section;
    },
    [allSections]
  );

  const updateSection = useCallback(
    (
      id: string,
      patch: Partial<Pick<TodoSection, "name" | "collapsed" | "order">>
    ) => {
      setAllSections((prev) =>
        prev.map((s) => {
          if (s.id !== id) return s;
          const next = { ...s };
          if (patch.name !== undefined) next.name = patch.name;
          if (patch.collapsed !== undefined) {
            if (patch.collapsed) next.collapsed = true;
            else delete next.collapsed;
          }
          if (patch.order !== undefined) next.order = patch.order;
          return next;
        })
      );
    },
    []
  );

  const deleteSection = useCallback((id: string) => {
    setAllSections((prev) => prev.filter((s) => s.id !== id));
    setAllTasks((prev) =>
      prev.map((t) => {
        if (t.sectionId !== id) return t;
        const { sectionId: _s, ...rest } = t;
        void _s;
        return rest;
      })
    );
  }, []);

  const upsertLabel = useCallback(
    (
      name: string,
      color: NotionColor = "gray",
      favorite?: boolean
    ): TodoLabel | null => {
      const norm = normalizeLabelName(name);
      if (!norm) return null;
      let createdOrUpdated: TodoLabel | null = null;
      setAllLabels((prev) => {
        const idx = prev.findIndex((l) => normalizeLabelName(l.name) === norm);
        if (idx >= 0) {
          const existing = prev[idx];
          const updated: TodoLabel = {
            ...existing,
            name: norm,
            color,
            ...(favorite !== undefined
              ? favorite
                ? { favorite: true }
                : {}
              : existing.favorite
                ? { favorite: true }
                : {}),
          };
          if (favorite === false) delete updated.favorite;
          createdOrUpdated = updated;
          return prev.map((l, i) => (i === idx ? updated : l));
        }
        const fresh: TodoLabel = {
          id: createId(),
          name: norm,
          color,
          ...(favorite ? { favorite: true } : {}),
        };
        createdOrUpdated = fresh;
        return [...prev, fresh];
      });
      return createdOrUpdated;
    },
    []
  );

  const renameLabel = useCallback((oldName: string, newName: string) => {
    const oldNorm = normalizeLabelName(oldName);
    const newNorm = normalizeLabelName(newName);
    if (!oldNorm || !newNorm || oldNorm === newNorm) return;

    setAllLabels((prev) => {
      const hasNew = prev.some((l) => normalizeLabelName(l.name) === newNorm);
      const hasOld = prev.some((l) => normalizeLabelName(l.name) === oldNorm);
      if (!hasOld && hasNew) return prev;
      if (hasNew) {
        return prev.filter((l) => normalizeLabelName(l.name) !== oldNorm);
      }
      if (hasOld) {
        return prev.map((l) =>
          normalizeLabelName(l.name) === oldNorm ? { ...l, name: newNorm } : l
        );
      }
      return [...prev, { id: createId(), name: newNorm, color: "gray" }];
    });

    setAllTasks((prev) =>
      prev.map((t) => {
        if (!t.labels.includes(oldNorm)) return t;
        const nextLabels = Array.from(
          new Set(t.labels.map((l) => (l === oldNorm ? newNorm : l)))
        );
        return { ...t, labels: nextLabels };
      })
    );
  }, []);

  const deleteLabel = useCallback((name: string) => {
    const norm = normalizeLabelName(name);
    if (!norm) return;
    setAllLabels((prev) =>
      prev.filter((l) => normalizeLabelName(l.name) !== norm)
    );
    setAllTasks((prev) =>
      prev.map((t) =>
        t.labels.includes(norm)
          ? { ...t, labels: t.labels.filter((l) => l !== norm) }
          : t
      )
    );
  }, []);

  const createTask = useCallback(
    (input: CreateTaskInput): TodoTask => {
      const nowIso = new Date().toISOString();
      const parent = input.parentId
        ? allTasks.find((t) => t.id === input.parentId)
        : undefined;
      const projectId =
        input.projectId !== undefined
          ? input.projectId
          : parent
            ? parent.projectId
            : null;
      const sectionId = parent
        ? undefined
        : projectId && input.sectionId
          ? input.sectionId
          : undefined;
      const dueDate = normalizePlainDateIso(input.dueDate);
      const dueTime = dueDate ? normalizeDueTime(input.dueTime) : undefined;
      const cleanLabels = Array.from(
        new Set((input.labels ?? []).map(normalizeLabelName).filter(Boolean))
      );

      const maxOrder = allTasks
        .filter(
          (t) =>
            t.projectId === projectId &&
            (t.sectionId ?? undefined) === sectionId &&
            (t.parentId ?? undefined) === (parent?.id ?? undefined)
        )
        .reduce((max, t) => Math.max(max, t.order), -1);

      const task: TodoTask = {
        id: createId(),
        title: input.title.trim() || "Untitled task",
        projectId,
        priority: input.priority ?? 4,
        labels: cleanLabels,
        completed: false,
        order: maxOrder + 1,
        createdAt: nowIso,
        updatedAt: nowIso,
        ...(input.description?.trim()
          ? { description: input.description }
          : {}),
        ...(sectionId ? { sectionId } : {}),
        ...(parent ? { parentId: parent.id } : {}),
        ...(dueDate ? { dueDate } : {}),
        ...(dueTime ? { dueTime } : {}),
        ...(input.recurrence ? { recurrence: input.recurrence } : {}),
      };

      setAllTasks((prev) => [...prev, task]);
      return task;
    },
    [allTasks]
  );

  const updateTask = useCallback((id: string, patch: TaskPatch) => {
    const nowIso = new Date().toISOString();
    setAllTasks((prev) => {
      const target = prev.find((t) => t.id === id);
      if (!target) return prev;

      const projectChanged =
        patch.projectId !== undefined && patch.projectId !== target.projectId;
      const subtreeIds = projectChanged
        ? collectTaskSubtree(prev, id)
        : new Set([id]);

      return prev.map((t) => {
        if (t.id === id) {
          const next: TodoTask = { ...t, updatedAt: nowIso };
          if (patch.title !== undefined) {
            next.title = patch.title.trim() || t.title;
          }
          if ("description" in patch) {
            if (patch.description?.trim()) next.description = patch.description;
            else delete next.description;
          }
          if (patch.projectId !== undefined) {
            next.projectId = patch.projectId;
            if (patch.projectId === null || projectChanged) {
              delete next.sectionId;
            }
          }
          if ("sectionId" in patch) {
            if (patch.sectionId && next.projectId) {
              next.sectionId = patch.sectionId;
            } else {
              delete next.sectionId;
            }
          }
          if ("parentId" in patch) {
            if (patch.parentId && patch.parentId !== id) {
              next.parentId = patch.parentId;
              delete next.sectionId;
            } else {
              delete next.parentId;
            }
          }
          if (patch.priority !== undefined) next.priority = patch.priority;
          if ("dueDate" in patch) {
            const normDate = normalizePlainDateIso(patch.dueDate);
            if (normDate) {
              next.dueDate = normDate;
            } else {
              delete next.dueDate;
              delete next.dueTime;
            }
          }
          if ("dueTime" in patch) {
            const normTime = next.dueDate
              ? normalizeDueTime(patch.dueTime)
              : undefined;
            if (normTime) next.dueTime = normTime;
            else delete next.dueTime;
          }
          if ("recurrence" in patch) {
            if (patch.recurrence) next.recurrence = patch.recurrence;
            else delete next.recurrence;
          }
          if (patch.labels !== undefined) {
            next.labels = Array.from(
              new Set(patch.labels.map(normalizeLabelName).filter(Boolean))
            );
          }
          if (patch.order !== undefined) next.order = patch.order;
          return next;
        }
        if (projectChanged && subtreeIds.has(t.id)) {
          const next = { ...t, projectId: patch.projectId ?? null, updatedAt: nowIso };
          delete next.sectionId;
          return next;
        }
        return t;
      });
    });
  }, []);

  const duplicateTask = useCallback(
    (id: string): TodoTask | null => {
      const source = allTasks.find((t) => t.id === id);
      if (!source) return null;
      const nowIso = new Date().toISOString();
      const copy: TodoTask = {
        ...source,
        id: createId(),
        title: `${source.title} (copy)`,
        completed: false,
        order: source.order + 0.5,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      delete copy.completedAt;
      delete copy.comments;
      setAllTasks((prev) => [...prev, copy]);
      return copy;
    },
    [allTasks]
  );

  const deleteTask = useCallback(
    (id: string) => {
      const target = allTasks.find((t) => t.id === id);
      if (!target) return;
      const removeIds = collectTaskSubtree(allTasks, id);
      const removedTasks = allTasks.filter((t) => removeIds.has(t.id));

      setAllTasks((prev) => prev.filter((t) => !removeIds.has(t.id)));
      setActiveTaskModalId((curr) =>
        curr && removeIds.has(curr) ? null : curr
      );

      setToast({
        id: createId(),
        message: `Deleted "${target.title}"`,
        undoLabel: "Undo",
        onUndo: () => {
          setAllTasks((prev) => {
            const existingIds = new Set(prev.map((t) => t.id));
            const restored = removedTasks.filter((t) => !existingIds.has(t.id));
            return [...prev, ...restored];
          });
        },
      });
    },
    [allTasks]
  );

  const toggleTaskComplete = useCallback(
    (id: string) => {
      const target = allTasks.find((t) => t.id === id);
      if (!target) return;

      const nowIso = new Date().toISOString();
      const currentTodayIso = formatPlainDate(todayPlainDate());

      if (!target.completed) {
        if (target.recurrence) {
          const prevDueDate = target.dueDate;
          const prevDueTime = target.dueTime;
          const nextDueDate = computeNextRecurrenceDate(
            prevDueDate ?? currentTodayIso,
            target.recurrence,
            currentTodayIso
          );

          setAllTasks((prev) =>
            prev.map((t) =>
              t.id === id
                ? { ...t, dueDate: nextDueDate, updatedAt: nowIso }
                : t
            )
          );

          setToast({
            id: createId(),
            message: `Completed "${target.title}" · Next: ${nextDueDate}`,
            undoLabel: "Undo",
            onUndo: () => {
              setAllTasks((prev) =>
                prev.map((t) => {
                  if (t.id !== id) return t;
                  const restored: TodoTask = {
                    ...t,
                    updatedAt: new Date().toISOString(),
                  };
                  if (prevDueDate) restored.dueDate = prevDueDate;
                  else delete restored.dueDate;
                  if (prevDueTime) restored.dueTime = prevDueTime;
                  else delete restored.dueTime;
                  return restored;
                })
              );
            },
          });
          return;
        }

        setAllTasks((prev) =>
          prev.map((t) =>
            t.id === id
              ? {
                  ...t,
                  completed: true,
                  completedAt: nowIso,
                  updatedAt: nowIso,
                }
              : t
          )
        );

        setToast({
          id: createId(),
          message: `Completed "${target.title}"`,
          undoLabel: "Undo",
          onUndo: () => {
            setAllTasks((prev) =>
              prev.map((t) => {
                if (t.id !== id) return t;
                const { completedAt: _c, ...rest } = t;
                void _c;
                return {
                  ...rest,
                  completed: false,
                  updatedAt: new Date().toISOString(),
                };
              })
            );
          },
        });
        return;
      }

      // Reopening a previously completed task
      setAllTasks((prev) =>
        prev.map((t) => {
          if (t.id !== id) return t;
          const { completedAt: _c, ...rest } = t;
          void _c;
          return { ...rest, completed: false, updatedAt: nowIso };
        })
      );
    },
    [allTasks]
  );

  const rescheduleTasks = useCallback(
    (taskIds: string[], dueDate: string) => {
      const normalized = normalizePlainDateIso(dueDate);
      if (!normalized || taskIds.length === 0) return;

      const idSet = new Set(taskIds);
      const snapshots = new Map<string, string | undefined>();
      for (const task of allTasks) {
        if (idSet.has(task.id)) {
          snapshots.set(task.id, task.dueDate);
        }
      }
      if (snapshots.size === 0) return;

      const nowIso = new Date().toISOString();
      setAllTasks((prev) =>
        prev.map((t) =>
          snapshots.has(t.id)
            ? { ...t, dueDate: normalized, updatedAt: nowIso }
            : t
        )
      );

      setToast({
        id: createId(),
        message: `Rescheduled ${snapshots.size} ${snapshots.size === 1 ? "task" : "tasks"} to ${normalized}`,
        undoLabel: "Undo",
        onUndo: () => {
          setAllTasks((prev) =>
            prev.map((t) => {
              if (!snapshots.has(t.id)) return t;
              const prevDue = snapshots.get(t.id);
              const next: TodoTask = {
                ...t,
                updatedAt: new Date().toISOString(),
              };
              if (prevDue) next.dueDate = prevDue;
              else {
                delete next.dueDate;
                delete next.dueTime;
              }
              return next;
            })
          );
        },
      });
    },
    [allTasks]
  );

  const moveTask = useCallback(
    (
      taskId: string,
      target: {
        projectId?: string | null;
        sectionId?: string | null;
        beforeTaskId?: string | null;
        afterTaskId?: string | null;
      }
    ) => {
      const nowIso = new Date().toISOString();
      setAllTasks((prev) => {
        const moving = prev.find((t) => t.id === taskId);
        if (!moving) return prev;

        const nextProjectId =
          target.projectId !== undefined ? target.projectId : moving.projectId;
        const nextSectionId =
          nextProjectId === null
            ? undefined
            : target.sectionId !== undefined
              ? (target.sectionId ?? undefined)
              : target.projectId !== undefined &&
                  target.projectId !== moving.projectId
                ? undefined
                : moving.sectionId;

        const projectChanged = nextProjectId !== moving.projectId;
        const subtreeIds = projectChanged
          ? collectTaskSubtree(prev, taskId)
          : new Set([taskId]);

        const updatedMoving: TodoTask = {
          ...moving,
          projectId: nextProjectId,
          updatedAt: nowIso,
        };
        if (nextSectionId) updatedMoving.sectionId = nextSectionId;
        else delete updatedMoving.sectionId;

        // Recompute order in destination sibling list
        const destSiblings = prev
          .filter(
            (t) =>
              t.id !== taskId &&
              !t.completed &&
              (t.parentId ?? null) === (moving.parentId ?? null) &&
              t.projectId === nextProjectId &&
              (t.sectionId ?? undefined) === nextSectionId
          )
          .sort(
            (a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt)
          );

        let insertIdx = destSiblings.length;
        if (target.beforeTaskId) {
          const idx = destSiblings.findIndex(
            (t) => t.id === target.beforeTaskId
          );
          if (idx >= 0) insertIdx = idx;
        } else if (target.afterTaskId) {
          const idx = destSiblings.findIndex(
            (t) => t.id === target.afterTaskId
          );
          if (idx >= 0) insertIdx = idx + 1;
        }

        destSiblings.splice(insertIdx, 0, updatedMoving);
        const orderById = new Map<string, number>();
        destSiblings.forEach((t, idx) => orderById.set(t.id, idx));

        return prev.map((t) => {
          if (t.id === taskId) {
            return {
              ...updatedMoving,
              order: orderById.get(taskId) ?? updatedMoving.order,
            };
          }
          if (projectChanged && subtreeIds.has(t.id)) {
            const sub: TodoTask = {
              ...t,
              projectId: nextProjectId,
              updatedAt: nowIso,
            };
            delete sub.sectionId;
            return sub;
          }
          const nextOrder = orderById.get(t.id);
          return nextOrder !== undefined ? { ...t, order: nextOrder } : t;
        });
      });
    },
    []
  );

  const addComment = useCallback(
    (taskId: string, text: string): TodoComment | null => {
      const clean = text.trim();
      if (!clean) return null;
      const comment: TodoComment = {
        id: createId(),
        text: clean,
        createdAt: new Date().toISOString(),
      };
      setAllTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? {
                ...t,
                comments: [...(t.comments ?? []), comment],
                updatedAt: new Date().toISOString(),
              }
            : t
        )
      );
      return comment;
    },
    []
  );

  const deleteComment = useCallback((taskId: string, commentId: string) => {
    setAllTasks((prev) =>
      prev.map((t) => {
        if (t.id !== taskId || !t.comments) return t;
        const nextComments = t.comments.filter((c) => c.id !== commentId);
        const next = { ...t, updatedAt: new Date().toISOString() };
        if (nextComments.length > 0) next.comments = nextComments;
        else delete next.comments;
        return next;
      })
    );
  }, []);

  const openQuickAdd = useCallback((request?: QuickAddRequest) => {
    setQuickAddRequest(request ?? {});
  }, []);
  const closeQuickAdd = useCallback(() => setQuickAddRequest(null), []);

  const openTaskModal = useCallback((taskId: string) => {
    setActiveTaskModalId(taskId);
  }, []);
  const closeTaskModal = useCallback(() => setActiveTaskModalId(null), []);

  const openProjectDialog = useCallback((request: ProjectDialogRequest) => {
    setProjectDialogRequest(request);
  }, []);
  const closeProjectDialog = useCallback(
    () => setProjectDialogRequest(null),
    []
  );

  const dismissToast = useCallback(() => setToast(null), []);

  const getExportSnapshot = useCallback(
    (): WorkspaceTodosExport => ({
      projects: allProjects,
      sections: allSections,
      labels: allLabels,
      tasks: allTasks,
    }),
    [allLabels, allProjects, allSections, allTasks]
  );

  const importTodos = useCallback(
    (data: WorkspaceTodosExport, mode: ImportMode) => {
      const next = prepareTodosImport(
        {
          projects: allProjects,
          sections: allSections,
          labels: allLabels,
          tasks: allTasks,
        },
        data,
        mode
      );

      setAllProjects(next.projects);
      setAllSections(next.sections);
      setAllLabels(next.labels);
      setAllTasks(next.tasks);

      return {
        projectsCount: data.projects.length,
        tasksCount: data.tasks.length,
        labelsCount: data.labels.length,
      };
    },
    [allLabels, allProjects, allSections, allTasks]
  );

  const value = useMemo<TodosContextValue>(
    () => ({
      hydrated,
      hydratedRevision,
      projects,
      trashedProjects,
      sections,
      labels,
      tasks,
      activeTasks,
      inboxCount,
      todayCount,
      overdueCount,
      countByProject,
      getProject,
      getAnyProject,
      getTask,
      createProject,
      updateProject,
      toggleProjectFavorite,
      moveProjectToTrash,
      restoreProjects,
      permanentlyDeleteProjects,
      createSection,
      updateSection,
      deleteSection,
      upsertLabel,
      renameLabel,
      deleteLabel,
      createTask,
      updateTask,
      duplicateTask,
      deleteTask,
      toggleTaskComplete,
      rescheduleTasks,
      moveTask,
      addComment,
      deleteComment,
      quickAddRequest,
      openQuickAdd,
      closeQuickAdd,
      activeTaskModalId,
      openTaskModal,
      closeTaskModal,
      projectDialogRequest,
      openProjectDialog,
      closeProjectDialog,
      toast,
      dismissToast,
      getExportSnapshot,
      importTodos,
    }),
    [
      hydrated,
      hydratedRevision,
      projects,
      trashedProjects,
      sections,
      labels,
      tasks,
      activeTasks,
      inboxCount,
      todayCount,
      overdueCount,
      countByProject,
      getProject,
      getAnyProject,
      getTask,
      createProject,
      updateProject,
      toggleProjectFavorite,
      moveProjectToTrash,
      restoreProjects,
      permanentlyDeleteProjects,
      createSection,
      updateSection,
      deleteSection,
      upsertLabel,
      renameLabel,
      deleteLabel,
      createTask,
      updateTask,
      duplicateTask,
      deleteTask,
      toggleTaskComplete,
      rescheduleTasks,
      moveTask,
      addComment,
      deleteComment,
      quickAddRequest,
      openQuickAdd,
      closeQuickAdd,
      activeTaskModalId,
      openTaskModal,
      closeTaskModal,
      projectDialogRequest,
      openProjectDialog,
      closeProjectDialog,
      toast,
      dismissToast,
      getExportSnapshot,
      importTodos,
    ]
  );

  return (
    <TodosContext.Provider value={value}>{children}</TodosContext.Provider>
  );
}

export function useTodos(): TodosContextValue {
  const ctx = useContext(TodosContext);
  if (!ctx) {
    throw new Error("useTodos must be used within a TodosProvider");
  }
  return ctx;
}
