import type { DatabasePropertySchema, InlineDatabase } from "./database-types";
import { normalizeDatabase, normalizeDoc } from "./docs-storage";
import {
  createId,
  type Doc,
  type DocBlock,
  isDocDescendant,
} from "./docs-utils";
import {
  DEFAULT_CURRENCY,
  type FinanceAccount,
  type FinanceTransaction,
  normalizeAccount,
  normalizeCurrency,
  normalizeRecurringRule,
  normalizeTransaction,
  type RecurringRule,
} from "./finance-utils";
import {
  type AgentChatSession,
  type HermesAgentConfig,
  normalizeAgentSessions,
  normalizeHermesConfig,
} from "./hermes-client";
import {
  normalizeCompletionLog,
  normalizeLabel,
  normalizeLabelName,
  normalizeProject,
  normalizeSection,
  normalizeTask,
  repairProjectHierarchy,
  type TodoCompletionLog,
  type TodoLabel,
  type TodoProject,
  type TodoSection,
  type TodoTask,
} from "./todos-utils";

export const WORKSPACE_EXPORT_FORMAT = "maa-workspace" as const;
export const WORKSPACE_EXPORT_SCHEMA_VERSION = 3 as const;
const SUPPORTED_SCHEMA_VERSIONS = new Set([1, 2, 3]);

export type ImportMode = "merge" | "replace";
export type ThemePreference = "light" | "system" | "dark";

export interface WorkspaceFinanceExport {
  accounts: FinanceAccount[];
  transactions: FinanceTransaction[];
  recurring: RecurringRule[];
  lastCurrency: string;
  includeSubAccounts: boolean;
}

export interface WorkspaceTodosExport {
  projects: TodoProject[];
  sections: TodoSection[];
  labels: TodoLabel[];
  tasks: TodoTask[];
  completionLog?: TodoCompletionLog[];
}

export interface WorkspaceAgentExport {
  config: HermesAgentConfig;
  sessions: AgentChatSession[];
}

export interface WorkspaceExportInput {
  docs: Doc[];
  databases: InlineDatabase[];
  finance?: WorkspaceFinanceExport;
  todos?: WorkspaceTodosExport;
  agent?: WorkspaceAgentExport;
  theme?: ThemePreference;
}

export interface WorkspaceExportBundle {
  format: typeof WORKSPACE_EXPORT_FORMAT;
  schemaVersion: typeof WORKSPACE_EXPORT_SCHEMA_VERSION;
  exportedAt: string;
  docs: Doc[];
  databases: InlineDatabase[];
  finance?: WorkspaceFinanceExport;
  todos?: WorkspaceTodosExport;
  agent?: WorkspaceAgentExport;
  theme?: ThemePreference;
}

export interface ParsedImportResult {
  bundle: WorkspaceExportBundle;
  docCount: number;
  trashedDocCount: number;
  databaseCount: number;
  financeAccountCount: number;
  financeTrashedAccountCount: number;
  financeTransactionCount: number;
  financeRecurringCount: number;
  todoProjectCount: number;
  todoTrashedProjectCount: number;
  todoTaskCount: number;
  agentSessionCount: number;
  hasFinance: boolean;
  hasTodos: boolean;
  hasAgent: boolean;
  hasTheme: boolean;
  skippedDocCount: number;
  skippedDatabaseCount: number;
  warnings: string[];
}

const VALID_VIEW_TYPES = new Set([
  "table",
  "board",
  "timeline",
  "gallery",
  "calendar",
]);

const VALID_PROPERTY_TYPES = new Set([
  "title",
  "text",
  "number",
  "select",
  "multi_select",
  "date",
  "checkbox",
  "url",
  "relation",
  "person",
  "file",
  "created_time",
  "formula",
]);

/** Builds a versioned workspace JSON bundle from all persisted workspace domains. */
export function buildWorkspaceExportBundle(
  input: WorkspaceExportInput
): WorkspaceExportBundle {
  return {
    format: WORKSPACE_EXPORT_FORMAT,
    schemaVersion: WORKSPACE_EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    docs: input.docs,
    databases: input.databases,
    ...(input.finance ? { finance: input.finance } : {}),
    ...(input.todos ? { todos: input.todos } : {}),
    ...(input.agent ? { agent: input.agent } : {}),
    ...(input.theme ? { theme: input.theme } : {}),
  };
}

/** Serializes the full workspace as formatted JSON ready for download. */
export function serializeWorkspaceExport(input: WorkspaceExportInput): string {
  return JSON.stringify(buildWorkspaceExportBundle(input), null, 2);
}

/** Builds a date-stamped filename for workspace JSON exports. */
export function buildExportFilename(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `maa-workspace-${year}-${month}-${day}.json`;
}

