"use client";

import { Icon } from "../../assets/icons";
import { useTodos } from "../../lib/todos-store";
import { projectDisplayName } from "../../lib/todos-utils";

/** Trashed Todo projects with restore and permanent-delete actions (used inside Settings › Trash). */
export function TodoTrashList({
  onFeedback,
}: {
  onFeedback: (message: string) => void;
}) {
  const {
    trashedProjects,
    getAnyProject,
    restoreProjects,
    permanentlyDeleteProjects,
  } = useTodos();

  if (trashedProjects.length === 0) return null;

  return (
    <section aria-label="Trashed todo projects" className="space-y-2">
      <h3 className="text-xs font-semibold tracking-wider text-muted uppercase">
        Todo projects
      </h3>
      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-canvas/50">
        {trashedProjects.map((project) => {
          const name = projectDisplayName(project);
          const parent = project.parentId
            ? getAnyProject(project.parentId)
            : undefined;
          return (
            <li
              key={project.id}
              className="flex items-start justify-between gap-3 px-3 py-2.5 hover:bg-secondary/40"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  {project.icon ? (
                    <span aria-hidden="true" className="text-sm leading-none">
                      {project.icon}
                    </span>
                  ) : (
                    <span
                      aria-hidden="true"
                      className="inline-flex size-3.5 shrink-0 items-center justify-center"
                      style={{ color: `var(--notion-${project.color})` }}
                    >
                      <Icon name="hash" className="size-3.5" />
                    </span>
                  )}
                  <span className="truncate text-xs font-semibold text-foreground">
                    {name}
                  </span>
                </div>
                <p className="mt-0.5 text-[10px] text-muted">
                  {project.trashedAt
                    ? `Trashed ${project.trashedAt.slice(0, 10)}`
                    : "In Trash"}
                  {parent ? ` · Inside ${projectDisplayName(parent)}` : ""}
                  {" · Includes its sub-projects, sections, and tasks"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  aria-label={`Restore ${name}`}
                  title="Restore project"
                  onClick={() => {
                    restoreProjects([project.id]);
                    onFeedback(`Restored "${name}".`);
                  }}
                  className="inline-flex size-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <Icon name="restore" className="size-3.5" />
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${name} permanently`}
                  title="Delete permanently"
                  onClick={() => {
                    const result = permanentlyDeleteProjects([project.id]);
                    onFeedback(
                      `Permanently deleted "${name}" (${result.projects} ${
                        result.projects === 1 ? "project" : "projects"
                      }, ${result.tasks} ${
                        result.tasks === 1 ? "task" : "tasks"
                      }).`
                    );
                  }}
                  className="inline-flex size-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-danger/15 hover:text-danger focus-visible:outline-2 focus-visible:outline-danger"
                >
                  <Icon name="trash" className="size-3.5" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
