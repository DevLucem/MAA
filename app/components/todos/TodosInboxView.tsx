"use client";

import { useMemo, useState } from "react";
import { Icon } from "../../assets/icons";
import { useTodos } from "../../lib/todos-store";
import {
  sortTodoTasks,
  type TodoSortBy,
  type TodoViewLayout,
} from "../../lib/todos-utils";
import { useTodayIsoDate } from "../../lib/use-client-date";
import {
  buildSubtasksMap,
  InlineAddTaskTrigger,
  TodoPriorityBoard,
} from "./TodoSharedBlocks";
import { TodoTaskRow } from "./TodoTaskRow";
import { TodoViewHeader } from "./TodoViewHeader";

/** Todoist-style Inbox view for uncategorized tasks with manual reorder, priority board, and completed toggle. */
export function TodosInboxView() {
  const todayIso = useTodayIsoDate() ?? "";
  const { hydrated, tasks, moveTask } = useTodos();

  const [layout, setLayout] = useState<TodoViewLayout>("list");
  const [sortBy, setSortBy] = useState<TodoSortBy>("manual");
  const [showCompleted, setShowCompleted] = useState(false);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);

  const subtasksByParent = useMemo(() => buildSubtasksMap(tasks), [tasks]);

  const { openTasks, completedTasks } = useMemo(() => {
    const inboxTop = tasks.filter(
      (t) => !t.parentId && t.projectId === null
    );
    return {
      openTasks: sortTodoTasks(
        inboxTop.filter((t) => !t.completed),
        sortBy
      ),
      completedTasks: inboxTop
        .filter((t) => t.completed)
        .sort((a, b) =>
          (b.completedAt ?? b.updatedAt).localeCompare(
            a.completedAt ?? a.updatedAt
          )
        ),
    };
  }, [sortBy, tasks]);

  if (!hydrated) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6 text-sm text-muted sm:px-8">
        Loading…
      </div>
    );
  }

  const canManualReorder = sortBy === "manual";

  return (
    <div
      className={`mx-auto space-y-6 px-4 py-6 sm:px-8 lg:px-12 ${
        layout === "board" ? "max-w-6xl" : "max-w-3xl"
      }`}
    >
      <TodoViewHeader
        title="Inbox"
        count={openTasks.length}
        layout={layout}
        onLayoutChange={setLayout}
        sortBy={sortBy}
        onSortChange={setSortBy}
        showCompleted={showCompleted}
        onShowCompletedChange={setShowCompleted}
      />

      {layout === "board" ? (
        <TodoPriorityBoard
          tasks={openTasks}
          subtasksByParent={subtasksByParent}
          todayIso={todayIso}
          defaultProjectId={null}
        />
      ) : (
        <div className="space-y-4">
          {openTasks.length > 0 && (
            <div>
              {openTasks.map((task, idx) => (
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
                    if (canManualReorder && draggedTaskId) {
                      e.preventDefault();
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const sourceId =
                      e.dataTransfer.getData("text/plain") || draggedTaskId;
                    setDraggedTaskId(null);
                    if (
                      canManualReorder &&
                      sourceId &&
                      sourceId !== task.id
                    ) {
                      moveTask(sourceId, {
                        projectId: null,
                        beforeTaskId: task.id,
                      });
                    }
                  }}
                  onMoveUp={
                    canManualReorder && idx > 0
                      ? () =>
                          moveTask(task.id, {
                            projectId: null,
                            beforeTaskId: openTasks[idx - 1].id,
                          })
                      : undefined
                  }
                  onMoveDown={
                    canManualReorder && idx < openTasks.length - 1
                      ? () =>
                          moveTask(task.id, {
                            projectId: null,
                            afterTaskId: openTasks[idx + 1].id,
                          })
                      : undefined
                  }
                />
              ))}
            </div>
          )}

          <InlineAddTaskTrigger defaultProjectId={null} />

          {openTasks.length === 0 && (
            <div className="rounded-xl border border-dashed border-border bg-surface/60 px-6 py-10 text-center">
              <Icon name="inbox" className="mx-auto size-9 text-primary/80" />
              <p className="mt-3 text-sm font-semibold text-foreground">
                Your Inbox is clear
              </p>
              <p className="mt-1 text-xs text-muted">
                Capture quick thoughts here before organizing them into
                projects.
              </p>
            </div>
          )}

          {showCompleted && completedTasks.length > 0 && (
            <section
              aria-label="Completed Inbox tasks"
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