function sanitizeImportedDatabase(raw: unknown): InlineDatabase | null {
  const normalized = normalizeDatabase(raw);
  if (!normalized) return null;

  const validProps = normalized.properties.filter(
    (prop): prop is DatabasePropertySchema =>
      Boolean(prop) &&
      typeof prop === "object" &&
      typeof prop.id === "string" &&
      prop.id.length > 0 &&
      typeof prop.name === "string" &&
      VALID_PROPERTY_TYPES.has(prop.type)
  );

  const validViews = normalized.views.filter(
    (view) =>
      Boolean(view) &&
      typeof view === "object" &&
      typeof view.id === "string" &&
      view.id.length > 0 &&
      typeof view.name === "string" &&
      VALID_VIEW_TYPES.has(view.type) &&
      Array.isArray(view.visiblePropertyIds)
  );

  if (validProps.length === 0 || validViews.length === 0) {
    return null;
  }

  return {
    ...normalized,
    properties: validProps,
    views: validViews,
  };
}

/** Strips dangling or cyclic parent references in a list of finance accounts. */
export function repairAccountHierarchy(
  accounts: FinanceAccount[]
): FinanceAccount[] {
  const cloned = accounts.map((a) => ({ ...a }));
  const byId = new Map(cloned.map((a) => [a.id, a]));

  for (const account of cloned) {
    if (!account.parentId) continue;
    if (!byId.has(account.parentId) || account.parentId === account.id) {
      delete account.parentId;
      continue;
    }
    const seen = new Set<string>([account.id]);
    let curr: FinanceAccount | undefined = byId.get(account.parentId);
    while (curr) {
      if (seen.has(curr.id)) {
        delete account.parentId;
        break;
      }
      seen.add(curr.id);
      curr = curr.parentId ? byId.get(curr.parentId) : undefined;
    }
  }

  return cloned;
}

/** Computes the next finance state for either "merge" (assign fresh IDs) or "replace". */
export function prepareFinanceImport(
  current: WorkspaceFinanceExport,
  incoming: WorkspaceFinanceExport,
  mode: ImportMode
): WorkspaceFinanceExport {
  if (mode === "replace") {
    const repairedAccounts = repairAccountHierarchy(incoming.accounts);
    const validAccountIds = new Set(repairedAccounts.map((a) => a.id));
    return {
      accounts: repairedAccounts,
      transactions: incoming.transactions.filter((t) =>
        validAccountIds.has(t.accountId)
      ),
      recurring: incoming.recurring.filter((r) =>
        validAccountIds.has(r.accountId)
      ),
      lastCurrency:
        normalizeCurrency(incoming.lastCurrency) ?? DEFAULT_CURRENCY,
      includeSubAccounts: incoming.includeSubAccounts !== false,
    };
  }

  const accountIdMap = new Map<string, string>();
  for (const account of incoming.accounts) {
    accountIdMap.set(account.id, createId());
  }

  const remappedAccounts: FinanceAccount[] = incoming.accounts.map((account) => {
    const nextId = accountIdMap.get(account.id) ?? createId();
    const nextParentId = account.parentId
      ? accountIdMap.get(account.parentId)
      : undefined;
    const nextAccount: FinanceAccount = {
      ...account,
      id: nextId,
    };
    if (nextParentId && nextParentId !== nextId) {
      nextAccount.parentId = nextParentId;
    } else {
      delete nextAccount.parentId;
    }
    return nextAccount;
  });

  const recurringIdMap = new Map<string, string>();
  const remappedRecurring: RecurringRule[] = [];
  for (const rule of incoming.recurring) {
    const nextAccountId = accountIdMap.get(rule.accountId);
    if (!nextAccountId) continue;
    const nextRuleId = createId();
    recurringIdMap.set(rule.id, nextRuleId);
    remappedRecurring.push({
      ...rule,
      id: nextRuleId,
      accountId: nextAccountId,
    });
  }

  const remappedTransactions: FinanceTransaction[] = [];
  for (const tx of incoming.transactions) {
    const nextAccountId = accountIdMap.get(tx.accountId);
    if (!nextAccountId) continue;

    const mappedRuleId = tx.recurringId
      ? recurringIdMap.get(tx.recurringId)
      : undefined;
    let nextId = createId();
    if (tx.recurringId && mappedRuleId) {
      const prefix = `rec-${tx.recurringId}-`;
      if (tx.id.startsWith(prefix)) {
        nextId = `rec-${mappedRuleId}-${tx.id.slice(prefix.length)}`;
      }
    }

    const nextTx: FinanceTransaction = {
      ...tx,
      id: nextId,
      accountId: nextAccountId,
    };
    if (mappedRuleId) {
      nextTx.recurringId = mappedRuleId;
    } else {
      delete nextTx.recurringId;
    }
    remappedTransactions.push(nextTx);
  }

  return {
    accounts: repairAccountHierarchy([...current.accounts, ...remappedAccounts]),
    transactions: [...current.transactions, ...remappedTransactions],
    recurring: [...current.recurring, ...remappedRecurring],
    lastCurrency:
      current.accounts.length === 0
        ? (normalizeCurrency(incoming.lastCurrency) ?? current.lastCurrency)
        : current.lastCurrency,
    includeSubAccounts: current.includeSubAccounts,
  };
}

