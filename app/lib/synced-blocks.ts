import type { InlineDatabase, PropertyValue } from "./database-types";
import {
  collectDeletedTree,
  duplicateBlocksWithFreshIds,
} from "./docs-storage";
import {
  type BlockType,
  createId,
  type Doc,
  type DocBlock,
  htmlToPlainText,
} from "./docs-utils";

export const SYNC_CLIPBOARD_PREFIX = "maa-sync://";

export interface SyncedBlockOccurrence {
  docId: string;
  docTitle: string;
  docIcon?: string;
  blockId: string;
  block: DocBlock;
}

export interface LinkableBlockItem {
  docId: string;
  docTitle: string;
  docIcon?: string;
  blockId: string;
  blockType: BlockType;
  preview: string;
  syncGroupId?: string;
}

export function formatSyncClipboardToken(syncGroupId: string): string {
  return `${SYNC_CLIPBOARD_PREFIX}${syncGroupId}`;
}

export function parseSyncClipboardToken(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith(SYNC_CLIPBOARD_PREFIX)) return null;
  const id = trimmed.slice(SYNC_CLIPBOARD_PREFIX.length);
  if (!id || /\s/.test(id)) return null;
  return id;
}

/** Finds a block by ID anywhere in a block tree, including nested column layouts. */
export function findBlockInTree(
  blocks: DocBlock[],
  blockId: string
): DocBlock | null {
  for (const block of blocks) {
    if (block.id === blockId) return block;
    if (block.type === "columns" && Array.isArray(block.columns)) {
      for (const col of block.columns) {
        const found = findBlockInTree(col, blockId);
        if (found) return found;
      }
    }
  }
  return null;
}

/** Returns true if `blockId` is a child nested inside a column block that is already synced. */
export function isBlockInsideSyncedColumns(
  blocks: DocBlock[],
  blockId: string
): boolean {
  for (const block of blocks) {
    if (block.id === blockId) return false;
    if (block.type === "columns" && Array.isArray(block.columns)) {
      for (const col of block.columns) {
        if (block.syncGroupId && findBlockInTree(col, blockId)) {
          return true;
        }
        if (isBlockInsideSyncedColumns(col, blockId)) {
          return true;
        }
      }
    }
  }
  return false;
}

function collectOccurrencesInBlocks(
  doc: Doc,
  blocks: DocBlock[],
  syncGroupId: string,
  out: SyncedBlockOccurrence[]
) {
  for (const block of blocks) {
    if (block.syncGroupId === syncGroupId) {
      out.push({
        docId: doc.id,
        docTitle: doc.title.trim() || "Untitled",
        docIcon: doc.icon,
        blockId: block.id,
        block,
      });
    }
    if (block.type === "columns" && Array.isArray(block.columns)) {
      for (const col of block.columns) {
        collectOccurrencesInBlocks(doc, col, syncGroupId, out);
      }
    }
  }
}

/** Lists every block instance across all documents belonging to `syncGroupId`. */
export function findSyncGroupOccurrences(
  docs: Doc[],
  syncGroupId: string
): SyncedBlockOccurrence[] {
  const occurrences: SyncedBlockOccurrence[] = [];
  for (const doc of docs) {
    collectOccurrencesInBlocks(doc, doc.blocks, syncGroupId, occurrences);
  }
  return occurrences;
}

function findTemplateInBlocks(
  blocks: DocBlock[],
  syncGroupId: string
): DocBlock | null {
  for (const block of blocks) {
    if (block.syncGroupId === syncGroupId) return block;
    if (block.type === "columns" && Array.isArray(block.columns)) {
      for (const col of block.columns) {
        const found = findTemplateInBlocks(col, syncGroupId);
        if (found) return found;
      }
    }
  }
  return null;
}

/** Finds the canonical live template block for a sync group across the workspace. */
export function findBlockSyncTemplate(
  docs: Doc[],
  syncGroupId: string
): DocBlock | null {
  for (const doc of docs) {
    const found = findTemplateInBlocks(doc.blocks, syncGroupId);
    if (found) return found;
  }
  return null;
}

