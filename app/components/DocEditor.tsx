"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Icon } from "../assets/icons";
import type { BlockColor, DatabaseViewType } from "../lib/database-types";
import { useDocs } from "../lib/docs-store";
import {
  type BlockType,
  blockToText,
  createId,
  type DocBlock,
  htmlToPlainText,
  resolveCoverBackground,
  type TodoEmbedConfig,
} from "../lib/docs-utils";
import {
  findBlockInTree,
  findBlockSyncTemplate,
  findSyncGroupOccurrences,
  formatSyncClipboardToken,
  isBlockInsideSyncedColumns,
} from "../lib/synced-blocks";
import { useTodos } from "../lib/todos-store";
import {
  type ParsedTodoEmbedLink,
  projectDisplayName,
} from "../lib/todos-utils";
import { useDismissible } from "../lib/use-dismissible";
import { IconPickerPopover } from "./IconPickerPopover";
import { PagePropertiesPanel } from "./PagePropertiesPanel";
import { BlockActionMenu, type BlockMenuView } from "./editor/BlockActionMenu";
import { EditableBlock } from "./editor/EditableBlock";
import { LinkBlockDialog } from "./editor/LinkBlockDialog";
import { CoverPickerPopover, PageCoverBanner } from "./editor/PageCoverHeader";
import { SlashCommandMenu } from "./editor/SlashCommandMenu";
import { SyncedBlockWrapper } from "./editor/SyncedBlockWrapper";
import {
  cloneBlockWithFreshIds,
  findBlockParentList,
  isImeConfirming,
  mapBlocksTree,
  mutateBlockListTree,
  placeCaretAtEnd,
} from "./editor/block-tree";
import { SLASH_COMMANDS } from "./editor/editor-constants";

/** Notion-style block WYSIWYG document editor with covers, properties, inline databases, and columns. */
/** Returns the horizontal width utility class for page prose vs full-width blocks. */
function getProseWidthClass(fullWidth?: boolean): string {
  return fullWidth ? "w-full" : "mx-auto w-full max-w-4xl";
}