function repairTaskLinks(
  tasks: TodoTask[],
  validProjectIds: ReadonlySet<string>,
  sectionById: ReadonlyMap<string, TodoSection>
): TodoTask[] {
  const cleaned = tasks
    .filter((t) => t.projectId === null || validProjectIds.has(t.projectId))
    .map((t) => {
      const next: TodoTask = { ...t };
      if (next.sectionId) {
        const sec = sectionById.get(next.sectionId);
        if (!sec || sec.projectId !== next.projectId) {
          delete next.sectionId;
        }
      }
      return next;
    });

  const byId = new Map(cleaned.map((t) => [t.id, t]));
  for (const task of cleaned) {
    if (!task.parentId) continue;
    if (!byId.has(task.parentId) || task.parentId === task.id) {
      delete task.parentId;
      continue;
    }
    const seen = new Set<string>([task.id]);
    let curr = byId.get(task.parentId);
    while (curr) {
      if (seen.has(curr.id)) {
        delete task.parentId;
        break;
      }
      seen.add(curr.id);
      curr = curr.parentId ? byId.get(curr.parentId) : undefined;
    }
  }
  return cleaned;
}

/** Computes the next Todos state for either "merge" (fresh IDs) or "replace". */
export function prepareTodosImport(
  current: WorkspaceTodosExport,
  incoming: WorkspaceTodosExport,
  mode: ImportMode
): WorkspaceTodosExport {
  if (mode === "replace") {
    const repairedProjects = repairProjectHierarchy(incoming.projects);
    const validProjectIds = new Set(repairedProjects.map((p) => p.id));
    const validSections = incoming.sections.filter((s) =>
      validProjectIds.has(s.projectId)
    );
    const sectionById = new Map(validSections.map((s) => [s.id, s]));
    const tasks = repairTaskLinks(incoming.tasks, validProjectIds, sectionById);

    const labelMap = new Map<string, TodoLabel>();
    for (const lbl of incoming.labels) {
      const key = normalizeLabelName(lbl.name);
      if (key && !labelMap.has(key)) {
        labelMap.set(key, { ...lbl, name: key });
      }
    }

    const incomingLogs = incoming.completionLog ?? [];
    return {
      projects: repairedProjects,
      sections: validSections,
      labels: [...labelMap.values()],
      tasks,
      ...(incomingLogs.length > 0
        ? {
            completionLog: incomingLogs.filter(
              (entry) =>
                entry.projectId === null || validProjectIds.has(entry.projectId)
            ),
          }
        : {}),
    };
  }

  const projectIdMap = new Map<string, string>();
  for (const project of incoming.projects) {
    projectIdMap.set(project.id, createId());
  }

  const remappedProjects: TodoProject[] = incoming.projects.map((project) => {
    const nextId = projectIdMap.get(project.id) ?? createId();
    const nextParentId = project.parentId
      ? projectIdMap.get(project.parentId)
      : undefined;
    const next: TodoProject = { ...project, id: nextId };
    if (nextParentId && nextParentId !== nextId) {
      next.parentId = nextParentId;
    } else {
      delete next.parentId;
    }
    return next;
  });

  const sectionIdMap = new Map<string, string>();
  const remappedSections: TodoSection[] = [];
  for (const section of incoming.sections) {
    const nextProjectId = projectIdMap.get(section.projectId);
    if (!nextProjectId) continue;
    const nextId = createId();
    sectionIdMap.set(section.id, nextId);
    remappedSections.push({
      ...section,
      id: nextId,
      projectId: nextProjectId,
    });
  }

  const taskIdMap = new Map<string, string>();
  for (const task of incoming.tasks) {
    taskIdMap.set(task.id, createId());
  }

  const remappedTasks: TodoTask[] = [];
  for (const task of incoming.tasks) {
    const nextId = taskIdMap.get(task.id) ?? createId();
    let nextProjectId: string | null = null;
    if (task.projectId) {
      const mapped = projectIdMap.get(task.projectId);
      if (!mapped) continue;
      nextProjectId = mapped;
    }
    const nextSectionId =
      nextProjectId && task.sectionId
        ? sectionIdMap.get(task.sectionId)
        : undefined;
    const nextParentId = task.parentId ? taskIdMap.get(task.parentId) : undefined;
    const nextTask: TodoTask = {
      ...task,
      id: nextId,
      projectId: nextProjectId,
      ...(task.comments
        ? {
            comments: task.comments.map((c) => ({
              ...c,
              id: createId(),
            })),
          }
        : {}),
    };
    if (nextSectionId) nextTask.sectionId = nextSectionId;
    else delete nextTask.sectionId;
    if (nextParentId && nextParentId !== nextId) nextTask.parentId = nextParentId;
    else delete nextTask.parentId;
    remappedTasks.push(nextTask);
  }

  const mergedProjects = repairProjectHierarchy([
    ...current.projects,
    ...remappedProjects,
  ]);
  const mergedSections = [...current.sections, ...remappedSections];
  const validProjectIds = new Set(mergedProjects.map((p) => p.id));
  const sectionById = new Map(mergedSections.map((s) => [s.id, s]));

  const labelByName = new Map<string, TodoLabel>();
  for (const lbl of current.labels) {
    const key = normalizeLabelName(lbl.name);
    if (key) labelByName.set(key, lbl);
  }
  for (const lbl of incoming.labels) {
    const key = normalizeLabelName(lbl.name);
    if (key && !labelByName.has(key)) {
      labelByName.set(key, { ...lbl, id: createId(), name: key });
    }
  }

  const remappedLogs: TodoCompletionLog[] = [];
  for (const entry of incoming.completionLog ?? []) {
    let nextProjectId: string | null = null;
    if (entry.projectId) {
      const mapped = projectIdMap.get(entry.projectId);
      if (!mapped) continue;
      nextProjectId = mapped;
    }
    remappedLogs.push({
      ...entry,
      id: createId(),
      taskId: taskIdMap.get(entry.taskId) ?? createId(),
      projectId: nextProjectId,
    });
  }

  const mergedLogs = [...(current.completionLog ?? []), ...remappedLogs];

  return {
    projects: mergedProjects,
    sections: mergedSections,
    labels: [...labelByName.values()],
    tasks: repairTaskLinks(
      [...current.tasks, ...remappedTasks],
      validProjectIds,
      sectionById
    ),
    ...(mergedLogs.length > 0 ? { completionLog: mergedLogs } : {}),
  };
}

