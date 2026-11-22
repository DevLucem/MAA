import type { InlineDatabase, PropertyValue } from "./database-types";
import {
  type BlockType,
  createId,
  type Doc,
  type DocBlock,
  isDocDescendant,
  isSafeHref,
  type MoveDocTarget,
  resolveCoverBackground,
  sanitizeInlineHtml,
  type TodoEmbedConfig,
  type TodoEmbedLayout,
  type TodoEmbedRange,
} from "./docs-utils";

export const STORAGE_KEY = "maa-docs-v1";
export const DATABASES_STORAGE_KEY = "maa-databases-v1";

const VALID_BLOCK_TYPES = new Set<BlockType>([
  "paragraph",
  "h1",
  "h2",
  "h3",
  "bullet",
  "numbered",
  "todo",
  "quote",
  "callout",
  "code",
  "divider",
  "database",
  "page-link",
  "columns",
  "bookmark",
  "todo-embed",
]);

const VALID_TODO_EMBED_RANGES = new Set<TodoEmbedRange>([
  "all",
  "day",
  "week",
  "month",
]);
const VALID_TODO_EMBED_LAYOUTS = new Set<TodoEmbedLayout>(["list", "board"]);

function normalizeTodoEmbed(raw: unknown): TodoEmbedConfig | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const obj = raw as Record<string, unknown>;
  const projectId =
    typeof obj.projectId === "string" && obj.projectId.trim()
      ? obj.projectId.trim()
      : "";
  if (!projectId) return undefined;

  const cfg: TodoEmbedConfig = { projectId };
  if (typeof obj.sectionId === "string" && obj.sectionId.trim()) {
    cfg.sectionId = obj.sectionId.trim();
  }
  if (VALID_TODO_EMBED_RANGES.has(obj.range as TodoEmbedRange)) {
    cfg.range = obj.range as TodoEmbedRange;
  }
  if (VALID_TODO_EMBED_LAYOUTS.has(obj.layout as TodoEmbedLayout)) {
    cfg.layout = obj.layout as TodoEmbedLayout;
  }
  if (obj.fullWidth === true) {
    cfg.fullWidth = true;
  }
  return cfg;
}

export function normalizeBlock(raw: unknown): DocBlock | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  const type = VALID_BLOCK_TYPES.has(b.type as BlockType)
    ? (b.type as BlockType)
    : "paragraph";
  const content =
    typeof b.content === "string"
      ? type === "code"
        ? b.content
        : sanitizeInlineHtml(b.content)
      : "";

  const normalized: DocBlock = {
    id: typeof b.id === "string" && b.id ? b.id : createId(),
    type,
    content,
  };

  if (type === "todo") {
    normalized.checked = Boolean(b.checked);
  }
  if (typeof b.indent === "number" && b.indent > 0) {
    normalized.indent = Math.min(3, Math.floor(b.indent));
  }
  if (typeof b.color === "string" && b.color) {
    normalized.color = b.color as DocBlock["color"];
  }
  if (typeof b.calloutIcon === "string" && b.calloutIcon) {
    normalized.calloutIcon = b.calloutIcon;
  }
  if (typeof b.databaseId === "string" && b.databaseId) {
    normalized.databaseId = b.databaseId;
  }
  if (typeof b.linkedDocId === "string" && b.linkedDocId) {
    normalized.linkedDocId = b.linkedDocId;
  }
  if (typeof b.url === "string" && isSafeHref(b.url)) {
    normalized.url = b.url.trim();
  }
  if (typeof b.syncGroupId === "string" && b.syncGroupId) {
    normalized.syncGroupId = b.syncGroupId;
  }
  if (type === "todo-embed") {
    const todoEmbed = normalizeTodoEmbed(b.todoEmbed);
    if (todoEmbed) {
      normalized.todoEmbed = todoEmbed;
    }
  }
  if (type === "columns" && Array.isArray(b.columns)) {
    normalized.columns = b.columns.map((col) =>
      Array.isArray(col)
        ? col
            .map(normalizeBlock)
            .filter((entry): entry is DocBlock => entry !== null)
        : []
    );
  }

  return normalized;
}

