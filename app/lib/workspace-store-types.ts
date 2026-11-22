import type { InlineDatabase } from "./database-types";
import {
  normalizeDatabase,
  normalizeDoc,
  type NormalizeDocOptions,
} from "./docs-storage";
import {
  repairAccountHierarchy,
  repairWorkspaceReferences,
  WORKSPACE_EXPORT_FORMAT,
  WORKSPACE_EXPORT_SCHEMA_VERSION,
  type WorkspaceAgentExport,
  type WorkspaceFinanceExport,
  type WorkspaceTodosExport,
} from "./docs-transfer";
import type { Doc } from "./docs-utils";
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
  DEFAULT_HERMES_CONFIG,
  normalizeAgentSessions,
  normalizeHermesConfig,
} from "./hermes-client";
import {
  normalizeLabel,
  normalizeLabelName,
  normalizeProject,
  normalizeSection,
  normalizeTask,
  repairProjectHierarchy,
  type TodoLabel,
  type TodoProject,
  type TodoSection,
  type TodoTask,
} from "./todos-utils";

export interface ServerWorkspaceState {
  format: typeof WORKSPACE_EXPORT_FORMAT;
  schemaVersion: typeof WORKSPACE_EXPORT_SCHEMA_VERSION;
  updatedAt: string;
  docs: Doc[];
  databases: InlineDatabase[];
  finance: WorkspaceFinanceExport;
  todos: WorkspaceTodosExport;
  agent: WorkspaceAgentExport;
}

const DEFAULT_UPDATED_AT = "2026-11-22T00:00:00.000Z";

export function createEmptyWorkspaceState(
  updatedAt = DEFAULT_UPDATED_AT
): ServerWorkspaceState {
  return {
    format: WORKSPACE_EXPORT_FORMAT,
    schemaVersion: WORKSPACE_EXPORT_SCHEMA_VERSION,
    updatedAt,
    docs: [],
    databases: [],
    finance: {
      accounts: [],
      transactions: [],
      recurring: [],
      lastCurrency: DEFAULT_CURRENCY,
      includeSubAccounts: true,
    },
    todos: {
      projects: [],
      sections: [],
      labels: [],
      tasks: [],
    },
    agent: {
      config: { ...DEFAULT_HERMES_CONFIG },
      sessions: [],
    },
  };
}