/** Parses, validates, and sanitizes an uploaded workspace JSON string before import. */
export function parseWorkspaceImport(
  rawText: string
): { ok: true; data: ParsedImportResult } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return { ok: false, error: "File is not valid JSON." };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      ok: false,
      error: "Invalid export file: expected a JSON object.",
    };
  }

  const obj = parsed as Record<string, unknown>;
  if (
    "format" in obj &&
    obj.format !== undefined &&
    obj.format !== WORKSPACE_EXPORT_FORMAT
  ) {
    return {
      ok: false,
      error: "Unsupported file format. Expected an MAA workspace JSON file.",
    };
  }

  if (
    "schemaVersion" in obj &&
    obj.schemaVersion !== undefined &&
    (typeof obj.schemaVersion !== "number" ||
      !SUPPORTED_SCHEMA_VERSIONS.has(obj.schemaVersion))
  ) {
    return {
      ok: false,
      error: `Unsupported schema version (${String(obj.schemaVersion)}).`,
    };
  }

  const hasAnyExtraDomain =
    obj.finance !== undefined ||
    obj.todos !== undefined ||
    obj.agent !== undefined ||
    obj.theme !== undefined;

  if (obj.docs === undefined && !hasAnyExtraDomain) {
    return {
      ok: false,
      error: 'Invalid export file: missing "docs" array.',
    };
  }

  if (obj.docs !== undefined && !Array.isArray(obj.docs)) {
    return {
      ok: false,
      error: 'Invalid export file: "docs" must be an array.',
    };
  }

  if (obj.databases !== undefined && !Array.isArray(obj.databases)) {
    return {
      ok: false,
      error: 'Invalid export file: "databases" must be an array.',
    };
  }

  const docs: Doc[] = [];
  const seenDocIds = new Set<string>();
  let skippedDocCount = 0;

  for (const rawDoc of obj.docs ?? []) {
    const normalized = normalizeDoc(rawDoc);
    if (!normalized || seenDocIds.has(normalized.id)) {
      skippedDocCount += 1;
      continue;
    }
    seenDocIds.add(normalized.id);
    docs.push(normalized);
  }

  const databases: InlineDatabase[] = [];
  const seenDbIds = new Set<string>();
  let skippedDatabaseCount = 0;

  for (const rawDb of obj.databases ?? []) {
    const normalized = sanitizeImportedDatabase(rawDb);
    if (!normalized || seenDbIds.has(normalized.id)) {
      skippedDatabaseCount += 1;
      continue;
    }
    seenDbIds.add(normalized.id);
    databases.push(normalized);
  }

  const warnings: string[] = [];
  if (skippedDocCount > 0) {
    warnings.push(
      `Skipped ${skippedDocCount} invalid or duplicate ${skippedDocCount === 1 ? "document" : "documents"}.`
    );
  }
  if (skippedDatabaseCount > 0) {
    warnings.push(
      `Skipped ${skippedDatabaseCount} invalid or duplicate ${skippedDatabaseCount === 1 ? "database" : "databases"}.`
    );
  }

  // Optional Finance domain (v2+)
  let finance: WorkspaceFinanceExport | undefined;
  if (obj.finance !== undefined) {
    if (
      !obj.finance ||
      typeof obj.finance !== "object" ||
      Array.isArray(obj.finance)
    ) {
      return {
        ok: false,
        error: 'Invalid export file: "finance" must be an object.',
      };
    }
    const finObj = obj.finance as Record<string, unknown>;
    if (finObj.accounts !== undefined && !Array.isArray(finObj.accounts)) {
      return {
        ok: false,
        error: 'Invalid export file: "finance.accounts" must be an array.',
      };
    }
    if (
      finObj.transactions !== undefined &&
      !Array.isArray(finObj.transactions)
    ) {
      return {
        ok: false,
        error: 'Invalid export file: "finance.transactions" must be an array.',
      };
    }
    if (finObj.recurring !== undefined && !Array.isArray(finObj.recurring)) {
      return {
        ok: false,
        error: 'Invalid export file: "finance.recurring" must be an array.',
      };
    }

    const rawAccounts = Array.isArray(finObj.accounts) ? finObj.accounts : [];
    const accountsList: FinanceAccount[] = [];
    const seenAccountIds = new Set<string>();
    let skippedAccountCount = 0;
    for (const rawAcc of rawAccounts) {
      const norm = normalizeAccount(rawAcc);
      if (!norm || seenAccountIds.has(norm.id)) {
        skippedAccountCount += 1;
        continue;
      }
      seenAccountIds.add(norm.id);
      accountsList.push(norm);
    }
    const repairedAccounts = repairAccountHierarchy(accountsList);
    const validAccountIds = new Set(repairedAccounts.map((a) => a.id));

    const rawTransactions = Array.isArray(finObj.transactions)
      ? finObj.transactions
      : [];
    const transactionsList: FinanceTransaction[] = [];
    const seenTxIds = new Set<string>();
    let skippedTxCount = 0;
    for (const rawTx of rawTransactions) {
      const norm = normalizeTransaction(rawTx);
      if (
        !norm ||
        seenTxIds.has(norm.id) ||
        !validAccountIds.has(norm.accountId)
      ) {
        skippedTxCount += 1;
        continue;
      }
      seenTxIds.add(norm.id);
      transactionsList.push(norm);
    }

    const rawRecurring = Array.isArray(finObj.recurring)
      ? finObj.recurring
      : [];
    const recurringList: RecurringRule[] = [];
    const seenRuleIds = new Set<string>();
    let skippedRuleCount = 0;
    for (const rawRule of rawRecurring) {
      const norm = normalizeRecurringRule(rawRule);
      if (
        !norm ||
        seenRuleIds.has(norm.id) ||
        !validAccountIds.has(norm.accountId)
      ) {
        skippedRuleCount += 1;
        continue;
      }
      seenRuleIds.add(norm.id);
      recurringList.push(norm);
    }

    if (skippedAccountCount > 0) {
      warnings.push(
        `Skipped ${skippedAccountCount} invalid or duplicate finance ${skippedAccountCount === 1 ? "account" : "accounts"}.`
      );
    }
    if (skippedTxCount > 0) {
      warnings.push(
        `Skipped ${skippedTxCount} invalid, duplicate, or orphan finance ${skippedTxCount === 1 ? "transaction" : "transactions"}.`
      );
    }
    if (skippedRuleCount > 0) {
      warnings.push(
        `Skipped ${skippedRuleCount} invalid, duplicate, or orphan recurring ${skippedRuleCount === 1 ? "rule" : "rules"}.`
      );
    }

    finance = {
      accounts: repairedAccounts,
      transactions: transactionsList,
      recurring: recurringList,
      lastCurrency:
        normalizeCurrency(finObj.lastCurrency) ?? DEFAULT_CURRENCY,
      includeSubAccounts: finObj.includeSubAccounts !== false,
    };
  }

  // Optional Todos domain (v3+)
  let todos: WorkspaceTodosExport | undefined;
  if (obj.todos !== undefined) {
    if (
      !obj.todos ||
      typeof obj.todos !== "object" ||
      Array.isArray(obj.todos)
    ) {
      return {
        ok: false,
        error: 'Invalid export file: "todos" must be an object.',
      };
    }
    const todosObj = obj.todos as Record<string, unknown>;
    for (const key of [
      "projects",
      "sections",
      "labels",
      "tasks",
      "completionLog",
    ] as const) {
      if (todosObj[key] !== undefined && !Array.isArray(todosObj[key])) {
        return {
          ok: false,
          error: `Invalid export file: "todos.${key}" must be an array.`,
        };
      }
    }

    const rawProjects = Array.isArray(todosObj.projects)
      ? todosObj.projects
      : [];
    const projectsList: TodoProject[] = [];
    const seenProjectIds = new Set<string>();
    let skippedProjects = 0;
    for (const rawProj of rawProjects) {
      const norm = normalizeProject(rawProj);
      if (!norm || seenProjectIds.has(norm.id)) {
        skippedProjects += 1;
        continue;
      }
      seenProjectIds.add(norm.id);
      projectsList.push(norm);
    }
    const repairedProjects = repairProjectHierarchy(projectsList);
    const validProjectIds = new Set(repairedProjects.map((p) => p.id));

    const rawSections = Array.isArray(todosObj.sections)
      ? todosObj.sections
      : [];
    const sectionsList: TodoSection[] = [];
    const seenSectionIds = new Set<string>();
    for (const rawSec of rawSections) {
      const norm = normalizeSection(rawSec);
      if (
        !norm ||
        seenSectionIds.has(norm.id) ||
        !validProjectIds.has(norm.projectId)
      ) {
        continue;
      }
      seenSectionIds.add(norm.id);
      sectionsList.push(norm);
    }
    const sectionById = new Map(sectionsList.map((s) => [s.id, s]));

    const rawLabels = Array.isArray(todosObj.labels) ? todosObj.labels : [];
    const labelsMap = new Map<string, TodoLabel>();
    for (const rawLbl of rawLabels) {
      const norm = normalizeLabel(rawLbl);
      if (norm && !labelsMap.has(norm.name)) {
        labelsMap.set(norm.name, norm);
      }
    }

    const rawTasks = Array.isArray(todosObj.tasks) ? todosObj.tasks : [];
    const tasksList: TodoTask[] = [];
    const seenTaskIds = new Set<string>();
    let skippedTasks = 0;
    for (const rawTask of rawTasks) {
      const norm = normalizeTask(rawTask);
      if (
        !norm ||
        seenTaskIds.has(norm.id) ||
        (norm.projectId !== null && !validProjectIds.has(norm.projectId))
      ) {
        skippedTasks += 1;
        continue;
      }
      seenTaskIds.add(norm.id);
      tasksList.push(norm);
    }

    const rawLogs = Array.isArray(todosObj.completionLog)
      ? todosObj.completionLog
      : [];
    const logsList: TodoCompletionLog[] = [];
    const seenLogIds = new Set<string>();
    for (const rawLog of rawLogs) {
      const norm = normalizeCompletionLog(rawLog);
      if (
        !norm ||
        seenLogIds.has(norm.id) ||
        (norm.projectId !== null && !validProjectIds.has(norm.projectId))
      ) {
        continue;
      }
      seenLogIds.add(norm.id);
      logsList.push(norm);
    }

    if (skippedProjects > 0) {
      warnings.push(
        `Skipped ${skippedProjects} invalid or duplicate todo ${skippedProjects === 1 ? "project" : "projects"}.`
      );
    }
    if (skippedTasks > 0) {
      warnings.push(
        `Skipped ${skippedTasks} invalid, duplicate, or orphan todo ${skippedTasks === 1 ? "task" : "tasks"}.`
      );
    }

    todos = {
      projects: repairedProjects,
      sections: sectionsList,
      labels: [...labelsMap.values()],
      tasks: repairTaskLinks(tasksList, validProjectIds, sectionById),
      completionLog: logsList,
    };
  }

  // Optional Agent domain (v2+)
  let agent: WorkspaceAgentExport | undefined;
  if (obj.agent !== undefined) {
    if (
      !obj.agent ||
      typeof obj.agent !== "object" ||
      Array.isArray(obj.agent)
    ) {
      return {
        ok: false,
        error: 'Invalid export file: "agent" must be an object.',
      };
    }
    const agentObj = obj.agent as Record<string, unknown>;
    if (
      agentObj.sessions !== undefined &&
      !Array.isArray(agentObj.sessions)
    ) {
      return {
        ok: false,
        error: 'Invalid export file: "agent.sessions" must be an array.',
      };
    }
    const rawSessions = Array.isArray(agentObj.sessions)
      ? agentObj.sessions
      : [];
    const sessions = normalizeAgentSessions(rawSessions);
    const skippedSessionCount = rawSessions.length - sessions.length;
    if (skippedSessionCount > 0) {
      warnings.push(
        `Skipped ${skippedSessionCount} invalid or duplicate agent ${skippedSessionCount === 1 ? "session" : "sessions"}.`
      );
    }
    agent = {
      config: normalizeHermesConfig(agentObj.config),
      sessions,
    };
  }

  // Optional Theme preference (v2+)
  let theme: ThemePreference | undefined;
  if (obj.theme !== undefined) {
    if (
      obj.theme === "light" ||
      obj.theme === "system" ||
      obj.theme === "dark"
    ) {
      theme = obj.theme;
    } else {
      warnings.push(
        `Ignored unsupported theme value "${String(obj.theme)}".`
      );
    }
  }

  if (
    docs.length === 0 &&
    databases.length === 0 &&
    !finance &&
    !todos &&
    !agent &&
    !theme
  ) {
    return {
      ok: false,
      error: "This file does not contain any valid workspace data.",
    };
  }

  const trashedDocCount = docs.filter((doc) => Boolean(doc.trashedAt)).length;
  const financeTrashedAccountCount = finance
    ? finance.accounts.filter((acc) => Boolean(acc.trashedAt)).length
    : 0;
  const todoTrashedProjectCount = todos
    ? todos.projects.filter((p) => Boolean(p.trashedAt)).length
    : 0;

  return {
    ok: true,
    data: {
      bundle: {
        format: WORKSPACE_EXPORT_FORMAT,
        schemaVersion: WORKSPACE_EXPORT_SCHEMA_VERSION,
        exportedAt:
          typeof obj.exportedAt === "string"
            ? obj.exportedAt
            : new Date().toISOString(),
        docs,
        databases,
        ...(finance ? { finance } : {}),
        ...(todos ? { todos } : {}),
        ...(agent ? { agent } : {}),
        ...(theme ? { theme } : {}),
      },
      docCount: docs.length,
      trashedDocCount,
      databaseCount: databases.length,
      financeAccountCount: finance ? finance.accounts.length : 0,
      financeTrashedAccountCount,
      financeTransactionCount: finance ? finance.transactions.length : 0,
      financeRecurringCount: finance ? finance.recurring.length : 0,
      todoProjectCount: todos ? todos.projects.length : 0,
      todoTrashedProjectCount,
      todoTaskCount: todos ? todos.tasks.length : 0,
      agentSessionCount: agent ? agent.sessions.length : 0,
      hasFinance: Boolean(finance),
      hasTodos: Boolean(todos),
      hasAgent: Boolean(agent),
      hasTheme: theme !== undefined,
      skippedDocCount,
      skippedDatabaseCount,
      warnings,
    },
  };
}