export function normalizeProperties(
  raw: unknown
): Record<string, PropertyValue> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const result: Record<string, PropertyValue> = {};
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    if (
      val === null ||
      typeof val === "string" ||
      typeof val === "number" ||
      typeof val === "boolean"
    ) {
      result[key] = val;
    } else if (
      Array.isArray(val) &&
      val.every((item) => typeof item === "string")
    ) {
      result[key] = val;
    } else if (
      val &&
      typeof val === "object" &&
      "start" in val &&
      typeof (val as { start: unknown }).start === "string"
    ) {
      const dateObj = val as { start: string; end?: unknown };
      result[key] = {
        start: dateObj.start,
        ...(typeof dateObj.end === "string" && dateObj.end
          ? { end: dateObj.end }
          : {}),
      };
    }
  }
  return result;
}

export function normalizeDoc(raw: unknown): Doc | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  if (typeof item.id !== "string" || !item.id) return null;

  const rawBlocks = Array.isArray(item.blocks) ? item.blocks : [];
  const blocks = rawBlocks
    .map(normalizeBlock)
    .filter((b): b is DocBlock => b !== null);

  const normalizedProps = normalizeProperties(item.properties);
  const coverStr =
    typeof item.cover === "string" && resolveCoverBackground(item.cover)
      ? item.cover
      : undefined;

  return {
    id: item.id,
    title: typeof item.title === "string" ? item.title : "",
    blocks:
      blocks.length > 0
        ? blocks
        : [{ id: createId(), type: "paragraph", content: "" }],
    createdAt:
      typeof item.createdAt === "string"
        ? item.createdAt
        : "2026-11-21T09:00:00.000Z",
    updatedAt:
      typeof item.updatedAt === "string"
        ? item.updatedAt
        : "2026-11-21T09:00:00.000Z",
    ...(typeof item.parentId === "string" && item.parentId
      ? { parentId: item.parentId }
      : {}),
    ...(typeof item.databaseId === "string" && item.databaseId
      ? { databaseId: item.databaseId }
      : {}),
    ...(normalizedProps ? { properties: normalizedProps } : {}),
    ...(item.favorite ? { favorite: true } : {}),
    ...(typeof item.icon === "string" && item.icon ? { icon: item.icon } : {}),
    ...(coverStr ? { cover: coverStr } : {}),
    ...(item.fullWidth ? { fullWidth: true } : {}),
    ...(typeof item.trashedAt === "string" && item.trashedAt
      ? { trashedAt: item.trashedAt }
      : {}),
  };
}

export function normalizeDatabase(raw: unknown): InlineDatabase | null {
  if (!raw || typeof raw !== "object") return null;
  const db = raw as Record<string, unknown>;
  if (
    typeof db.id !== "string" ||
    !db.id ||
    typeof db.parentDocId !== "string" ||
    !Array.isArray(db.properties) ||
    !Array.isArray(db.views)
  ) {
    return null;
  }
  return {
    id: db.id,
    title: typeof db.title === "string" ? db.title : "Database",
    ...(typeof db.icon === "string" && db.icon ? { icon: db.icon } : {}),
    ...(typeof db.description === "string" && db.description
      ? { description: db.description }
      : {}),
    ...(typeof db.locked === "boolean" ? { locked: db.locked } : {}),
    ...(db.fullWidth === true ? { fullWidth: true } : {}),
    ...(typeof db.trashedAt === "string" && db.trashedAt
      ? { trashedAt: db.trashedAt }
      : {}),
    parentDocId: db.parentDocId,
    titlePropertyId:
      typeof db.titlePropertyId === "string" && db.titlePropertyId
        ? db.titlePropertyId
        : "Name",
    properties: db.properties as InlineDatabase["properties"],
    views: db.views as InlineDatabase["views"],
  };
}

