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
import {
  createDefaultDatabase,
  type DatabaseViewType,
  type InlineDatabase,
  type PropertyValue,
} from "./database-types";
import {
  applyMoveDoc,
  collectDeletedTree,
  duplicateBlocksWithFreshIds,
  toggleTodoInBlockList,
} from "./docs-storage";
import {
  type ImportMode,
  prepareImportState,
  type WorkspaceExportBundle,
} from "./docs-transfer";
import { createId, type Doc, type DocBlock, type MoveDocTarget } from "./docs-utils";
import {
  cloneDatabaseForUnsync,
  collectAllDatabaseIdsInDocs,
  collectDatabaseIdsFromBlocks,
  createSyncedBlockInstance,
  findBlockInTree,
  findBlockSyncTemplate,
  insertSyncedInstanceInTree,
  isBlockInsideSyncedColumns,
  isDatabaseReferencedOutside,
  mapDocBlockTree,
  propagateSyncedBlocks,
  pruneUnreferencedDatabases,
} from "./synced-blocks";
import { useWorkspaceServer } from "./workspace-server-store";

type DocPatch = Partial<
  Pick<Doc, "title" | "blocks" | "icon" | "cover" | "fullWidth" | "properties">
>;

type DatabasePatch = Partial<
  Pick<
    InlineDatabase,
    | "title"
    | "icon"
    | "description"
    | "locked"
    | "fullWidth"
    | "views"
    | "properties"
  >
>;

interface DocsContextValue {
  hydrated: boolean;
  hydratedRevision: number;
  docs: Doc[];
  databases: InlineDatabase[];
  trashedDocs: Doc[];
  trashedDatabases: InlineDatabase[];
  getDoc: (id: string) => Doc | undefined;
  getDatabase: (id: string) => InlineDatabase | undefined;
  getDatabaseRows: (databaseId: string) => Doc[];
  createDoc: (parentId?: string) => Doc;
  updateDoc: (id: string, patch: DocPatch) => void;
  toggleTodo: (docId: string, blockId: string) => void;
  toggleFavorite: (id: string) => void;
  duplicateDoc: (id: string) => Doc | null;
  moveDoc: (docId: string, target: MoveDocTarget) => boolean;
  deleteDoc: (id: string) => void;
  restoreDocs: (ids: string[]) => {
    restoredDocsCount: number;
    restoredDbsCount: number;
  };
  permanentlyDeleteDocs: (ids: string[]) => {
    deletedDocsCount: number;
    deletedDbsCount: number;
  };
  emptyTrash: () => { deletedDocsCount: number; deletedDbsCount: number };
  createDatabase: (
    parentDocId: string,
    initialViewType?: DatabaseViewType
  ) => InlineDatabase;
  updateDatabase: (id: string, patch: DatabasePatch) => void;
  createDatabaseRow: (
    databaseId: string,
    initialProps?: Record<string, PropertyValue>,
    initialTitle?: string
  ) => Doc | null;
  updateDocProperty: (
    docId: string,
    propertyId: string,
    value: PropertyValue
  ) => void;
  getExportSnapshot: () => { docs: Doc[]; databases: InlineDatabase[] };
  importWorkspace: (
    bundle: WorkspaceExportBundle,
    mode: ImportMode
  ) => { docsCount: number; databasesCount: number };
  syncedClipboardId: string | null;
  ensureBlockSynced: (docId: string, blockId: string) => string | null;
  copyBlockAsSynced: (docId: string, blockId: string) => string | null;
  insertSyncedBlock: (
    targetDocId: string,
    anchorBlockId: string | null,
    syncGroupId: string,
    mode?: "replace-if-empty" | "after",
    fallbackTemplate?: DocBlock
  ) => DocBlock | null;
  unsyncBlock: (docId: string, blockId: string, unsyncAll?: boolean) => void;
}

const DocsContext = createContext<DocsContextValue | null>(null);