function collectSyncGroupIdsFromBlocks(
  blocks: DocBlock[],
  target: Set<string>
) {
  for (const block of blocks) {
    if (block.syncGroupId) {
      target.add(block.syncGroupId);
    }
    if (block.type === "columns" && Array.isArray(block.columns)) {
      for (const col of block.columns) {
        collectSyncGroupIdsFromBlocks(col, target);
      }
    }
  }
}

function remapImportedBlocks(
  blocks: DocBlock[],
  docIdMap: Map<string, string>,
  dbIdMap: Map<string, string>,
  syncGroupIdMap: Map<string, string>,
  currentDocIds: ReadonlySet<string>,
  currentDbIds: ReadonlySet<string>
): DocBlock[] {
  return blocks.map((block) => {
    const nextBlock: DocBlock = {
      ...block,
      id: createId(),
      ...(block.todoEmbed ? { todoEmbed: { ...block.todoEmbed } } : {}),
    };

    if (block.syncGroupId) {
      nextBlock.syncGroupId =
        syncGroupIdMap.get(block.syncGroupId) ?? block.syncGroupId;
    }

    if (block.databaseId) {
      const mappedDb = dbIdMap.get(block.databaseId);
      if (mappedDb) {
        nextBlock.databaseId = mappedDb;
      } else if (!currentDbIds.has(block.databaseId)) {
        delete nextBlock.databaseId;
      }
    }

    if (block.linkedDocId) {
      const mappedDoc = docIdMap.get(block.linkedDocId);
      if (mappedDoc) {
        nextBlock.linkedDocId = mappedDoc;
      } else if (!currentDocIds.has(block.linkedDocId)) {
        delete nextBlock.linkedDocId;
      }
    }

    if (block.type === "columns" && Array.isArray(block.columns)) {
      nextBlock.columns = block.columns.map((col) =>
        remapImportedBlocks(
          col,
          docIdMap,
          dbIdMap,
          syncGroupIdMap,
          currentDocIds,
          currentDbIds
        )
      );
    }

    return nextBlock;
  });
}