function cloneColumnChildrenWithFreshIds(blocks: DocBlock[]): DocBlock[] {
  return blocks.map((block) => {
    const next: DocBlock = {
      type: block.type,
      content: block.content,
      id: createId(),
      ...(block.type === "todo" ? { checked: Boolean(block.checked) } : {}),
      ...(block.indent ? { indent: block.indent } : {}),
      ...(block.color ? { color: block.color } : {}),
      ...(block.calloutIcon ? { calloutIcon: block.calloutIcon } : {}),
      ...(block.databaseId ? { databaseId: block.databaseId } : {}),
      ...(block.linkedDocId ? { linkedDocId: block.linkedDocId } : {}),
      ...(block.url ? { url: block.url } : {}),
    };
    if (block.type === "columns" && Array.isArray(block.columns)) {
      next.columns = block.columns.map(cloneColumnChildrenWithFreshIds);
    }
    return next;
  });
}

/** Builds a new synced block instance from `template` with fresh block IDs and `syncGroupId`. */
export function createSyncedBlockInstance(
  template: DocBlock,
  syncGroupId: string
): DocBlock {
  const instance: DocBlock = {
    id: createId(),
    type: template.type,
    content: template.content,
    syncGroupId,
    ...(template.type === "todo" ? { checked: Boolean(template.checked) } : {}),
    ...(template.indent ? { indent: template.indent } : {}),
    ...(template.color ? { color: template.color } : {}),
    ...(template.calloutIcon ? { calloutIcon: template.calloutIcon } : {}),
    ...(template.databaseId ? { databaseId: template.databaseId } : {}),
    ...(template.linkedDocId ? { linkedDocId: template.linkedDocId } : {}),
    ...(template.url ? { url: template.url } : {}),
  };

  if (template.type === "columns" && Array.isArray(template.columns)) {
    instance.columns = template.columns.map(cloneColumnChildrenWithFreshIds);
  }

  return instance;
}

/** Compares two blocks' synced payload fields while ignoring `id` and `syncGroupId`. */
export function areSyncedPayloadsEqual(a: DocBlock, b: DocBlock): boolean {
  if (
    a.type !== b.type ||
    a.content !== b.content ||
    Boolean(a.checked) !== Boolean(b.checked) ||
    (a.indent ?? 0) !== (b.indent ?? 0) ||
    (a.color ?? "") !== (b.color ?? "") ||
    (a.calloutIcon ?? "") !== (b.calloutIcon ?? "") ||
    (a.databaseId ?? "") !== (b.databaseId ?? "") ||
    (a.linkedDocId ?? "") !== (b.linkedDocId ?? "") ||
    (a.url ?? "") !== (b.url ?? "")
  ) {
    return false;
  }

  const colsA = a.columns ?? [];
  const colsB = b.columns ?? [];
  if (colsA.length !== colsB.length) return false;
  for (let i = 0; i < colsA.length; i += 1) {
    const colA = colsA[i];
    const colB = colsB[i];
    if (colA.length !== colB.length) return false;
    for (let j = 0; j < colA.length; j += 1) {
      if (!areSyncedPayloadsEqual(colA[j], colB[j])) {
        return false;
      }
    }
  }
  return true;
}

function applyColumnChildPayload(
  targetCol: DocBlock[] | undefined,
  templateCol: DocBlock[]
): DocBlock[] {
  return templateCol.map((tplItem, itemIdx) => {
    const existing = targetCol?.[itemIdx];
    const synced: DocBlock = {
      id: existing?.id ?? createId(),
      type: tplItem.type,
      content: tplItem.content,
      ...(tplItem.type === "todo"
        ? { checked: Boolean(tplItem.checked) }
        : {}),
      ...(tplItem.indent ? { indent: tplItem.indent } : {}),
      ...(tplItem.color ? { color: tplItem.color } : {}),
      ...(tplItem.calloutIcon ? { calloutIcon: tplItem.calloutIcon } : {}),
      ...(tplItem.databaseId ? { databaseId: tplItem.databaseId } : {}),
      ...(tplItem.linkedDocId ? { linkedDocId: tplItem.linkedDocId } : {}),
      ...(tplItem.url ? { url: tplItem.url } : {}),
    };
    if (tplItem.type === "columns" && Array.isArray(tplItem.columns)) {
      synced.columns = tplItem.columns.map((nestedCol, nestedIdx) =>
        applyColumnChildPayload(existing?.columns?.[nestedIdx], nestedCol)
      );
    }
    return synced;
  });
}