export function saveDocs(next: Doc[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore quota or storage restriction errors
  }
}

export function saveDatabases(next: InlineDatabase[]) {
  try {
    localStorage.setItem(DATABASES_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore quota or storage restriction errors
  }
}

export function collectDeletedTree(
  docs: Doc[],
  databases: InlineDatabase[],
  rootDocId: string
): { deletedDocIds: Set<string>; deletedDbIds: Set<string> } {
  const deletedDocIds = new Set<string>([rootDocId]);
  const deletedDbIds = new Set<string>();

  let changed = true;
  while (changed) {
    changed = false;
    for (const db of databases) {
      if (deletedDocIds.has(db.parentDocId) && !deletedDbIds.has(db.id)) {
        deletedDbIds.add(db.id);
        changed = true;
      }
    }
    for (const doc of docs) {
      if (deletedDocIds.has(doc.id)) continue;
      const hitParent = doc.parentId && deletedDocIds.has(doc.parentId);
      const hitDb = doc.databaseId && deletedDbIds.has(doc.databaseId);
      if (hitParent || hitDb) {
        deletedDocIds.add(doc.id);
        changed = true;
      }
    }
  }

  return { deletedDocIds, deletedDbIds };
}

export function applyMoveDoc(
  prev: Doc[],
  docId: string,
  target: MoveDocTarget
): { next: Doc[]; changed: boolean } {
  const sourceIndex = prev.findIndex((doc) => doc.id === docId);
  if (sourceIndex === -1) return { next: prev, changed: false };
  const sourceDoc = prev[sourceIndex];

  const remaining = prev.filter((doc) => doc.id !== docId);
  let nextParentId: string | undefined;
  let insertAt: number;

  if (target.type === "doc") {
    if (isDocDescendant(prev, target.targetId, docId)) {
      return { next: prev, changed: false };
    }
    const targetDoc = prev.find((doc) => doc.id === target.targetId);
    if (!targetDoc) return { next: prev, changed: false };

    nextParentId =
      target.placement === "inside" ? targetDoc.id : targetDoc.parentId;
    const targetIdx = remaining.findIndex((doc) => doc.id === target.targetId);
    if (targetIdx === -1) return { next: prev, changed: false };
    insertAt = target.placement === "before" ? targetIdx : targetIdx + 1;
  } else {
    nextParentId = undefined;
    insertAt = target.position === "start" ? 0 : remaining.length;
  }

  const { parentId: _prevParent, ...rest } = sourceDoc;
  void _prevParent;
  const movedDoc: Doc = nextParentId
    ? { ...rest, parentId: nextParentId }
    : rest;

  const next = [...remaining];
  next.splice(insertAt, 0, movedDoc);

  const changed =
    next.length !== prev.length ||
    next.some(
      (doc, idx) =>
        doc.id !== prev[idx].id || doc.parentId !== prev[idx].parentId
    );

  return changed ? { next, changed: true } : { next: prev, changed: false };
}

export function toggleTodoInBlockList(
  blocks: DocBlock[],
  blockId: string
): DocBlock[] {
  return blocks.map((block) => {
    if (block.id === blockId && block.type === "todo") {
      return { ...block, checked: !block.checked };
    }
    if (block.type === "columns" && Array.isArray(block.columns)) {
      return {
        ...block,
        columns: block.columns.map((col) =>
          toggleTodoInBlockList(col, blockId)
        ),
      };
    }
    return block;
  });
}

export function duplicateBlocksWithFreshIds(blocks: DocBlock[]): DocBlock[] {
  return blocks.map((block) => {
    const nextBlock: DocBlock = {
      ...block,
      id: createId(),
      ...(block.todoEmbed ? { todoEmbed: { ...block.todoEmbed } } : {}),
    };
    delete nextBlock.syncGroupId;
    if (block.columns) {
      nextBlock.columns = block.columns.map(duplicateBlocksWithFreshIds);
    }
    return nextBlock;
  });
}