/** Provides shared document and inline database state synchronized with the server workspace store. */
export function DocsProvider({ children }: { children: React.ReactNode }) {
  const { loaded, loadRevision, initialState } = useWorkspaceServer();

  const [allDocs, setAllDocs] = useState<Doc[]>([]);
  const [allDatabases, setAllDatabases] = useState<InlineDatabase[]>([]);
  const [hydratedRevision, setHydratedRevision] = useState(0);
  const [syncedClipboardId, setSyncedClipboardId] = useState<string | null>(null);
  const lastAppliedRevisionRef = useRef(0);

  const hydrated = hydratedRevision > 0;

  useEffect(() => {
    if (!loaded || loadRevision === 0) return;
    if (lastAppliedRevisionRef.current === loadRevision) return;
    lastAppliedRevisionRef.current = loadRevision;

    let loadedDocs = initialState.docs;
    let loadedDbs = initialState.databases;

    const activeDocs = loadedDocs.filter((doc) => !doc.trashedAt);
    const trashedLoadedDocs = loadedDocs.filter((doc) =>
      Boolean(doc.trashedAt)
    );
    const activeDbs = loadedDbs.filter((db) => !db.trashedAt);
    const trashedLoadedDbs = loadedDbs.filter((db) => Boolean(db.trashedAt));

    if (activeDbs.length > 0) {
      const referencedDbIds = collectAllDatabaseIdsInDocs(activeDocs);
      const orphanDbIds = activeDbs
        .filter((db) => !referencedDbIds.has(db.id))
        .map((db) => db.id);
      if (orphanDbIds.length > 0) {
        const pruned = pruneUnreferencedDatabases(
          activeDocs,
          activeDbs,
          orphanDbIds
        );
        loadedDocs = [...pruned.docs, ...trashedLoadedDocs];
        loadedDbs = [...pruned.databases, ...trashedLoadedDbs];
      }
    }

    setAllDocs(loadedDocs);
    setAllDatabases(loadedDbs);
    setSyncedClipboardId(null);
    setHydratedRevision(loadRevision);
  }, [initialState, loadRevision, loaded]);

  const docs = useMemo(
    () => allDocs.filter((doc) => !doc.trashedAt),
    [allDocs]
  );

  const databases = useMemo(
    () => allDatabases.filter((db) => !db.trashedAt),
    [allDatabases]
  );

  const trashedDocs = useMemo(
    () =>
      allDocs
        .filter((doc) => Boolean(doc.trashedAt))
        .sort((a, b) => (b.trashedAt ?? "").localeCompare(a.trashedAt ?? "")),
    [allDocs]
  );

  const trashedDatabases = useMemo(
    () => allDatabases.filter((db) => Boolean(db.trashedAt)),
    [allDatabases]
  );

  const getDoc = useCallback(
    (id: string) => docs.find((doc) => doc.id === id),
    [docs]
  );

  const getDatabase = useCallback(
    (id: string) => databases.find((db) => db.id === id),
    [databases]
  );

  const getDatabaseRows = useCallback(
    (databaseId: string) => docs.filter((doc) => doc.databaseId === databaseId),
    [docs]
  );

  const createDoc = useCallback((parentId?: string): Doc => {
    const now = new Date().toISOString();
    const newDoc: Doc = {
      id: createId(),
      title: "",
      blocks: [{ id: createId(), type: "paragraph", content: "" }],
      createdAt: now,
      updatedAt: now,
      ...(parentId ? { parentId } : {}),
    };
    setAllDocs((prev) => [newDoc, ...prev]);
    return newDoc;
  }, []);

  const updateDoc = useCallback(
    (id: string, patch: DocPatch) => {
      const now = new Date().toISOString();
      if (patch.blocks) {
        const prevDoc = docs.find((doc) => doc.id === id);
        if (prevDoc) {
          const prevDbIds = collectDatabaseIdsFromBlocks(prevDoc.blocks);
          const nextDbIds = collectDatabaseIdsFromBlocks(patch.blocks);
          const removedDbIds = Array.from(prevDbIds).filter(
            (dbId) => !nextDbIds.has(dbId)
          );

          if (removedDbIds.length > 0) {
            const rawNextActive = docs.map((doc) =>
              doc.id === id ? { ...doc, ...patch, updatedAt: now } : doc
            );
            const propagatedActive = propagateSyncedBlocks(
              docs,
              rawNextActive,
              id,
              now
            );
            const pruned = pruneUnreferencedDatabases(
              propagatedActive,
              databases,
              removedDbIds,
              id
            );
            const nextAllDocs = [...pruned.docs, ...trashedDocs];
            setAllDocs(nextAllDocs);
            if (pruned.changed) {
              const nextAllDbs = [...pruned.databases, ...trashedDatabases];
              setAllDatabases(nextAllDbs);
            }
            return;
          }
        }
      }

      setAllDocs((prev) => {
        const rawNext = prev.map((doc) =>
          doc.id === id ? { ...doc, ...patch, updatedAt: now } : doc
        );
        return propagateSyncedBlocks(prev, rawNext, id, now);
      });
    },
    [databases, docs, trashedDatabases, trashedDocs]
  );

  const toggleTodo = useCallback((docId: string, blockId: string) => {
    const now = new Date().toISOString();
    setAllDocs((prev) => {
      const rawNext = prev.map((doc) =>
        doc.id === docId
          ? {
              ...doc,
              updatedAt: now,
              blocks: toggleTodoInBlockList(doc.blocks, blockId),
            }
          : doc
      );
      return propagateSyncedBlocks(prev, rawNext, docId, now);
    });
  }, []);

  const toggleFavorite = useCallback((id: string) => {
    setAllDocs((prev) =>
      prev.map((doc) =>
        doc.id === id ? { ...doc, favorite: !doc.favorite } : doc
      )
    );
  }, []);

  const duplicateDoc = useCallback(
    (id: string): Doc | null => {
      const source = docs.find((doc) => doc.id === id);
      if (!source) return null;

      const now = new Date().toISOString();
      const copy: Doc = {
        id: createId(),
        title: `${source.title.trim() || "Untitled"} (Copy)`,
        blocks: duplicateBlocksWithFreshIds(source.blocks),
        createdAt: now,
        updatedAt: now,
        ...(source.parentId ? { parentId: source.parentId } : {}),
        ...(source.databaseId ? { databaseId: source.databaseId } : {}),
        ...(source.properties ? { properties: { ...source.properties } } : {}),
        ...(source.favorite ? { favorite: true } : {}),
        ...(source.icon ? { icon: source.icon } : {}),
        ...(source.cover ? { cover: source.cover } : {}),
        ...(source.fullWidth ? { fullWidth: true } : {}),
      };

      setAllDocs((prev) => {
        const idx = prev.findIndex((doc) => doc.id === id);
        const next = [...prev];
        if (idx === -1) {
          next.unshift(copy);
        } else {
          next.splice(idx + 1, 0, copy);
        }
        return next;
      });

      return copy;
    },
    [docs]
  );

  const moveDoc = useCallback(
    (docId: string, target: MoveDocTarget): boolean => {
      const preview = applyMoveDoc(docs, docId, target);
      if (!preview.changed) return false;

      setAllDocs((prev) => {
        const activePrev = prev.filter((doc) => !doc.trashedAt);
        const res = applyMoveDoc(activePrev, docId, target);
        if (!res.changed) return prev;
        return [
          ...res.next,
          ...prev.filter((doc) => Boolean(doc.trashedAt)),
        ];
      });
      return true;
    },
    [docs]
  );

  /** Moves a document (plus its nested subpages and unshared inline databases) to Trash. */
  const deleteDoc = useCallback(
    (id: string) => {
      const now = new Date().toISOString();
      const { deletedDocIds, deletedDbIds } = collectDeletedTree(
        docs,
        databases,
        id
      );

      const survivedDbRehome = new Map<string, string>();
      const trashedDbIds = new Set<string>();
      for (const dbId of deletedDbIds) {
        const survivingDocId = isDatabaseReferencedOutside(
          docs,
          dbId,
          deletedDocIds
        );
        if (survivingDocId) {
          survivedDbRehome.set(dbId, survivingDocId);
        } else {
          trashedDbIds.add(dbId);
        }
      }

      const finalTrashedDocIds = new Set<string>();
      for (const doc of docs) {
        if (!deletedDocIds.has(doc.id)) continue;
        if (doc.databaseId && survivedDbRehome.has(doc.databaseId)) continue;
        finalTrashedDocIds.add(doc.id);
      }

      setAllDocs((prev) =>
        prev.map((doc) => {
          if (finalTrashedDocIds.has(doc.id)) {
            return { ...doc, trashedAt: now, updatedAt: now };
          }
          if (
            !doc.trashedAt &&
            doc.databaseId &&
            survivedDbRehome.has(doc.databaseId)
          ) {
            return { ...doc, parentId: survivedDbRehome.get(doc.databaseId) };
          }
          return doc;
        })
      );

      if (trashedDbIds.size > 0 || survivedDbRehome.size > 0) {
        setAllDatabases((prev) =>
          prev.map((db) => {
            if (trashedDbIds.has(db.id)) {
              return { ...db, trashedAt: now };
            }
            if (!db.trashedAt && survivedDbRehome.has(db.id)) {
              return { ...db, parentDocId: survivedDbRehome.get(db.id)! };
            }
            return db;
          })
        );
      }
    },
    [databases, docs]
  );

  /** Restores selected trashed documents (and their trashed subtrees/databases) back into the active workspace. */
  const restoreDocs = useCallback(
    (ids: string[]) => {
      const trashedDocSet = new Set(trashedDocs.map((doc) => doc.id));
      const trashedDbSet = new Set(trashedDatabases.map((db) => db.id));
      const requested = ids.filter((id) => trashedDocSet.has(id));
      if (requested.length === 0) {
        return { restoredDocsCount: 0, restoredDbsCount: 0 };
      }

      const toRestoreDocIds = new Set<string>();
      const toRestoreDbIds = new Set<string>();
      for (const rootId of requested) {
        const tree = collectDeletedTree(allDocs, allDatabases, rootId);
        for (const docId of tree.deletedDocIds) {
          if (trashedDocSet.has(docId)) toRestoreDocIds.add(docId);
        }
        for (const dbId of tree.deletedDbIds) {
          if (trashedDbSet.has(dbId)) toRestoreDbIds.add(dbId);
        }
      }

      const finalActiveDocIds = new Set([
        ...docs.map((doc) => doc.id),
        ...toRestoreDocIds,
      ]);
      const finalActiveDbIds = new Set([
        ...databases.map((db) => db.id),
        ...toRestoreDbIds,
      ]);
      const now = new Date().toISOString();

      setAllDocs((prev) =>
        prev.map((doc) => {
          if (!toRestoreDocIds.has(doc.id)) return doc;
          const restored: Doc = { ...doc, updatedAt: now };
          delete restored.trashedAt;
          if (restored.parentId && !finalActiveDocIds.has(restored.parentId)) {
            delete restored.parentId;
          }
          if (
            restored.databaseId &&
            !finalActiveDbIds.has(restored.databaseId)
          ) {
            delete restored.databaseId;
          }
          return restored;
        })
      );

      if (toRestoreDbIds.size > 0) {
        setAllDatabases((prev) =>
          prev.map((db) => {
            if (!toRestoreDbIds.has(db.id)) return db;
            const restored = { ...db };
            delete restored.trashedAt;
            return restored;
          })
        );
      }

      return {
        restoredDocsCount: toRestoreDocIds.size,
        restoredDbsCount: toRestoreDbIds.size,
      };
    },
    [allDatabases, allDocs, databases, docs, trashedDatabases, trashedDocs]
  );

  /** Permanently deletes selected trashed documents (and their trashed subtrees/databases). */
  const permanentlyDeleteDocs = useCallback(
    (ids: string[]) => {
      const trashedDocSet = new Set(trashedDocs.map((doc) => doc.id));
      const requested = ids.filter((id) => trashedDocSet.has(id));
      if (requested.length === 0) {
        return { deletedDocsCount: 0, deletedDbsCount: 0 };
      }

      const purgeDocIds = new Set<string>();
      const purgeDbIds = new Set<string>();
      for (const rootId of requested) {
        const tree = collectDeletedTree(trashedDocs, trashedDatabases, rootId);
        for (const docId of tree.deletedDocIds) purgeDocIds.add(docId);
        for (const dbId of tree.deletedDbIds) purgeDbIds.add(dbId);
      }

      setAllDocs((prev) => prev.filter((doc) => !purgeDocIds.has(doc.id)));

      if (purgeDbIds.size > 0) {
        setAllDatabases((prev) =>
          prev.filter((db) => !purgeDbIds.has(db.id))
        );
      }

      return {
        deletedDocsCount: purgeDocIds.size,
        deletedDbsCount: purgeDbIds.size,
      };
    },
    [trashedDatabases, trashedDocs]
  );

  /** Permanently removes all trashed documents and trashed databases. */
  const emptyTrash = useCallback(() => {
    const deletedDocsCount = trashedDocs.length;
    const deletedDbsCount = trashedDatabases.length;
    if (deletedDocsCount === 0 && deletedDbsCount === 0) {
      return { deletedDocsCount: 0, deletedDbsCount: 0 };
    }

    setAllDocs((prev) => prev.filter((doc) => !doc.trashedAt));

    if (deletedDbsCount > 0) {
      setAllDatabases((prev) => prev.filter((db) => !db.trashedAt));
    }

    return { deletedDocsCount, deletedDbsCount };
  }, [trashedDatabases.length, trashedDocs.length]);

  const createDatabase = useCallback(
    (
      parentDocId: string,
      initialViewType: DatabaseViewType = "table"
    ): InlineDatabase => {
      const db = createDefaultDatabase(parentDocId, initialViewType, createId);
      setAllDatabases((prev) => [...prev, db]);
      return db;
    },
    []
  );

  const updateDatabase = useCallback((id: string, patch: DatabasePatch) => {
    setAllDatabases((prev) =>
      prev.map((db) => (db.id === id ? { ...db, ...patch } : db))
    );
  }, []);

  const createDatabaseRow = useCallback(
    (
      databaseId: string,
      initialProps?: Record<string, PropertyValue>,
      initialTitle = ""
    ): Doc | null => {
      const db = databases.find((entry) => entry.id === databaseId);
      if (!db) return null;

      const now = new Date().toISOString();
      const newDoc: Doc = {
        id: createId(),
        title: initialTitle,
        parentId: db.parentDocId,
        databaseId: db.id,
        properties: { ...(initialProps ?? {}) },
        blocks: [{ id: createId(), type: "paragraph", content: "" }],
        createdAt: now,
        updatedAt: now,
      };

      setAllDocs((prev) => [...prev, newDoc]);
      return newDoc;
    },
    [databases]
  );

  const updateDocProperty = useCallback(
    (docId: string, propertyId: string, value: PropertyValue) => {
      const now = new Date().toISOString();
      setAllDocs((prev) =>
        prev.map((doc) => {
          if (doc.id !== docId) return doc;
          const db = doc.databaseId
            ? databases.find((item) => item.id === doc.databaseId)
            : undefined;
          if (db && propertyId === db.titlePropertyId) {
            return {
              ...doc,
              title: typeof value === "string" ? value : "",
              updatedAt: now,
            };
          }
          const nextProps = { ...(doc.properties ?? {}) };
          if (value === null) {
            delete nextProps[propertyId];
          } else {
            nextProps[propertyId] = value;
          }
          return {
            ...doc,
            properties: nextProps,
            updatedAt: now,
          };
        })
      );
    },
    [databases]
  );

  const getExportSnapshot = useCallback(
    () => ({ docs: allDocs, databases: allDatabases }),
    [allDatabases, allDocs]
  );

  const importWorkspace = useCallback(
    (bundle: WorkspaceExportBundle, mode: ImportMode) => {
      const next = prepareImportState(allDocs, allDatabases, bundle, mode);
      setAllDocs(next.docs);
      setAllDatabases(next.databases);
      return {
        docsCount: bundle.docs.length,
        databasesCount: bundle.databases.length,
      };
    },
    [allDatabases, allDocs]
  );

  const ensureBlockSynced = useCallback(
    (docId: string, blockId: string): string | null => {
      const targetDoc = docs.find((doc) => doc.id === docId);
      if (!targetDoc) return null;
      if (isBlockInsideSyncedColumns(targetDoc.blocks, blockId)) return null;
      const targetBlock = findBlockInTree(targetDoc.blocks, blockId);
      if (!targetBlock) return null;
      if (targetBlock.syncGroupId) return targetBlock.syncGroupId;

      const syncGroupId = createId();
      const now = new Date().toISOString();
      setAllDocs((prev) =>
        prev.map((doc) =>
          doc.id === docId
            ? {
                ...doc,
                updatedAt: now,
                blocks: mapDocBlockTree(doc.blocks, (b) =>
                  b.id === blockId ? { ...b, syncGroupId } : b
                ),
              }
            : doc
        )
      );
      return syncGroupId;
    },
    [docs]
  );

  const copyBlockAsSynced = useCallback(
    (docId: string, blockId: string): string | null => {
      const groupId = ensureBlockSynced(docId, blockId);
      if (groupId) {
        setSyncedClipboardId(groupId);
      }
      return groupId;
    },
    [ensureBlockSynced]
  );

  const insertSyncedBlock = useCallback(
    (
      targetDocId: string,
      anchorBlockId: string | null,
      syncGroupId: string,
      mode: "replace-if-empty" | "after" = "after",
      fallbackTemplate?: DocBlock
    ): DocBlock | null => {
      const template =
        findBlockSyncTemplate(docs, syncGroupId) ?? fallbackTemplate;
      if (!template) return null;

      const instance = createSyncedBlockInstance(template, syncGroupId);
      const now = new Date().toISOString();

      setAllDocs((prev) => {
        const activePrev = prev.filter((doc) => !doc.trashedAt);
        const liveTemplate = findBlockSyncTemplate(activePrev, syncGroupId);
        const finalInstance = liveTemplate
          ? {
              ...createSyncedBlockInstance(liveTemplate, syncGroupId),
              id: instance.id,
            }
          : instance;

        const next = prev.map((doc) => {
          if (doc.id !== targetDocId) return doc;
          const res = insertSyncedInstanceInTree(
            doc.blocks,
            anchorBlockId,
            finalInstance,
            mode
          );
          if (!res.inserted) {
            return {
              ...doc,
              updatedAt: now,
              blocks: [...doc.blocks, finalInstance],
            };
          }
          return { ...doc, updatedAt: now, blocks: res.blocks };
        });
        return next;
      });

      return instance;
    },
    [docs]
  );

  const unsyncBlock = useCallback(
    (docId: string, blockId: string, unsyncAll = false) => {
      const sourceDoc = docs.find((doc) => doc.id === docId);
      const targetBlock = sourceDoc
        ? findBlockInTree(sourceDoc.blocks, blockId)
        : null;
      const groupId = targetBlock?.syncGroupId;
      if (!groupId) return;

      const now = new Date().toISOString();
      const addedDbs: InlineDatabase[] = [];
      const addedRows: Doc[] = [];
      const rehomedDbs = new Map<string, string>();
      const emptyDocSet = new Set<string>();

      let nextActiveDocs = docs;
      let firstDbOwnerSeen = false;

      nextActiveDocs = nextActiveDocs.map((doc) => {
        let docChanged = false;
        const nextBlocks = mapDocBlockTree(doc.blocks, (b) => {
          const match = unsyncAll
            ? b.syncGroupId === groupId
            : doc.id === docId && b.id === blockId;
          if (!match) return b;

          docChanged = true;
          const cleaned = { ...b };
          delete cleaned.syncGroupId;

          if (cleaned.type === "database" && cleaned.databaseId) {
            const dbId = cleaned.databaseId;
            if (unsyncAll && !firstDbOwnerSeen) {
              firstDbOwnerSeen = true;
              return cleaned;
            }
            const sharedElsewhere = isDatabaseReferencedOutside(
              nextActiveDocs,
              dbId,
              emptyDocSet,
              b.id
            );
            if (sharedElsewhere) {
              const sourceDb = databases.find((db) => db.id === dbId);
              if (sourceDb) {
                const sourceRows = docs.filter((r) => r.databaseId === dbId);
                const { clonedDb, clonedRows } = cloneDatabaseForUnsync(
                  sourceDb,
                  sourceRows,
                  doc.id
                );
                addedDbs.push(clonedDb);
                addedRows.push(...clonedRows);
                if (
                  !unsyncAll &&
                  sourceDb.parentDocId === doc.id &&
                  sharedElsewhere !== doc.id
                ) {
                  rehomedDbs.set(dbId, sharedElsewhere);
                }
                cleaned.databaseId = clonedDb.id;
              }
            }
          }

          return cleaned;
        });

        return docChanged ? { ...doc, blocks: nextBlocks, updatedAt: now } : doc;
      });

      if (addedRows.length > 0) {
        nextActiveDocs = [...nextActiveDocs, ...addedRows];
      }

      if (addedDbs.length > 0 || rehomedDbs.size > 0) {
        const nextAllDatabases = [
          ...databases.map((db) =>
            rehomedDbs.has(db.id)
              ? { ...db, parentDocId: rehomedDbs.get(db.id)! }
              : db
          ),
          ...addedDbs,
          ...trashedDatabases,
        ];
        setAllDatabases(nextAllDatabases);
      }

      const nextAllDocs = [...nextActiveDocs, ...trashedDocs];
      setAllDocs(nextAllDocs);
    },
    [databases, docs, trashedDatabases, trashedDocs]
  );

  const value = useMemo<DocsContextValue>(
    () => ({
      hydrated,
      hydratedRevision,
      docs,
      databases,
      trashedDocs,
      trashedDatabases,
      getDoc,
      getDatabase,
      getDatabaseRows,
      createDoc,
      updateDoc,
      toggleTodo,
      toggleFavorite,
      duplicateDoc,
      moveDoc,
      deleteDoc,
      restoreDocs,
      permanentlyDeleteDocs,
      emptyTrash,
      createDatabase,
      updateDatabase,
      createDatabaseRow,
      updateDocProperty,
      getExportSnapshot,
      importWorkspace,
      syncedClipboardId,
      ensureBlockSynced,
      copyBlockAsSynced,
      insertSyncedBlock,
      unsyncBlock,
    }),
    [
      copyBlockAsSynced,
      createDatabase,
      createDatabaseRow,
      createDoc,
      databases,
      deleteDoc,
      docs,
      duplicateDoc,
      emptyTrash,
      ensureBlockSynced,
      getDatabase,
      getDatabaseRows,
      getDoc,
      getExportSnapshot,
      hydrated,
      hydratedRevision,
      importWorkspace,
      insertSyncedBlock,
      moveDoc,
      permanentlyDeleteDocs,
      restoreDocs,
      syncedClipboardId,
      toggleFavorite,
      toggleTodo,
      trashedDatabases,
      trashedDocs,
      unsyncBlock,
      updateDatabase,
      updateDoc,
      updateDocProperty,
    ]
  );

  return <DocsContext.Provider value={value}>{children}</DocsContext.Provider>;
}

/** Returns the shared Docs workspace state and actions. */
export function useDocs(): DocsContextValue {
  const ctx = useContext(DocsContext);
  if (!ctx) {
    throw new Error("useDocs must be used within a DocsProvider");
  }
  return ctx;
}