/** Replaces a target synced block's payload with `template` while preserving its own ID and syncGroupId. */
export function applySyncedPayload(
  target: DocBlock,
  template: DocBlock
): DocBlock {
  const updated: DocBlock = {
    id: target.id,
    type: template.type,
    content: template.content,
    ...(target.syncGroupId ? { syncGroupId: target.syncGroupId } : {}),
    ...(template.type === "todo"
      ? { checked: Boolean(template.checked) }
      : {}),
    ...(template.indent ? { indent: template.indent } : {}),
    ...(template.color ? { color: template.color } : {}),
    ...(template.calloutIcon ? { calloutIcon: template.calloutIcon } : {}),
    ...(template.databaseId ? { databaseId: template.databaseId } : {}),
    ...(template.linkedDocId ? { linkedDocId: template.linkedDocId } : {}),
    ...(template.url ? { url: template.url } : {}),
  };

  if (template.type === "columns" && Array.isArray(template.columns)) {
    updated.columns = template.columns.map((tplCol, colIdx) =>
      applyColumnChildPayload(target.columns?.[colIdx], tplCol)
    );
  }

  return updated;
}

function indexBlocksById(blocks: DocBlock[], map: Map<string, DocBlock>) {
  for (const block of blocks) {
    map.set(block.id, block);
    if (block.type === "columns" && Array.isArray(block.columns)) {
      for (const col of block.columns) {
        indexBlocksById(col, map);
      }
    }
  }
}

interface SyncChangeEntry {
  sourceBlockId: string;
  template: DocBlock;
}

function collectChangedSyncGroups(
  blocks: DocBlock[],
  prevById: Map<string, DocBlock>,
  out: Map<string, SyncChangeEntry>
) {
  for (const nb of blocks) {
    if (nb.syncGroupId) {
      const pb = prevById.get(nb.id);
      if (pb && pb.syncGroupId === nb.syncGroupId && !areSyncedPayloadsEqual(pb, nb)) {
        out.set(nb.syncGroupId, { sourceBlockId: nb.id, template: nb });
      }
    }
    if (nb.type === "columns" && Array.isArray(nb.columns)) {
      for (const col of nb.columns) {
        collectChangedSyncGroups(col, prevById, out);
      }
    }
  }
}

function propagateInBlockList(
  blocks: DocBlock[],
  docId: string,
  editedDocId: string,
  changedGroups: Map<string, SyncChangeEntry>
): { blocks: DocBlock[]; changed: boolean } {
  let listChanged = false;
  const nextBlocks = blocks.map((block) => {
    if (block.syncGroupId) {
      const change = changedGroups.get(block.syncGroupId);
      if (
        change &&
        (docId !== editedDocId || block.id !== change.sourceBlockId)
      ) {
        listChanged = true;
        return applySyncedPayload(block, change.template);
      }
    }
    if (block.type === "columns" && Array.isArray(block.columns)) {
      let colsChanged = false;
      const nextCols = block.columns.map((col) => {
        const res = propagateInBlockList(col, docId, editedDocId, changedGroups);
        if (res.changed) colsChanged = true;
        return res.blocks;
      });
      if (colsChanged) {
        listChanged = true;
        return { ...block, columns: nextCols };
      }
    }
    return block;
  });

  return { blocks: listChanged ? nextBlocks : blocks, changed: listChanged };
}

/** Propagates edits made to any synced block in `editedDocId` to every linked instance across `nextDocs`. */
export function propagateSyncedBlocks(
  prevDocs: Doc[],
  nextDocs: Doc[],
  editedDocId: string,
  now: string
): Doc[] {
  const prevEdited = prevDocs.find((d) => d.id === editedDocId);
  const nextEdited = nextDocs.find((d) => d.id === editedDocId);
  if (!prevEdited || !nextEdited) return nextDocs;

  const prevById = new Map<string, DocBlock>();
  indexBlocksById(prevEdited.blocks, prevById);

  const changedGroups = new Map<string, SyncChangeEntry>();
  collectChangedSyncGroups(nextEdited.blocks, prevById, changedGroups);
  if (changedGroups.size === 0) return nextDocs;

  let anyDocChanged = false;
  const syncedDocs = nextDocs.map((doc) => {
    const res = propagateInBlockList(doc.blocks, doc.id, editedDocId, changedGroups);
    if (!res.changed) return doc;
    anyDocChanged = true;
    return {
      ...doc,
      blocks: res.blocks,
      updatedAt: now,
    };
  });

  return anyDocChanged ? syncedDocs : nextDocs;
}