export function DocEditor() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const {
    docs,
    trashedDocs,
    getDoc,
    getDatabase,
    createDoc,
    createDatabase,
    updateDoc,
    restoreDocs,
    hydrated,
    syncedClipboardId,
    ensureBlockSynced,
    copyBlockAsSynced,
    insertSyncedBlock,
    unsyncBlock,
  } = useDocs();
  const { getAnyProject, sections: todoSections } = useTodos();

  const doc = getDoc(id);

  const titleRef = useRef<HTMLTextAreaElement>(null);
  const iconContainerRef = useRef<HTMLDivElement>(null);
  const iconBtnRef = useRef<HTMLButtonElement>(null);
  const addCoverBtnRef = useRef<HTMLButtonElement>(null);
  const changeCoverBtnRef = useRef<HTMLButtonElement>(null);
  const coverPickerRef = useRef<HTMLDivElement>(null);
  const blockMenuRef = useRef<HTMLDivElement>(null);
  const blockRefs = useRef<Map<string, HTMLElement>>(new Map());
  const handleRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const pendingFocusIdRef = useRef<string | null>(null);

  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [coverPickerOpen, setCoverPickerOpen] = useState(false);
  const [blockMenu, setBlockMenu] = useState<{
    blockId: string;
    view: BlockMenuView;
  } | null>(null);
  const [draggedBlockId, setDraggedBlockId] = useState<string | null>(null);
  const [dragOverBlockId, setDragOverBlockId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [syncTokens, setSyncTokens] = useState<Record<string, number>>({});
  const [linkPickerAnchorBlockId, setLinkPickerAnchorBlockId] = useState<
    string | null
  >(null);
  const [slashState, setSlashState] = useState<{
    blockId: string;
    query: string;
    selectedIndex: number;
  } | null>(null);

  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [doc?.id, doc?.title, doc?.fullWidth]);

  const announce = useCallback((message: string) => {
    setAnnouncement("");
    requestAnimationFrame(() => setAnnouncement(message));
  }, []);

  useDismissible(iconPickerOpen, [iconContainerRef], (reason) => {
    setIconPickerOpen(false);
    if (reason === "escape") {
      iconBtnRef.current?.focus();
    }
  });

  useDismissible(
    coverPickerOpen,
    [coverPickerRef, addCoverBtnRef, changeCoverBtnRef],
    () => {
      setCoverPickerOpen(false);
    }
  );

  // Manage block menu focus, outside click, Escape, and arrow navigation
  useEffect(() => {
    if (!blockMenu) return;

    const menuEl = blockMenuRef.current;
    if (menuEl) {
      requestAnimationFrame(() => {
        menuEl
          .querySelector<HTMLButtonElement>('[role="menuitem"]')
          ?.focus({ preventScroll: true });
      });
    }

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        blockMenuRef.current?.contains(target) ||
        handleRefs.current.get(blockMenu.blockId)?.contains(target)
      ) {
        return;
      }
      setBlockMenu(null);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (blockMenu.view !== "main") {
          setBlockMenu({ blockId: blockMenu.blockId, view: "main" });
        } else {
          const handleEl = handleRefs.current.get(blockMenu.blockId);
          setBlockMenu(null);
          handleEl?.focus();
        }
        return;
      }

      if (
        ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) &&
        blockMenuRef.current
      ) {
        const items = Array.from(
          blockMenuRef.current.querySelectorAll<HTMLButtonElement>(
            '[role="menuitem"]'
          )
        );
        if (items.length === 0) return;
        const current = items.indexOf(
          document.activeElement as HTMLButtonElement
        );
        const next =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? items.length - 1
              : (current + (event.key === "ArrowUp" ? -1 : 1) + items.length) %
                items.length;
        event.preventDefault();
        items[next]?.focus({ preventScroll: true });
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [blockMenu]);

  const registerRef = useCallback((blockId: string, el: HTMLElement | null) => {
    if (el) {
      blockRefs.current.set(blockId, el);
      if (pendingFocusIdRef.current === blockId) {
        pendingFocusIdRef.current = null;
        requestAnimationFrame(() => placeCaretAtEnd(el));
      }
    } else {
      blockRefs.current.delete(blockId);
    }
  }, []);

  const registerHandleRef = useCallback(
    (blockId: string, el: HTMLButtonElement | null) => {
      if (el) {
        handleRefs.current.set(blockId, el);
      } else {
        handleRefs.current.delete(blockId);
      }
    },
    []
  );

  const bumpSync = useCallback((blockId: string) => {
    setSyncTokens((prev) => ({
      ...prev,
      [blockId]: (prev[blockId] ?? 0) + 1,
    }));
  }, []);

  const focusBlock = useCallback((blockId: string) => {
    const el = blockRefs.current.get(blockId);
    if (el) {
      placeCaretAtEnd(el);
    } else {
      pendingFocusIdRef.current = blockId;
    }
  }, []);

  const availableSlashOptions = useMemo(() => {
    if (syncedClipboardId && findBlockSyncTemplate(docs, syncedClipboardId)) {
      return [
        {
          id: "paste-synced",
          label: "Paste synced block",
          hint: "Insert copied synced block",
          keywords: "paste sync synced block link",
          type: "paragraph" as const,
        },
        ...SLASH_COMMANDS,
      ];
    }
    return SLASH_COMMANDS;
  }, [docs, syncedClipboardId]);

  const filteredSlashOptions = useMemo(() => {
    if (!slashState) return [];
    const q = slashState.query.trim().toLowerCase();
    if (!q) return availableSlashOptions;
    return availableSlashOptions.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        opt.keywords.toLowerCase().includes(q)
    );
  }, [availableSlashOptions, slashState]);

  const numberedIndices = useMemo(() => {
    const map = new Map<string, number>();
    if (!doc) return map;
    const countList = (list: DocBlock[]) => {
      let count = 0;
      for (const block of list) {
        if (block.type === "numbered") {
          count += 1;
          map.set(block.id, count);
        } else {
          count = 0;
        }
        if (block.type === "columns" && Array.isArray(block.columns)) {
          for (const col of block.columns) {
            countList(col);
          }
        }
      }
    };
    countList(doc.blocks);
    return map;
  }, [doc]);

  const handleChangeContent = useCallback(
    (blockId: string, content: string) => {
      if (!doc) return;
      updateDoc(doc.id, {
        blocks: mapBlocksTree(doc.blocks, (b) =>
          b.id === blockId ? { ...b, content } : b
        ),
      });
    },
    [doc, updateDoc]
  );

  const handleUpdateBookmark = useCallback(
    (blockId: string, url: string, label: string) => {
      if (!doc) return;
      updateDoc(doc.id, {
        blocks: mapBlocksTree(doc.blocks, (b) =>
          b.id === blockId ? { ...b, url, content: label || url } : b
        ),
      });
    },
    [doc, updateDoc]
  );

  const handleUpdateTodoEmbed = useCallback(
    (blockId: string, todoEmbed: TodoEmbedConfig, label?: string) => {
      if (!doc) return;
      updateDoc(doc.id, {
        blocks: mapBlocksTree(doc.blocks, (b) =>
          b.id === blockId
            ? {
                ...b,
                todoEmbed,
                ...(label !== undefined ? { content: label } : {}),
              }
            : b
        ),
      });
    },
    [doc, updateDoc]
  );

  const handleIndentBlock = useCallback(
    (blockId: string, delta: 1 | -1) => {
      if (!doc) return;
      updateDoc(doc.id, {
        blocks: mapBlocksTree(doc.blocks, (b) => {
          if (b.id !== blockId) return b;
          const next = Math.max(0, Math.min(3, (b.indent ?? 0) + delta));
          return { ...b, indent: next > 0 ? next : undefined };
        }),
      });
    },
    [doc, updateDoc]
  );

  const handleChangeBlockColor = useCallback(
    (blockId: string, color: BlockColor) => {
      if (!doc) return;
      updateDoc(doc.id, {
        blocks: mapBlocksTree(doc.blocks, (b) =>
          b.id === blockId
            ? { ...b, color: color === "default" ? undefined : color }
            : b
        ),
      });
      setBlockMenu(null);
    },
    [doc, updateDoc]
  );

  const handleExecuteSlashOrConvert = useCallback(
    (
      blockId: string,
      type: BlockType,
      nextContent?: string,
      dbViewType?: DatabaseViewType,
      commandId?: string
    ) => {
      if (!doc) return;

      if (commandId === "synced-block") {
        if (isBlockInsideSyncedColumns(doc.blocks, blockId)) {
          setSlashState(null);
          return;
        }
        const updatedBlocks = mapBlocksTree(doc.blocks, (b) =>
          b.id === blockId
            ? {
                ...b,
                type: b.type === "code" ? "paragraph" : b.type,
                content: "",
                syncGroupId: b.syncGroupId ?? createId(),
              }
            : b
        );
        updateDoc(doc.id, { blocks: updatedBlocks });
        bumpSync(blockId);
        setSlashState(null);
        setBlockMenu(null);
        requestAnimationFrame(() => focusBlock(blockId));
        return;
      }

      if (commandId === "link-synced") {
        const updatedBlocks = mapBlocksTree(doc.blocks, (b) =>
          b.id === blockId && !b.syncGroupId
            ? { ...b, type: "paragraph", content: "" }
            : b
        );
        updateDoc(doc.id, { blocks: updatedBlocks });
        bumpSync(blockId);
        setSlashState(null);
        setBlockMenu(null);
        setLinkPickerAnchorBlockId(blockId);
        return;
      }

      if (commandId === "paste-synced") {
        if (syncedClipboardId) {
          const currentBlock = findBlockInTree(doc.blocks, blockId);
          const replaceHere =
            currentBlock &&
            currentBlock.type === "paragraph" &&
            !currentBlock.syncGroupId &&
            htmlToPlainText(currentBlock.content).trim().startsWith("/");
          if (replaceHere) {
            updateDoc(doc.id, {
              blocks: mapBlocksTree(doc.blocks, (b) =>
                b.id === blockId ? { ...b, content: "" } : b
              ),
            });
            insertSyncedBlock(
              doc.id,
              blockId,
              syncedClipboardId,
              "replace-if-empty"
            );
          } else {
            insertSyncedBlock(doc.id, blockId, syncedClipboardId, "after");
          }
          announce("Pasted synced block");
        }
        setSlashState(null);
        setBlockMenu(null);
        return;
      }

      if (type === "database") {
        const db = createDatabase(doc.id, dbViewType ?? "table");
        const updatedBlocks = mapBlocksTree(doc.blocks, (b) =>
          b.id === blockId
            ? {
                id: b.id,
                type: "database",
                databaseId: db.id,
                content: db.title,
                ...(b.syncGroupId ? { syncGroupId: b.syncGroupId } : {}),
              }
            : b
        );
        updateDoc(doc.id, { blocks: updatedBlocks });
        setSlashState(null);
        setBlockMenu(null);
        return;
      }

      if (type === "page-link") {
        const child = createDoc(doc.id);
        const updatedBlocks = mapBlocksTree(doc.blocks, (b) =>
          b.id === blockId
            ? {
                id: b.id,
                type: "page-link",
                linkedDocId: child.id,
                content: "Untitled",
                ...(b.syncGroupId ? { syncGroupId: b.syncGroupId } : {}),
              }
            : b
        );
        updateDoc(doc.id, { blocks: updatedBlocks });
        setSlashState(null);
        setBlockMenu(null);
        return;
      }

      if (type === "columns") {
        const leftId = createId();
        const rightId = createId();
        const updatedBlocks = mapBlocksTree(doc.blocks, (b) =>
          b.id === blockId
            ? {
                id: b.id,
                type: "columns",
                content: "",
                ...(b.syncGroupId ? { syncGroupId: b.syncGroupId } : {}),
                columns: [
                  [{ id: leftId, type: "paragraph", content: "" }],
                  [{ id: rightId, type: "paragraph", content: "" }],
                ],
              }
            : b
        );
        updateDoc(doc.id, { blocks: updatedBlocks });
        setSlashState(null);
        setBlockMenu(null);
        requestAnimationFrame(() => focusBlock(leftId));
        return;
      }

      if (type === "bookmark") {
        const updatedBlocks = mapBlocksTree(doc.blocks, (b) =>
          b.id === blockId
            ? {
                id: b.id,
                type: "bookmark",
                content: "",
                url: undefined,
                ...(b.syncGroupId ? { syncGroupId: b.syncGroupId } : {}),
              }
            : b
        );
        updateDoc(doc.id, { blocks: updatedBlocks });
        setSlashState(null);
        setBlockMenu(null);
        return;
      }

      if (type === "todo-embed") {
        const updatedBlocks = mapBlocksTree(doc.blocks, (b) =>
          b.id === blockId
            ? {
                id: b.id,
                type: "todo-embed",
                content: "",
                ...(b.syncGroupId ? { syncGroupId: b.syncGroupId } : {}),
              }
            : b
        );
        updateDoc(doc.id, { blocks: updatedBlocks });
        setSlashState(null);
        setBlockMenu(null);
        return;
      }

      let focusTargetId = blockId;
      const updatedBlocks = mutateBlockListTree(
        doc.blocks,
        blockId,
        (list, idx) => {
          const b = list[idx];
          const preservedContent =
            nextContent !== undefined
              ? nextContent
              : type === "divider"
                ? ""
                : type === "code"
                  ? htmlToPlainText(b.content)
                  : b.content;

          const converted: DocBlock = {
            ...b,
            type,
            content: preservedContent,
            ...(type === "todo"
              ? { checked: Boolean(b.checked) }
              : { checked: undefined }),
          };

          const copy = [...list];
          copy[idx] = converted;
          if (type === "divider") {
            const nextBlock: DocBlock = {
              id: createId(),
              type: "paragraph",
              content: "",
            };
            copy.splice(idx + 1, 0, nextBlock);
            focusTargetId = nextBlock.id;
          }
          return copy;
        }
      );

      updateDoc(doc.id, { blocks: updatedBlocks });
      bumpSync(blockId);
      setSlashState(null);
      setBlockMenu(null);
      requestAnimationFrame(() => focusBlock(focusTargetId));
    },
    [
      announce,
      bumpSync,
      createDatabase,
      createDoc,
      doc,
      focusBlock,
      insertSyncedBlock,
      syncedClipboardId,
      updateDoc,
    ]
  );

  const handleInsertRelative = useCallback(
    (
      blockId: string,
      position: "before" | "after",
      type: BlockType = "paragraph"
    ) => {
      if (!doc) return;
      const newBlock: DocBlock = {
        id: createId(),
        type,
        content: "",
        ...(type === "todo" ? { checked: false } : {}),
      };
      const nextBlocks = mutateBlockListTree(
        doc.blocks,
        blockId,
        (list, idx) => {
          const copy = [...list];
          copy.splice(position === "before" ? idx : idx + 1, 0, newBlock);
          return copy;
        }
      );
      updateDoc(doc.id, { blocks: nextBlocks });
      pendingFocusIdRef.current = newBlock.id;
      setBlockMenu(null);
    },
    [doc, updateDoc]
  );

  const handleInsertAfter = useCallback(
    (blockId: string, type: BlockType = "paragraph") => {
      handleInsertRelative(blockId, "after", type);
    },
    [handleInsertRelative]
  );

  const handleDuplicateBlock = useCallback(
    (blockId: string) => {
      if (!doc) return;
      let cloneId = "";
      const nextBlocks = mutateBlockListTree(
        doc.blocks,
        blockId,
        (list, idx) => {
          const clone = cloneBlockWithFreshIds(list[idx]);
          cloneId = clone.id;
          const copy = [...list];
          copy.splice(idx + 1, 0, clone);
          return copy;
        }
      );
      updateDoc(doc.id, { blocks: nextBlocks });
      if (cloneId) pendingFocusIdRef.current = cloneId;
      setBlockMenu(null);
    },
    [doc, updateDoc]
  );

  const handleCopyBlock = useCallback(
    async (block: DocBlock) => {
      try {
        await navigator.clipboard.writeText(blockToText(block));
        announce("Copied block");
      } catch {
        announce("Copy failed");
      }
      setBlockMenu(null);
    },
    [announce]
  );

  const handleCopyAndSync = useCallback(
    async (blockId: string) => {
      if (!doc) return;
      const groupId = copyBlockAsSynced(doc.id, blockId);
      setBlockMenu(null);
      if (!groupId) return;
      try {
        await navigator.clipboard.writeText(formatSyncClipboardToken(groupId));
      } catch {
        // Clipboard write may be blocked outside active user gestures; internal syncedClipboardId handles in-app paste.
      }
      announce("Copied and synced block");
    },
    [announce, copyBlockAsSynced, doc]
  );

  const handlePasteSynced = useCallback(
    (
      anchorBlockId: string,
      syncGroupId: string,
      mode: "replace-if-empty" | "after" = "after"
    ) => {
      if (!doc) return;
      const created = insertSyncedBlock(doc.id, anchorBlockId, syncGroupId, mode);
      setBlockMenu(null);
      setSlashState(null);
      if (created) {
        announce("Pasted synced block");
        if (
          created.type !== "divider" &&
          created.type !== "database" &&
          created.type !== "todo-embed" &&
          created.type !== "columns"
        ) {
          pendingFocusIdRef.current = created.id;
        }
      }
    },
    [announce, doc, insertSyncedBlock]
  );

  const handlePasteTodoEmbed = useCallback(
    (anchorBlockId: string, parsed: ParsedTodoEmbedLink): boolean => {
      if (!doc) return false;
      const project = getAnyProject(parsed.projectId);
      if (!project) return false;

      const section = parsed.sectionId
        ? todoSections.find(
            (s) => s.id === parsed.sectionId && s.projectId === project.id
          )
        : undefined;
      const projectName = projectDisplayName(project);
      const label = section ? `${projectName} / ${section.name}` : projectName;

      const embedBlock: DocBlock = {
        id: createId(),
        type: "todo-embed",
        content: label,
        todoEmbed: {
          projectId: project.id,
          ...(parsed.sectionId ? { sectionId: parsed.sectionId } : {}),
          range: "all",
          layout: "list",
        },
      };

      let trailingId: string | null = null;
      const nextBlocks = mutateBlockListTree(
        doc.blocks,
        anchorBlockId,
        (list, idx) => {
          const anchor = list[idx];
          const replaceHere =
            anchor.type === "paragraph" &&
            !htmlToPlainText(anchor.content).trim() &&
            !anchor.syncGroupId;
          const copy = [...list];
          let embedIdx: number;
          if (replaceHere) {
            copy[idx] = embedBlock;
            embedIdx = idx;
          } else {
            copy.splice(idx + 1, 0, embedBlock);
            embedIdx = idx + 1;
          }
          if (embedIdx === copy.length - 1) {
            const trailing: DocBlock = {
              id: createId(),
              type: "paragraph",
              content: "",
            };
            trailingId = trailing.id;
            copy.push(trailing);
          }
          return copy;
        }
      );

      updateDoc(doc.id, { blocks: nextBlocks });
      setSlashState(null);
      setBlockMenu(null);
      if (trailingId) pendingFocusIdRef.current = trailingId;
      announce(
        section
          ? `Embedded section "${section.name}"`
          : `Embedded project "${projectName}"`
      );
      return true;
    },
    [announce, doc, getAnyProject, todoSections, updateDoc]
  );

  const handleUnsync = useCallback(
    (blockId: string, unsyncAll = false) => {
      if (!doc) return;
      unsyncBlock(doc.id, blockId, unsyncAll);
      setBlockMenu(null);
      announce(unsyncAll ? "Unsynced all copies" : "Unsynced block");
    },
    [announce, doc, unsyncBlock]
  );

  const handleDeleteBlock = useCallback(
    (blockId: string, allowResetLast = false) => {
      if (!doc) return;
      const parentList = findBlockParentList(doc.blocks, blockId);
      if (!parentList) return;

      if (parentList.length <= 1) {
        if (!allowResetLast) return;
        const resetId = parentList[0]?.id ?? createId();
        const nextBlocks = mapBlocksTree(doc.blocks, (b) =>
          b.id === blockId ? { id: resetId, type: "paragraph", content: "" } : b
        );
        updateDoc(doc.id, { blocks: nextBlocks });
        bumpSync(resetId);
        setBlockMenu(null);
        requestAnimationFrame(() => focusBlock(resetId));
        return;
      }

      let fallbackId: string | undefined;
      const nextBlocks = mutateBlockListTree(
        doc.blocks,
        blockId,
        (list, idx) => {
          const filtered = list.filter((b) => b.id !== blockId);
          fallbackId = filtered[Math.max(0, idx - 1)]?.id;
          return filtered;
        }
      );
      updateDoc(doc.id, { blocks: nextBlocks });
      setBlockMenu(null);
      if (fallbackId) {
        requestAnimationFrame(() => focusBlock(fallbackId as string));
      }
    },
    [bumpSync, doc, focusBlock, updateDoc]
  );

  const handleMoveBlock = useCallback(
    (blockId: string, direction: -1 | 1) => {
      if (!doc) return;
      const nextBlocks = mutateBlockListTree(
        doc.blocks,
        blockId,
        (list, idx) => {
          const target = idx + direction;
          if (target < 0 || target >= list.length) return list;
          const copy = [...list];
          const [moved] = copy.splice(idx, 1);
          copy.splice(target, 0, moved);
          return copy;
        }
      );
      updateDoc(doc.id, { blocks: nextBlocks });
      setBlockMenu(null);
      requestAnimationFrame(() => focusBlock(blockId));
    },
    [doc, focusBlock, updateDoc]
  );

  const handleNavigateBlock = useCallback(
    (blockId: string, direction: -1 | 1) => {
      if (!doc) return;
      const parentList = findBlockParentList(doc.blocks, blockId);
      if (!parentList) return;
      const idx = parentList.findIndex((b) => b.id === blockId);
      if (idx === -1) return;
      let cursor = idx + direction;
      while (cursor >= 0 && cursor < parentList.length) {
        const candidate = parentList[cursor];
        if (
          candidate.type !== "divider" &&
          candidate.type !== "database" &&
          candidate.type !== "todo-embed" &&
          candidate.type !== "columns"
        ) {
          focusBlock(candidate.id);
          return;
        }
        cursor += direction;
      }
    },
    [doc, focusBlock]
  );

  const handleToggleTodo = useCallback(
    (blockId: string) => {
      if (!doc) return;
      updateDoc(doc.id, {
        blocks: mapBlocksTree(doc.blocks, (b) =>
          b.id === blockId && b.type === "todo"
            ? { ...b, checked: !b.checked }
            : b
        ),
      });
    },
    [doc, updateDoc]
  );

  const handleToggleMenu = useCallback((blockId: string) => {
    setSlashState(null);
    setBlockMenu((prev) =>
      prev?.blockId === blockId ? null : { blockId, view: "main" }
    );
  }, []);

  const handleDragStartBlock = useCallback(
    (blockId: string, event: React.DragEvent) => {
      setBlockMenu(null);
      setDraggedBlockId(blockId);
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", blockId);
    },
    []
  );

  const handleDragOverBlock = useCallback(
    (blockId: string, event: React.DragEvent) => {
      if (!draggedBlockId || draggedBlockId === blockId) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      setDragOverBlockId(blockId);
    },
    [draggedBlockId]
  );

  const handleDropOnBlock = useCallback(
    (targetBlockId: string, event: React.DragEvent) => {
      event.preventDefault();
      if (!doc || !draggedBlockId || draggedBlockId === targetBlockId) {
        setDraggedBlockId(null);
        setDragOverBlockId(null);
        return;
      }
      const fromIdx = doc.blocks.findIndex((b) => b.id === draggedBlockId);
      const toIdx = doc.blocks.findIndex((b) => b.id === targetBlockId);
      if (fromIdx !== -1 && toIdx !== -1) {
        const nextBlocks = [...doc.blocks];
        const [moved] = nextBlocks.splice(fromIdx, 1);
        nextBlocks.splice(toIdx, 0, moved);
        updateDoc(doc.id, { blocks: nextBlocks });
      }
      setDraggedBlockId(null);
      setDragOverBlockId(null);
    },
    [doc, draggedBlockId, updateDoc]
  );

  const handleDragEndBlock = useCallback(() => {
    setDraggedBlockId(null);
    setDragOverBlockId(null);
  }, []);

  const handleSlashQuery = useCallback(
    (blockId: string | null, query: string) => {
      if (!blockId) {
        setSlashState(null);
        return;
      }
      setBlockMenu(null);
      setSlashState({
        blockId,
        query,
        selectedIndex: 0,
      });
    },
    []
  );

  const handleSlashKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (!slashState) return;
      if (event.key === "Escape") {
        event.preventDefault();
        setSlashState(null);
        return;
      }
      if (filteredSlashOptions.length === 0) return;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSlashState((prev) =>
          prev
            ? {
                ...prev,
                selectedIndex:
                  (prev.selectedIndex + 1) % filteredSlashOptions.length,
              }
            : null
        );
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setSlashState((prev) =>
          prev
            ? {
                ...prev,
                selectedIndex:
                  (prev.selectedIndex - 1 + filteredSlashOptions.length) %
                  filteredSlashOptions.length,
              }
            : null
        );
      } else if (event.key === "Enter") {
        event.preventDefault();
        const chosen =
          filteredSlashOptions[slashState.selectedIndex] ??
          filteredSlashOptions[0];
        if (chosen) {
          handleExecuteSlashOrConvert(
            slashState.blockId,
            chosen.type,
            "",
            chosen.dbViewType,
            chosen.id
          );
        }
      }
    },
    [filteredSlashOptions, handleExecuteSlashOrConvert, slashState]
  );

  if (!hydrated && !doc) {
    return <div className="min-h-full" aria-busy="true" />;
  }

  if (!doc) {
    const trashedDoc = trashedDocs.find((entry) => entry.id === id);
    if (trashedDoc) {
      return (
        <div className="mx-auto mt-10 flex max-w-xl flex-col items-start gap-4 rounded-xl border border-border bg-surface p-6">
          <div className="flex items-center gap-2 text-muted">
            <Icon name="trash" className="size-4" />
            <span className="text-xs font-medium tracking-wider uppercase">
              In Trash
            </span>
          </div>
          <h1 className="text-xl font-semibold text-foreground">
            This page is in Trash
          </h1>
          <p className="text-sm text-muted">
            &ldquo;{trashedDoc.title.trim() || "Untitled"}&rdquo; was moved to
            Trash. Restore it to continue editing, or manage trashed items in
            Settings.
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => restoreDocs([trashedDoc.id])}
              className="primary inline-flex h-9 items-center gap-1.5 rounded-md px-3.5 text-sm font-medium"
            >
              <Icon name="restore" className="size-4" />
              <span>Restore page</span>
            </button>
            <Link
              href="/docs"
              className="secondary inline-flex h-9 items-center rounded-md px-3 text-sm font-medium"
            >
              Back to Docs
            </Link>
          </div>
        </div>
      );
    }

    return (
      <div className="mx-auto mt-10 flex max-w-xl flex-col items-start gap-4 rounded-xl border border-border bg-surface p-6">
        <h1 className="text-xl font-semibold">Document not found</h1>
        <p className="text-sm text-muted">
          This document may have been deleted or does not exist in your local
          workspace.
        </p>
        <div className="flex items-center gap-3">
          <Link
            href="/docs"
            className="secondary inline-flex h-9 items-center rounded-md px-3 text-sm font-medium"
          >
            Back to Docs
          </Link>
          <button
            type="button"
            onClick={() => {
              const created = createDoc();
              router.push(`/docs/${created.id}`);
            }}
            className="primary inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium"
          >
            <Icon name="plus" className="size-4" />
            New document
          </button>
        </div>
      </div>
    );
  }

  const coverBg = resolveCoverBackground(doc.cover);

  const hasSyncedClipboard = Boolean(
    syncedClipboardId && findBlockSyncTemplate(docs, syncedClipboardId)
  );

  const renderBlockItem = (
    block: DocBlock,
    index: number,
    siblingCount: number,
    nestedInColumn: boolean
  ) => {
    const isSlashOwner = slashState?.blockId === block.id;
    const isMenuOwner = blockMenu?.blockId === block.id;
    const isFullWidthEmbed =
      (block.type === "database" &&
        Boolean(block.databaseId && getDatabase(block.databaseId)?.fullWidth)) ||
      (block.type === "todo-embed" && Boolean(block.todoEmbed?.fullWidth));
    const syncOccurrenceCount = block.syncGroupId
      ? findSyncGroupOccurrences(docs, block.syncGroupId).length
      : 0;
    const canSync = !isBlockInsideSyncedColumns(doc.blocks, block.id);

    const editableNode = (
      <EditableBlock
        block={block}
        syncToken={syncTokens[block.id] ?? 0}
        numberedIndex={numberedIndices.get(block.id)}
        slashActive={isSlashOwner}
        isMenuOpen={isMenuOwner}
        isDropTarget={dragOverBlockId === block.id}
        onRegisterRef={registerRef}
        onRegisterHandleRef={registerHandleRef}
        onToggleMenu={handleToggleMenu}
        onDragStartBlock={handleDragStartBlock}
        onDragOverBlock={handleDragOverBlock}
        onDropOnBlock={handleDropOnBlock}
        onDragEndBlock={handleDragEndBlock}
        onChangeContent={handleChangeContent}
        onUpdateBookmark={handleUpdateBookmark}
        onUpdateTodoEmbed={handleUpdateTodoEmbed}
        onConvertBlock={handleExecuteSlashOrConvert}
        onIndentBlock={handleIndentBlock}
        onToggleTodo={handleToggleTodo}
        onInsertAfter={handleInsertAfter}
        onDeleteBlock={(targetId) => handleDeleteBlock(targetId, false)}
        onNavigateBlock={handleNavigateBlock}
        onSlashQuery={handleSlashQuery}
        onSlashKeyDown={handleSlashKeyDown}
        onNavigateInternal={(href) => router.push(href)}
        onPasteSyncedBlock={(anchorId, syncId) =>
          handlePasteSynced(anchorId, syncId, "replace-if-empty")
        }
        onPasteTodoEmbed={handlePasteTodoEmbed}
        canDelete={siblingCount > 1}
        nestedInColumn={nestedInColumn}
      />
    );

    return (
      <div
        key={block.id}
        className={`relative ${
          nestedInColumn
            ? ""
            : isFullWidthEmbed
              ? "w-full"
              : getProseWidthClass(doc?.fullWidth)
        }`}
      >
        {block.syncGroupId ? (
          <SyncedBlockWrapper
            syncGroupId={block.syncGroupId}
            currentDocId={doc.id}
            onCopyAndSync={() => void handleCopyAndSync(block.id)}
            onUnsync={() => handleUnsync(block.id, false)}
            onUnsyncAll={() => handleUnsync(block.id, true)}
          >
            {editableNode}
          </SyncedBlockWrapper>
        ) : (
          editableNode
        )}

        {isMenuOwner && (
          <BlockActionMenu
            block={block}
            menuView={blockMenu.view}
            menuRef={blockMenuRef}
            getAnchorEl={() => handleRefs.current.get(block.id) ?? null}
            index={index}
            siblingCount={siblingCount}
            isSynced={Boolean(block.syncGroupId)}
            syncOccurrenceCount={syncOccurrenceCount}
            canSync={canSync}
            hasSyncedClipboard={hasSyncedClipboard}
            onChangeView={(view) => setBlockMenu({ blockId: block.id, view })}
            onTurnInto={(targetId, type, content) =>
              handleExecuteSlashOrConvert(targetId, type, content)
            }
            onChangeColor={handleChangeBlockColor}
            onDuplicate={handleDuplicateBlock}
            onCopy={(b) => void handleCopyBlock(b)}
            onCopyAndSync={(targetId) => void handleCopyAndSync(targetId)}
            onPasteSynced={(targetId) => {
              if (syncedClipboardId) {
                handlePasteSynced(targetId, syncedClipboardId, "after");
              }
            }}
            onUnsync={handleUnsync}
            onInsertRelative={(targetId, position) =>
              handleInsertRelative(targetId, position, "paragraph")
            }
            onMove={handleMoveBlock}
            onDelete={(targetId) => handleDeleteBlock(targetId, true)}
          />
        )}

        {isSlashOwner && filteredSlashOptions.length > 0 && (
          <SlashCommandMenu
            options={filteredSlashOptions}
            selectedIndex={slashState.selectedIndex}
            onSelect={(opt) =>
              handleExecuteSlashOrConvert(
                block.id,
                opt.type,
                "",
                opt.dbViewType,
                opt.id
              )
            }
          />
        )}
      </div>
    );
  };

  return (
    <div className="min-h-full">
      {coverBg && (
        <PageCoverBanner
          coverBg={coverBg}
          changeBtnRef={changeCoverBtnRef}
          onTogglePicker={() => setCoverPickerOpen((prev) => !prev)}
          onRemove={() => {
            updateDoc(doc.id, { cover: undefined });
            setCoverPickerOpen(false);
          }}
        />
      )}

      {/* Main Content Wrapper */}
      <div
        className={`mx-auto w-full px-6 pb-24 sm:px-12 ${
          coverBg ? "" : "pt-8 sm:pt-14"
        }`}
      >
        <div className={getProseWidthClass(doc.fullWidth)}>
        {/* Page Header Controls: Icon Picker + Cover Picker */}
        <div className="group/header relative">
          <div className="flex flex-wrap items-center gap-2">
            <div ref={iconContainerRef} className="relative">
              {doc.icon ? (
                <button
                  ref={iconBtnRef}
                  type="button"
                  aria-label="Change page icon"
                  aria-expanded={iconPickerOpen}
                  onClick={() => setIconPickerOpen((prev) => !prev)}
                  className={`relative z-10 mb-2 inline-flex size-16 items-center justify-center rounded-xl text-5xl leading-none transition-colors hover:bg-secondary/80 focus-visible:outline-2 focus-visible:outline-primary ${
                    coverBg ? "-mt-8 bg-canvas/85 shadow-sm backdrop-blur" : ""
                  }`}
                >
                  {doc.icon}
                </button>
              ) : (
                <button
                  ref={iconBtnRef}
                  type="button"
                  aria-expanded={iconPickerOpen}
                  onClick={() => setIconPickerOpen((prev) => !prev)}
                  className={`mb-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary ${
                    coverBg ? "mt-4" : ""
                  }`}
                >
                  <Icon name="smile" className="size-3.5" />
                  <span>Add icon</span>
                </button>
              )}

              {iconPickerOpen && (
                <IconPickerPopover
                  selectedIcon={doc.icon}
                  label="Choose page icon"
                  onSelect={(emoji) => {
                    updateDoc(doc.id, { icon: emoji });
                    setIconPickerOpen(false);
                  }}
                />
              )}
            </div>

            {!coverBg && (
              <button
                ref={addCoverBtnRef}
                type="button"
                aria-expanded={coverPickerOpen}
                onClick={() => setCoverPickerOpen((prev) => !prev)}
                className="mb-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
              >
                <Icon name="image" className="size-3.5" />
                <span>Add cover</span>
              </button>
            )}
          </div>

          {coverPickerOpen && (
            <CoverPickerPopover
              coverPickerRef={coverPickerRef}
              currentCover={doc.cover}
              onSelectCover={(cover) => {
                updateDoc(doc.id, { cover });
                setCoverPickerOpen(false);
              }}
            />
          )}
        </div>

        {/* Document Title */}
        <div className="mb-4">
          <textarea
            ref={titleRef}
            rows={1}
            aria-label="Document title"
            placeholder="Untitled"
            value={doc.title}
            onChange={(e) => updateDoc(doc.id, { title: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (isImeConfirming(e)) return;
                e.preventDefault();
                const firstEditable = doc.blocks.find(
                  (b) =>
                    b.type !== "divider" &&
                    b.type !== "database" &&
                    b.type !== "todo-embed" &&
                    b.type !== "columns"
                );
                if (firstEditable) {
                  focusBlock(firstEditable.id);
                }
              }
            }}
            className="w-full resize-none overflow-hidden bg-transparent text-3xl leading-tight font-bold tracking-tight text-foreground placeholder:text-muted/50 focus:outline-none sm:text-4xl"
          />
        </div>

        {/* Editable Database Row Properties Panel */}
        <PagePropertiesPanel doc={doc} />
        </div>

        {/* Block List */}
        <div className="space-y-1">
          {doc.blocks.map((block, index) => {
            if (block.type === "columns" && Array.isArray(block.columns)) {
              const colCount = block.columns.length;
              const colClass =
                colCount >= 3
                  ? "grid-cols-1 md:grid-cols-3"
                  : "grid-cols-1 md:grid-cols-2";
              const isColumnsMenuOpen = blockMenu?.blockId === block.id;
              const columnsSyncCount = block.syncGroupId
                ? findSyncGroupOccurrences(docs, block.syncGroupId).length
                : 0;
              const columnsGrid = (
                <div className={`grid gap-6 ${colClass}`}>
                  {block.columns.map((colBlocks, colIdx) => (
                    <div key={`${block.id}-col-${colIdx}`} className="space-y-1">
                      {colBlocks.map((colBlock, itemIdx) =>
                        renderBlockItem(
                          colBlock,
                          itemIdx,
                          colBlocks.length,
                          true
                        )
                      )}
                    </div>
                  ))}
                </div>
              );

              return (
                <div
                  key={block.id}
                  onDragOver={(e) => handleDragOverBlock(block.id, e)}
                  onDrop={(e) => handleDropOnBlock(block.id, e)}
                  className={`group relative my-3 ${getProseWidthClass(doc.fullWidth)} ${
                    dragOverBlockId === block.id
                      ? "border-t-2 border-primary"
                      : ""
                  }`}
                >
                  <button
                    ref={(el) => registerHandleRef(block.id, el)}
                    type="button"
                    draggable
                    aria-label="Columns block actions"
                    aria-haspopup="menu"
                    aria-expanded={isColumnsMenuOpen}
                    onClick={() => handleToggleMenu(block.id)}
                    onDragStart={(e) => handleDragStartBlock(block.id, e)}
                    onDragEnd={handleDragEndBlock}
                    style={
                      isColumnsMenuOpen
                        ? ({
                            anchorName: "--active-block-handle",
                          } as CSSProperties)
                        : undefined
                    }
                    className={`mt-0.5 inline-flex size-6 shrink-0 cursor-grab items-center justify-center rounded text-muted transition-opacity hover:bg-secondary hover:text-foreground focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-primary active:cursor-grabbing sm:mt-0 sm:absolute sm:-start-8 sm:top-1 ${
                      isColumnsMenuOpen
                        ? "bg-secondary text-foreground opacity-100"
                        : "sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100"
                    }`}
                  >
                    <Icon name="grip" className="size-4" />
                  </button>

                  {isColumnsMenuOpen && blockMenu && (
                    <BlockActionMenu
                      block={block}
                      menuView={blockMenu.view}
                      menuRef={blockMenuRef}
                      getAnchorEl={() =>
                        handleRefs.current.get(block.id) ?? null
                      }
                      index={index}
                      siblingCount={doc.blocks.length}
                      isColumnsBlock
                      isSynced={Boolean(block.syncGroupId)}
                      syncOccurrenceCount={columnsSyncCount}
                      hasSyncedClipboard={hasSyncedClipboard}
                      onChangeView={(view) =>
                        setBlockMenu({ blockId: block.id, view })
                      }
                      onTurnInto={(targetId, type, content) =>
                        handleExecuteSlashOrConvert(targetId, type, content)
                      }
                      onChangeColor={handleChangeBlockColor}
                      onDuplicate={handleDuplicateBlock}
                      onCopy={(b) => void handleCopyBlock(b)}
                      onCopyAndSync={(targetId) =>
                        void handleCopyAndSync(targetId)
                      }
                      onPasteSynced={(targetId) => {
                        if (syncedClipboardId) {
                          handlePasteSynced(
                            targetId,
                            syncedClipboardId,
                            "after"
                          );
                        }
                      }}
                      onUnsync={handleUnsync}
                      onInsertRelative={(targetId, position) =>
                        handleInsertRelative(targetId, position, "paragraph")
                      }
                      onMove={handleMoveBlock}
                      onDelete={(targetId) => handleDeleteBlock(targetId, true)}
                    />
                  )}

                  {block.syncGroupId ? (
                    <SyncedBlockWrapper
                      syncGroupId={block.syncGroupId}
                      currentDocId={doc.id}
                      onCopyAndSync={() => void handleCopyAndSync(block.id)}
                      onUnsync={() => handleUnsync(block.id, false)}
                      onUnsyncAll={() => handleUnsync(block.id, true)}
                    >
                      {columnsGrid}
                    </SyncedBlockWrapper>
                  ) : (
                    columnsGrid
                  )}
                </div>
              );
            }

            return renderBlockItem(block, index, doc.blocks.length, false);
          })}
        </div>

        {/* Notion-style bottom click area to append/focus a trailing block */}
        <div
          onClick={() => {
            const last = doc.blocks[doc.blocks.length - 1];
            if (last && last.type === "paragraph" && !last.content.trim()) {
              focusBlock(last.id);
            } else if (last) {
              handleInsertAfter(last.id, "paragraph");
            }
          }}
          className={`min-h-40 cursor-text ${getProseWidthClass(doc.fullWidth)}`}
        />

        <LinkBlockDialog
          open={Boolean(linkPickerAnchorBlockId)}
          currentDocId={doc.id}
          onClose={() => setLinkPickerAnchorBlockId(null)}
          onSelectBlock={(sourceDocId, sourceBlockId) => {
            if (!linkPickerAnchorBlockId) return;
            const sourceDoc = getDoc(sourceDocId);
            const sourceBlock = sourceDoc
              ? findBlockInTree(sourceDoc.blocks, sourceBlockId)
              : null;
            if (!sourceBlock) return;
            const syncGroupId = ensureBlockSynced(sourceDocId, sourceBlockId);
            if (!syncGroupId) return;
            const created = insertSyncedBlock(
              doc.id,
              linkPickerAnchorBlockId,
              syncGroupId,
              "replace-if-empty",
              sourceBlock
            );
            setLinkPickerAnchorBlockId(null);
            if (created) {
              announce("Linked synced block");
              if (
                created.type !== "divider" &&
                created.type !== "database" &&
                created.type !== "todo-embed" &&
                created.type !== "columns"
              ) {
                pendingFocusIdRef.current = created.id;
              }
            }
          }}
        />

        <span role="status" aria-live="polite" className="sr-only">
          {announcement}
        </span>
      </div>
    </div>
  );
}
