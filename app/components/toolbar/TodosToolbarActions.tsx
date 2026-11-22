"use client";

import { useRouter } from "next/navigation";
import { type CSSProperties, useId } from "react";
import { Icon } from "../../assets/icons";
import { useTodos } from "../../lib/todos-store";
import {
  buildTodoProjectUrl,
  type TodoProject,
} from "../../lib/todos-utils";
import { useToolbarMenu } from "./useToolbarMenu";

const menuItemClass =
  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-sm text-foreground transition-colors hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none";

/** Right-aligned Todos toolbar actions: Quick Add, Copy link, and optional project `...` menu. */
export function TodosToolbarActions({
  project,
  defaultProjectId,
  copiedLabel,
  onCopyLink,
  onFlashLabel,
}: {
  project?: TodoProject | null;
  defaultProjectId?: string | null;
  copiedLabel: string | null;
  onCopyLink: () => Promise<void>;
  onFlashLabel?: (label: string) => void;
}) {
  const router = useRouter();
  const {
    countByProject,
    openQuickAdd,
    openProjectDialog,
    toggleProjectFavorite,
    updateProject,
    moveProjectToTrash,
  } = useTodos();

  const menuTriggerId = useId();
  const menuPopoverId = useId();
  const menuAnchorName = `--anchor-${menuTriggerId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const { menuTriggerRef, menuPopoverRef, menuGroupRef, menuOpen, closeMenu } =
    useToolbarMenu(project?.id ?? "todos");

  const openTaskCount = project ? (countByProject.get(project.id) ?? 0) : 0;
  const currentLayout = project?.viewLayout ?? "list";

  return (
    <div className="flex shrink-0 items-center gap-1">
      {copiedLabel && (
        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-foreground">
          {copiedLabel}
        </span>
      )}

      <button
        type="button"
        title="Add task (Q)"
        onClick={() =>
          openQuickAdd(
            defaultProjectId !== undefined ? { defaultProjectId } : {}
          )
        }
        className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary"
      >
        <Icon name="plus" className="size-3.5 text-primary" />
        <span className="hidden sm:inline">Add task</span>
      </button>

      <button
        type="button"
        aria-label="Copy link"
        onClick={() => void onCopyLink()}
        className="inline-flex size-8 items-center justify-center rounded-md text-foreground transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary"
      >
        <Icon name="link" className="size-4" />
      </button>

      {project && (
        <>
          <button
            ref={menuTriggerRef}
            id={menuTriggerId}
            type="button"
            aria-label="Project actions"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            style={{ anchorName: menuAnchorName } as CSSProperties}
            {...({
              commandfor: menuPopoverId,
              command: "toggle-popover",
            } as Record<string, string>)}
            className={`inline-flex size-8 items-center justify-center rounded-md text-foreground transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary ${
              menuOpen ? "bg-secondary" : ""
            }`}
          >
            <Icon name="ellipsis" className="size-4" />
          </button>

          <div
            ref={menuPopoverRef}
            id={menuPopoverId}
            {...({ popover: "auto" } as Record<string, string>)}
            style={{ positionAnchor: menuAnchorName } as CSSProperties}
            className="toolbar-popover w-56 rounded-lg border border-border bg-canvas p-1.5 text-foreground shadow-lg"
          >
            <div className="px-2 py-1.5 text-xs text-muted">
              {openTaskCount} open {openTaskCount === 1 ? "task" : "tasks"}
            </div>
            <hr className="my-1 border-border" />
            <div
              ref={menuGroupRef}
              {...({ focusgroup: "menu nomemory" } as Record<string, string>)}
              aria-labelledby={menuTriggerId}
              className="flex flex-col"
            >
              <button
                type="button"
                onClick={() => {
                  toggleProjectFavorite(project.id);
                  closeMenu();
                }}
                className={menuItemClass}
              >
                <Icon
                  name={project.favorite ? "star-solid" : "star"}
                  className="size-3.5 text-muted"
                />
                <span>
                  {project.favorite
                    ? "Remove from favorites"
                    : "Add to favorites"}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  updateProject(project.id, {
                    viewLayout: currentLayout === "board" ? "list" : "board",
                  });
                  closeMenu();
                }}
                className={menuItemClass}
              >
                <Icon
                  name={currentLayout === "board" ? "list" : "board"}
                  className="size-3.5 text-muted"
                />
                <span>
                  {currentLayout === "board"
                    ? "Switch to List view"
                    : "Switch to Board view"}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  closeMenu();
                  openProjectDialog({ mode: "edit", project });
                }}
                className={menuItemClass}
              >
                <Icon name="edit" className="size-3.5 text-muted" />
                <span>Edit project</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  closeMenu();
                  openProjectDialog({
                    mode: "create",
                    parentId: project.id,
                  });
                }}
                className={menuItemClass}
              >
                <Icon name="plus" className="size-3.5 text-muted" />
                <span>New sub-project</span>
              </button>

              <button
                type="button"
                onClick={async () => {
                  closeMenu();
                  const url = buildTodoProjectUrl(
                    project.id,
                    null,
                    window.location.origin
                  );
                  try {
                    await navigator.clipboard.writeText(url);
                    onFlashLabel?.("Copied project link");
                  } catch {
                    onFlashLabel?.("Copy failed");
                  }
                }}
                className={menuItemClass}
              >
                <Icon name="link" className="size-3.5 text-muted" />
                <span>Copy project link</span>
              </button>

              <hr className="my-1 border-border" />

              <button
                type="button"
                onClick={() => {
                  closeMenu();
                  moveProjectToTrash(project.id);
                  router.push(
                    project.parentId
                      ? `/todos/project/${encodeURIComponent(project.parentId)}`
                      : "/todos"
                  );
                }}
                className={menuItemClass.replace(
                  "text-foreground",
                  "text-danger"
                )}
              >
                <Icon name="trash" className="size-3.5" />
                <span>Move to trash</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