function findDatabaseRefInBlocks(
  blocks: DocBlock[],
  databaseId: string,
  excludeBlockId?: string
): boolean {
  for (const block of blocks) {
    if (
      block.type === "database" &&
      block.databaseId === databaseId &&
      block.id !== excludeBlockId
    ) {
      return true;
    }
    if (block.type === "columns" && Array.isArray(block.columns)) {
      for (const col of block.columns) {
        if (findDatabaseRefInBlocks(col, databaseId, excludeBlockId)) {
          return true;
        }
      }
    }
  }
  return false;
}

/** Collects every inline database ID referenced in a block tree, including columns. */
export function collectDatabaseIdsFromBlocks(
  blocks: DocBlock[],
  out = new Set<string>()
): Set<string> {
  for (const block of blocks) {
    if (block.type === "database" && block.databaseId) {
      out.add(block.databaseId);
    }
    if (block.type === "columns" && Array.isArray(block.columns)) {
      for (const col of block.columns) {
        collectDatabaseIdsFromBlocks(col, out);
      }
    }
  }
  return out;
}

/** Collects every inline database ID referenced anywhere across `docs`. */
export function collectAllDatabaseIdsInDocs(docs: Doc[]): Set<string> {
  const ids = new Set<string>();
  for (const doc of docs) {
    collectDatabaseIdsFromBlocks(doc.blocks, ids);
  }
  return ids;
}

/**
 * Deletes unreferenced candidate databases along with their row docs and subtrees,
 * or re-homes surviving synced databases when still referenced on another page.
 */
export function pruneUnreferencedDatabases(
  docs: Doc[],
  databases: InlineDatabase[],
  candidateDbIds: Iterable<string>,
  previousOwnerDocId?: string
): { docs: Doc[]; databases: InlineDatabase[]; changed: boolean } {
  const candidates = Array.from(new Set(candidateDbIds));
  if (candidates.length === 0) {
    return { docs, databases, changed: false };
  }

  const dbMap = new Map(databases.map((db) => [db.id, db]));
  const rawDeletedDocIds = new Set<string>();
  const rawDeletedDbIds = new Set<string>();
  const directRehomeDbMap = new Map<string, string>();
  const emptyDocSet = new Set<string>();

  for (const dbId of candidates) {
    const db = dbMap.get(dbId);
    if (!db) continue;

    const survivingDocId = isDatabaseReferencedOutside(docs, dbId, emptyDocSet);
    if (survivingDocId) {
      if (
        previousOwnerDocId &&
        db.parentDocId === previousOwnerDocId &&
        survivingDocId !== previousOwnerDocId
      ) {
        directRehomeDbMap.set(dbId, survivingDocId);
      }
      continue;
    }

    rawDeletedDbIds.add(dbId);
    for (const doc of docs) {
      if (doc.databaseId !== dbId || rawDeletedDocIds.has(doc.id)) continue;
      const tree = collectDeletedTree(docs, databases, doc.id);
      for (const dId of tree.deletedDocIds) rawDeletedDocIds.add(dId);
      for (const nestedDbId of tree.deletedDbIds) rawDeletedDbIds.add(nestedDbId);
    }
  }

  // Re-home any nested databases inside deleted row subpages if still referenced elsewhere.
  const finalRehomeDbMap = new Map(directRehomeDbMap);
  const finalDeletedDbIds = new Set<string>();
  for (const dbId of rawDeletedDbIds) {
    const survivingDocId = isDatabaseReferencedOutside(
      docs,
      dbId,
      rawDeletedDocIds
    );
    if (survivingDocId) {
      finalRehomeDbMap.set(dbId, survivingDocId);
    } else {
      finalDeletedDbIds.add(dbId);
    }
  }

  const finalDeletedDocIds = new Set<string>();
  for (const doc of docs) {
    if (!rawDeletedDocIds.has(doc.id)) continue;
    if (doc.databaseId && finalRehomeDbMap.has(doc.databaseId)) continue;
    finalDeletedDocIds.add(doc.id);
  }

  if (
    finalDeletedDbIds.size === 0 &&
    finalDeletedDocIds.size === 0 &&
    finalRehomeDbMap.size === 0
  ) {
    return { docs, databases, changed: false };
  }

  const nextDocs = docs
    .filter((doc) => !finalDeletedDocIds.has(doc.id))
    .map((doc) => {
      if (doc.databaseId && finalRehomeDbMap.has(doc.databaseId)) {
        return { ...doc, parentId: finalRehomeDbMap.get(doc.databaseId) };
      }
      return doc;
    });

  const nextDatabases = databases
    .filter((db) => !finalDeletedDbIds.has(db.id))
    .map((db) =>
      finalRehomeDbMap.has(db.id)
        ? { ...db, parentDocId: finalRehomeDbMap.get(db.id)! }
        : db
    );

  return {
    docs: nextDocs,
    databases: nextDatabases,
    changed: true,
  };
}