function cleanDanglingBlockLinks(
  blocks: DocBlock[],
  docIdSet: ReadonlySet<string>,
  dbIdSet: ReadonlySet<string>
): DocBlock[] {
  return blocks.map((block) => {
    const nextBlock: DocBlock = { ...block };
    if (nextBlock.databaseId && !dbIdSet.has(nextBlock.databaseId)) {
      delete nextBlock.databaseId;
    }
    if (nextBlock.linkedDocId && !docIdSet.has(nextBlock.linkedDocId)) {
      delete nextBlock.linkedDocId;
    }
    if (nextBlock.type === "columns" && Array.isArray(nextBlock.columns)) {
      nextBlock.columns = nextBlock.columns.map((col) =>
        cleanDanglingBlockLinks(col, docIdSet, dbIdSet)
      );
    }
    return nextBlock;
  });
}

/** Ensures parentId, databaseId, block references, and relation links remain valid and cycle-free. */
export function repairWorkspaceReferences(
  docs: Doc[],
  databases: InlineDatabase[]
): { docs: Doc[]; databases: InlineDatabase[] } {
  const docIdSet = new Set(docs.map((doc) => doc.id));
  const validDatabases = databases.filter((db) => docIdSet.has(db.parentDocId));
  const dbIdSet = new Set(validDatabases.map((db) => db.id));

  const repairedDatabases = validDatabases.map((db) => ({
    ...db,
    properties: db.properties.map((prop) => {
      if (prop.relationDatabaseId && !dbIdSet.has(prop.relationDatabaseId)) {
        const nextProp = { ...prop };
        delete nextProp.relationDatabaseId;
        return nextProp;
      }
      return prop;
    }),
  }));

  const repairedDocs = docs.map((doc) => {
    const nextDoc: Doc = {
      ...doc,
      blocks: cleanDanglingBlockLinks(doc.blocks, docIdSet, dbIdSet),
    };
    if (
      nextDoc.parentId &&
      (!docIdSet.has(nextDoc.parentId) || nextDoc.parentId === nextDoc.id)
    ) {
      delete nextDoc.parentId;
    }
    if (nextDoc.databaseId && !dbIdSet.has(nextDoc.databaseId)) {
      delete nextDoc.databaseId;
    }
    return nextDoc;
  });

  // Break any parent cycles deterministically while preserving acyclic ancestry.
  for (let i = 0; i < repairedDocs.length; i += 1) {
    const doc = repairedDocs[i];
    if (doc.parentId && isDocDescendant(repairedDocs, doc.parentId, doc.id)) {
      const nextDoc = { ...doc };
      delete nextDoc.parentId;
      repairedDocs[i] = nextDoc;
    }
  }

  return { docs: repairedDocs, databases: repairedDatabases };
}