function repairTodoTaskRefs(
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

/** Validates and normalizes an untrusted workspace state object for server or client use. */
export function normalizeServerWorkspaceState(
  raw: unknown,
  options?: NormalizeDocOptions
): ServerWorkspaceState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return createEmptyWorkspaceState();
  }

  const obj = raw as Record<string, unknown>;
  const updatedAt =
    typeof obj.updatedAt === "string" && obj.updatedAt.trim()
      ? obj.updatedAt
      : DEFAULT_UPDATED_AT;

  // Docs & Databases
  const docsRaw = Array.isArray(obj.docs) ? obj.docs : [];
  const docsList: Doc[] = [];
  const seenDocIds = new Set<string>();
  for (const rawDoc of docsRaw) {
    const doc = normalizeDoc(rawDoc, options);
    if (!doc || seenDocIds.has(doc.id)) continue;
    seenDocIds.add(doc.id);
    docsList.push(doc);
  }

  const dbsRaw = Array.isArray(obj.databases) ? obj.databases : [];
  const dbsList: InlineDatabase[] = [];
  const seenDbIds = new Set<string>();
  for (const rawDb of dbsRaw) {
    const db = normalizeDatabase(rawDb);
    if (!db || seenDbIds.has(db.id)) continue;
    seenDbIds.add(db.id);
    dbsList.push(db);
  }

  const repairedDocsState = repairWorkspaceReferences(docsList, dbsList);

  // Finance
  const finObj =
    obj.finance && typeof obj.finance === "object" && !Array.isArray(obj.finance)
      ? (obj.finance as Record<string, unknown>)
      : {};
  const accountsList: FinanceAccount[] = [];
  const seenAccountIds = new Set<string>();
  for (const rawAcc of Array.isArray(finObj.accounts) ? finObj.accounts : []) {
    const acc = normalizeAccount(rawAcc);
    if (!acc || seenAccountIds.has(acc.id)) continue;
    seenAccountIds.add(acc.id);
    accountsList.push(acc);
  }
  const repairedAccounts = repairAccountHierarchy(accountsList);
  const validAccountIds = new Set(repairedAccounts.map((a) => a.id));

  const txList: FinanceTransaction[] = [];
  const seenTxIds = new Set<string>();
  for (const rawTx of Array.isArray(finObj.transactions)
    ? finObj.transactions
    : []) {
    const tx = normalizeTransaction(rawTx);
    if (!tx || seenTxIds.has(tx.id) || !validAccountIds.has(tx.accountId)) {
      continue;
    }
    seenTxIds.add(tx.id);
    txList.push(tx);
  }

  const recurringList: RecurringRule[] = [];
  const seenRuleIds = new Set<string>();
  for (const rawRule of Array.isArray(finObj.recurring)
    ? finObj.recurring
    : []) {
    const rule = normalizeRecurringRule(rawRule);
    if (
      !rule ||
      seenRuleIds.has(rule.id) ||
      !validAccountIds.has(rule.accountId)
    ) {
      continue;
    }
    seenRuleIds.add(rule.id);
    recurringList.push(rule);
  }

  const finance: WorkspaceFinanceExport = {
    accounts: repairedAccounts,
    transactions: txList,
    recurring: recurringList,
    lastCurrency: normalizeCurrency(finObj.lastCurrency) ?? DEFAULT_CURRENCY,
    includeSubAccounts: finObj.includeSubAccounts !== false,
  };

  // Todos
  const todosObj =
    obj.todos && typeof obj.todos === "object" && !Array.isArray(obj.todos)
      ? (obj.todos as Record<string, unknown>)
      : {};
  const projectsList: TodoProject[] = [];
  const seenProjectIds = new Set<string>();
  for (const rawProj of Array.isArray(todosObj.projects)
    ? todosObj.projects
    : []) {
    const proj = normalizeProject(rawProj);
    if (!proj || seenProjectIds.has(proj.id)) continue;
    seenProjectIds.add(proj.id);
    projectsList.push(proj);
  }
  const repairedProjects = repairProjectHierarchy(projectsList);
  const validProjectIds = new Set(repairedProjects.map((p) => p.id));

  const sectionsList: TodoSection[] = [];
  const seenSectionIds = new Set<string>();
  for (const rawSec of Array.isArray(todosObj.sections)
    ? todosObj.sections
    : []) {
    const sec = normalizeSection(rawSec);
    if (!sec || seenSectionIds.has(sec.id) || !validProjectIds.has(sec.projectId)) {
      continue;
    }
    seenSectionIds.add(sec.id);
    sectionsList.push(sec);
  }
  const sectionById = new Map(sectionsList.map((s) => [s.id, s]));

  const labelByName = new Map<string, TodoLabel>();
  for (const rawLbl of Array.isArray(todosObj.labels) ? todosObj.labels : []) {
    const lbl = normalizeLabel(rawLbl);
    const cleanName = lbl ? normalizeLabelName(lbl.name) : "";
    if (lbl && cleanName && !labelByName.has(cleanName)) {
      labelByName.set(cleanName, { ...lbl, name: cleanName });
    }
  }

  const tasksList: TodoTask[] = [];
  const seenTaskIds = new Set<string>();
  for (const rawTask of Array.isArray(todosObj.tasks) ? todosObj.tasks : []) {
    const task = normalizeTask(rawTask);
    if (
      !task ||
      seenTaskIds.has(task.id) ||
      (task.projectId !== null && !validProjectIds.has(task.projectId))
    ) {
      continue;
    }
    seenTaskIds.add(task.id);
    tasksList.push(task);
  }

  const todos: WorkspaceTodosExport = {
    projects: repairedProjects,
    sections: sectionsList,
    labels: [...labelByName.values()],
    tasks: repairTodoTaskRefs(tasksList, validProjectIds, sectionById),
  };

  // Agent
  const agentObj =
    obj.agent && typeof obj.agent === "object" && !Array.isArray(obj.agent)
      ? (obj.agent as Record<string, unknown>)
      : {};
  const agent: WorkspaceAgentExport = {
    config: normalizeHermesConfig(agentObj.config),
    sessions: normalizeAgentSessions(agentObj.sessions),
  };

  return {
    format: WORKSPACE_EXPORT_FORMAT,
    schemaVersion: WORKSPACE_EXPORT_SCHEMA_VERSION,
    updatedAt,
    docs: repairedDocsState.docs,
    databases: repairedDocsState.databases,
    finance,
    todos,
    agent,
  };
}

/** Returns true only when all workspace domains have no user content and default agent settings. */
export function isWorkspaceStateEmpty(state: ServerWorkspaceState): boolean {
  const hasDocs = state.docs.length > 0 || state.databases.length > 0;
  const hasFinance =
    state.finance.accounts.length > 0 ||
    state.finance.transactions.length > 0 ||
    state.finance.recurring.length > 0;
  const hasTodos =
    state.todos.projects.length > 0 ||
    state.todos.sections.length > 0 ||
    state.todos.labels.length > 0 ||
    state.todos.tasks.length > 0;
  const hasAgentMessages = state.agent.sessions.some(
    (s) => s.messages.length > 0
  );
  const cfg = state.agent.config;
  const hasCustomConfig =
    cfg.baseUrl !== DEFAULT_HERMES_CONFIG.baseUrl ||
    cfg.apiKey !== DEFAULT_HERMES_CONFIG.apiKey ||
    cfg.model !== DEFAULT_HERMES_CONFIG.model ||
    cfg.routingMode !== DEFAULT_HERMES_CONFIG.routingMode ||
    cfg.endpointMode !== DEFAULT_HERMES_CONFIG.endpointMode ||
    cfg.systemPrompt !== DEFAULT_HERMES_CONFIG.systemPrompt;

  return !(
    hasDocs ||
    hasFinance ||
    hasTodos ||
    hasAgentMessages ||
    hasCustomConfig
  );
}