/** Finds a surviving doc ID outside `excludeDocIds` referencing `databaseId` (ignoring `excludeBlockId`). */
export function isDatabaseReferencedOutside(
  docs: Doc[],
  databaseId: string,
  excludeDocIds: ReadonlySet<string>,
  excludeBlockId?: string
): string | null {
  for (const doc of docs) {
    if (excludeDocIds.has(doc.id)) continue;
    if (findDatabaseRefInBlocks(doc.blocks, databaseId, excludeBlockId)) {
      return doc.id;
    }
  }
  return null;
}

/** Clones an InlineDatabase and its rows so an unsynced database block owns independent copies. */
export function cloneDatabaseForUnsync(
  sourceDb: InlineDatabase,
  sourceRows: Doc[],
  targetDocId: string
): { clonedDb: InlineDatabase; clonedRows: Doc[] } {
  const newDbId = createId();
  const now = new Date().toISOString();

  const clonedDb: InlineDatabase = {
    ...sourceDb,
    id: newDbId,
    parentDocId: targetDocId,
    properties: sourceDb.properties.map((prop) => ({
      ...prop,
      ...(prop.options
        ? { options: prop.options.map((opt) => ({ ...opt })) }
        : {}),
    })),
    views: sourceDb.views.map((view) => ({
      ...view,
      visiblePropertyIds: [...view.visiblePropertyIds],
      ...(view.filters
        ? {
            filters: view.filters.map((f) => ({
              ...f,
              ...(f.values ? { values: [...f.values] } : {}),
            })),
          }
        : {}),
      ...(view.sorts
        ? { sorts: view.sorts.map((s) => ({ ...s })) }
        : {}),
    })),
  };

  const clonedRows: Doc[] = sourceRows.map((row) => {
    const clonedProps: Record<string, PropertyValue> | undefined = row.properties
      ? Object.fromEntries(
          Object.entries(row.properties).map(([key, val]) => {
            if (Array.isArray(val)) return [key, [...val]];
            if (val && typeof val === "object") return [key, { ...val }];
            return [key, val];
          })
        )
      : undefined;

    return {
      ...row,
      id: createId(),
      parentId: targetDocId,
      databaseId: newDbId,
      blocks: duplicateBlocksWithFreshIds(row.blocks),
      createdAt: now,
      updatedAt: now,
      ...(clonedProps ? { properties: clonedProps } : {}),
    };
  });

  return { clonedDb, clonedRows };
}

function summarizeBlockPreview(
  block: DocBlock,
  docsById: Map<string, Doc>,
  dbsById: Map<string, InlineDatabase>
): string {
  switch (block.type) {
    case "database": {
      const dbTitle = block.databaseId
        ? dbsById.get(block.databaseId)?.title.trim()
        : "";
      return `${dbTitle || htmlToPlainText(block.content).trim() || "Inline database"} (Database)`;
    }
    case "page-link": {
      const linked = block.linkedDocId ? docsById.get(block.linkedDocId) : undefined;
      return `${linked?.title.trim() || htmlToPlainText(block.content).trim() || "Sub-page"} (Page link)`;
    }
    case "bookmark": {
      const label = htmlToPlainText(block.content).trim() || block.url || "Bookmark";
      return block.url && label !== block.url ? `${label} (${block.url})` : label;
    }
    case "divider":
      return "Divider";
    case "columns": {
      const innerTexts = (block.columns ?? [])
        .flat()
        .map((inner) => htmlToPlainText(inner.content).trim())
        .filter(Boolean);
      return innerTexts.length > 0
        ? `Columns: ${innerTexts.slice(0, 2).join(" / ")}`
        : "Columns layout";
    }
    default: {
      const plain = htmlToPlainText(block.content).replace(/\s+/g, " ").trim();
      return plain.slice(0, 120);
    }
  }
}