/** Computes the next workspace state for either "merge" (remap imported IDs) or "replace". */
export function prepareImportState(
  currentDocs: Doc[],
  currentDatabases: InlineDatabase[],
  bundle: WorkspaceExportBundle,
  mode: ImportMode
): { docs: Doc[]; databases: InlineDatabase[] } {
  if (mode === "replace") {
    return repairWorkspaceReferences(bundle.docs, bundle.databases);
  }

  const currentDocIds = new Set(currentDocs.map((doc) => doc.id));
  const currentDbIds = new Set(currentDatabases.map((db) => db.id));
  const docIdMap = new Map<string, string>();
  const dbIdMap = new Map<string, string>();
  const syncGroupIdMap = new Map<string, string>();
  const rawSyncIds = new Set<string>();

  for (const doc of bundle.docs) {
    docIdMap.set(doc.id, createId());
    collectSyncGroupIdsFromBlocks(doc.blocks, rawSyncIds);
  }
  for (const syncId of rawSyncIds) {
    syncGroupIdMap.set(syncId, createId());
  }
  for (const db of bundle.databases) {
    dbIdMap.set(db.id, createId());
  }

  const remappedDbs: InlineDatabase[] = bundle.databases.map((db) => ({
    ...db,
    id: dbIdMap.get(db.id) ?? createId(),
    parentDocId: docIdMap.get(db.parentDocId) ?? db.parentDocId,
    properties: db.properties.map((prop) => {
      if (!prop.relationDatabaseId) return prop;
      const mappedTarget = dbIdMap.get(prop.relationDatabaseId);
      if (mappedTarget) {
        return { ...prop, relationDatabaseId: mappedTarget };
      }
      if (currentDbIds.has(prop.relationDatabaseId)) {
        return prop;
      }
      const nextProp = { ...prop };
      delete nextProp.relationDatabaseId;
      return nextProp;
    }),
  }));

  const dbSchemaByNewId = new Map(remappedDbs.map((db) => [db.id, db]));

  const remappedDocs: Doc[] = bundle.docs.map((doc) => {
    const nextId = docIdMap.get(doc.id) ?? createId();
    const nextDbId = doc.databaseId
      ? (dbIdMap.get(doc.databaseId) ??
        (currentDbIds.has(doc.databaseId) ? doc.databaseId : undefined))
      : undefined;
    const nextParentId = doc.parentId
      ? (docIdMap.get(doc.parentId) ??
        (currentDocIds.has(doc.parentId) ? doc.parentId : undefined))
      : undefined;

    let nextProperties = doc.properties;
    if (nextProperties && nextDbId) {
      const schema = dbSchemaByNewId.get(nextDbId);
      if (schema) {
        const relationPropIds = new Set(
          schema.properties
            .filter((prop) => prop.type === "relation")
            .map((prop) => prop.id)
        );
        if (relationPropIds.size > 0) {
          const updatedProps = { ...nextProperties };
          for (const propId of relationPropIds) {
            const val = updatedProps[propId];
            if (Array.isArray(val)) {
              updatedProps[propId] = val.map((id) => docIdMap.get(id) ?? id);
            }
          }
          nextProperties = updatedProps;
        }
      }
    }

    const nextDoc: Doc = {
      ...doc,
      id: nextId,
      blocks: remapImportedBlocks(
        doc.blocks,
        docIdMap,
        dbIdMap,
        syncGroupIdMap,
        currentDocIds,
        currentDbIds
      ),
    };
    if (nextParentId) {
      nextDoc.parentId = nextParentId;
    } else {
      delete nextDoc.parentId;
    }
    if (nextDbId) {
      nextDoc.databaseId = nextDbId;
    } else {
      delete nextDoc.databaseId;
    }
    if (nextProperties) {
      nextDoc.properties = nextProperties;
    }
    return nextDoc;
  });

  return repairWorkspaceReferences(
    [...currentDocs, ...remappedDocs],
    [...currentDatabases, ...remappedDbs]
  );
}