function collectLinkableFromBlockList(
  doc: Doc,
  blocks: DocBlock[],
  docsById: Map<string, Doc>,
  dbsById: Map<string, InlineDatabase>,
  out: LinkableBlockItem[]
) {
  for (const block of blocks) {
    const preview = summarizeBlockPreview(block, docsById, dbsById);
    const isEmptyPlainParagraph =
      block.type === "paragraph" && !preview && !block.syncGroupId;

    if (!isEmptyPlainParagraph) {
      out.push({
        docId: doc.id,
        docTitle: doc.title.trim() || "Untitled",
        docIcon: doc.icon,
        blockId: block.id,
        blockType: block.type,
        preview: preview || `(${block.type})`,
        ...(block.syncGroupId ? { syncGroupId: block.syncGroupId } : {}),
      });
    }

    // Blocks inside an already-synced columns container sync as one unit.
    if (block.type === "columns" && Array.isArray(block.columns) && !block.syncGroupId) {
      for (const col of block.columns) {
        collectLinkableFromBlockList(doc, col, docsById, dbsById, out);
      }
    }
  }
}

/** Collects linkable blocks across all pages for the Link existing block picker. */
export function collectLinkableBlocks(
  docs: Doc[],
  databases: InlineDatabase[]
): LinkableBlockItem[] {
  const docsById = new Map(docs.map((doc) => [doc.id, doc]));
  const dbsById = new Map(databases.map((db) => [db.id, db]));
  const items: LinkableBlockItem[] = [];

  for (const doc of docs) {
    collectLinkableFromBlockList(doc, doc.blocks, docsById, dbsById, items);
  }

  return items;
}

/** Recursively maps every block in a block tree, including nested column layouts. */
export function mapDocBlockTree(
  blocks: DocBlock[],
  fn: (block: DocBlock) => DocBlock
): DocBlock[] {
  return blocks.map((block) => {
    const mapped = fn(block);
    if (mapped.type === "columns" && Array.isArray(mapped.columns)) {
      return {
        ...mapped,
        columns: mapped.columns.map((col) => mapDocBlockTree(col, fn)),
      };
    }
    return mapped;
  });
}

/** Inserts `instance` into `blocks` at `anchorBlockId` (replacing an empty unsynced paragraph when requested). */
export function insertSyncedInstanceInTree(
  blocks: DocBlock[],
  anchorBlockId: string | null,
  instance: DocBlock,
  mode: "replace-if-empty" | "after"
): { blocks: DocBlock[]; inserted: boolean } {
  if (!anchorBlockId) {
    return { blocks: [...blocks, instance], inserted: true };
  }

  const idx = blocks.findIndex((b) => b.id === anchorBlockId);
  if (idx !== -1) {
    const anchor = blocks[idx];
    const shouldReplace =
      mode === "replace-if-empty" &&
      anchor.type === "paragraph" &&
      !anchor.content.trim() &&
      !anchor.syncGroupId;
    const copy = [...blocks];
    if (shouldReplace) {
      copy[idx] = instance;
    } else {
      copy.splice(idx + 1, 0, instance);
    }
    return { blocks: copy, inserted: true };
  }

  let nestedInserted = false;
  const nextBlocks = blocks.map((block) => {
    if (nestedInserted || block.type !== "columns" || !Array.isArray(block.columns)) {
      return block;
    }
    const nextCols = block.columns.map((col) => {
      if (nestedInserted) return col;
      const res = insertSyncedInstanceInTree(col, anchorBlockId, instance, mode);
      if (res.inserted) {
        nestedInserted = true;
        return res.blocks;
      }
      return col;
    });
    return nestedInserted ? { ...block, columns: nextCols } : block;
  });

  return { blocks: nestedInserted ? nextBlocks : blocks, inserted: nestedInserted };
}
