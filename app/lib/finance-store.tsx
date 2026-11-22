"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  type ImportMode,
  prepareFinanceImport,
  type WorkspaceFinanceExport,
} from "./docs-transfer";
import { createId } from "./docs-utils";
import {
  buildTransaction,
  collectAccountSubtree,
  buildOccurrenceTransaction,
  type DueOccurrence,
  firstIndexAfter,
  generateDueTransactions,
  listDueOccurrences,
  markOccurrenceHandled,
  recurringTransactionId,
  normalizeRecurringRule,
  normalizeTags,
  type RecurringInput,
  type RecurringRule,
  DEFAULT_CURRENCY,
  type FinanceAccount,
  FINANCE_STORAGE_KEY,
  type FinanceTransaction,
  normalizeAccount,
  normalizeCurrency,
  normalizeTransaction,
  type TransactionInput,
} from "./finance-utils";

type AccountPatch = Partial<Pick<FinanceAccount, "name" | "icon">>;

export type TransactionDialogRequest =
  | { mode: "new"; accountId?: string; due?: DueOccurrence }
  | { mode: "edit"; transaction: FinanceTransaction }
  | { mode: "edit-rule"; rule: RecurringRule };

interface FinanceContextValue {
  hydrated: boolean;
  /** Active accounts (not trashed and not inside a trashed account). */
  accounts: FinanceAccount[];
  /** Transactions belonging to active accounts. */
  transactions: FinanceTransaction[];
  /** Accounts explicitly moved to trash. */
  trashedAccounts: FinanceAccount[];
  /** Most recently used currency, assumed for the next transaction. */
  lastCurrency: string;
  /** Every currency used across all recorded transactions. */
  usedCurrencies: string[];
  /** Every tag in use, most frequent first. */
  usedTags: string[];
  /** Recurring rules on active accounts. */
  recurringRules: RecurringRule[];
  getRecurringRule: (id: string) => RecurringRule | undefined;
  addRecurringRule: (input: RecurringInput) => RecurringRule;
  /** Updates the template and restarts the schedule from `input.startAt`. */
  updateRecurringRule: (id: string, input: RecurringInput) => void;
  setRecurringPaused: (id: string, paused: boolean) => void;
  /** Stops a recurring rule; already generated transactions are kept. */
  deleteRecurringRule: (id: string) => void;
  /** Due occurrences of confirm-first rules waiting for the user, oldest first. */
  dueOccurrences: DueOccurrence[];
  /** Records a due occurrence as a transaction, optionally with edited details. */
  confirmRecurringOccurrence: (
    ruleId: string,
    occurrence: string,
    input?: TransactionInput
  ) => void;
  /** Dismisses a due occurrence without recording it. */
  skipRecurringOccurrence: (ruleId: string, occurrence: string) => void;
  /** Whether account views roll up sub-account transactions. */
  includeSubAccounts: boolean;
  setIncludeSubAccounts: (value: boolean) => void;
  getAccount: (id: string) => FinanceAccount | undefined;
  /** Looks up any account, including trashed ones. */
  getAnyAccount: (id: string) => FinanceAccount | undefined;
  createAccount: (parentId?: string) => FinanceAccount;
  updateAccount: (id: string, patch: AccountPatch) => void;
  moveAccountToTrash: (id: string) => void;
  restoreAccounts: (ids: string[]) => number;
  /** Permanently removes accounts, their sub-accounts, and all their transactions. */
  permanentlyDeleteAccounts: (ids: string[]) => {
    accounts: number;
    transactions: number;
  };
  addTransaction: (input: TransactionInput) => FinanceTransaction;
  updateTransaction: (id: string, input: TransactionInput) => void;
  deleteTransaction: (id: string) => void;
  transactionDialog: TransactionDialogRequest | null;
  openTransactionDialog: (request: TransactionDialogRequest) => void;
  closeTransactionDialog: () => void;
  getExportSnapshot: () => WorkspaceFinanceExport;
  importFinance: (
    data: WorkspaceFinanceExport,
    mode: ImportMode
  ) => {
    accountsCount: number;
    transactionsCount: number;
    recurringCount: number;
  };
}

interface StoredFinance {
  version: 1;
  accounts: FinanceAccount[];
  transactions: FinanceTransaction[];
  lastCurrency?: string;
  includeSubAccounts?: boolean;
  recurring?: RecurringRule[];
}

const FinanceContext = createContext<FinanceContextValue | null>(null);

/** Provides finance accounts and transactions persisted to localStorage. */
export function FinanceProvider({ children }: { children: React.ReactNode }) {
  const [allAccounts, setAllAccounts] = useState<FinanceAccount[]>([]);
  const [allTransactions, setAllTransactions] = useState<FinanceTransaction[]>([]);
  const [allRecurring, setAllRecurring] = useState<RecurringRule[]>([]);
  /** Clock used to decide which confirm-first occurrences are due; ticks every minute. */
  const [nowMs, setNowMs] = useState(0);
  const [lastCurrency, setLastCurrency] = useState(DEFAULT_CURRENCY);
  const [includeSubAccounts, setIncludeSubAccounts] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [transactionDialog, setTransactionDialog] =
    useState<TransactionDialogRequest | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(FINANCE_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<StoredFinance>;
        const loadedAccounts = Array.isArray(parsed.accounts)
          ? parsed.accounts
              .map(normalizeAccount)
              .filter((a): a is FinanceAccount => a !== null)
          : [];
        const accountIds = new Set(loadedAccounts.map((a) => a.id));
        const loadedTx = Array.isArray(parsed.transactions)
          ? parsed.transactions
              .map(normalizeTransaction)
              .filter(
                (t): t is FinanceTransaction =>
                  t !== null && accountIds.has(t.accountId)
              )
          : [];
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setAllAccounts(loadedAccounts);
        setAllTransactions(loadedTx);
        setLastCurrency(
          normalizeCurrency(parsed.lastCurrency) ?? DEFAULT_CURRENCY
        );
        setIncludeSubAccounts(parsed.includeSubAccounts !== false);
        setAllRecurring(
          Array.isArray(parsed.recurring)
            ? parsed.recurring
                .map(normalizeRecurringRule)
                .filter(
                  (r): r is RecurringRule =>
                    r !== null && accountIds.has(r.accountId)
                )
            : []
        );
      }
    } catch {
      // Ignore malformed stored JSON
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      const payload: StoredFinance = {
        version: 1,
        accounts: allAccounts,
        transactions: allTransactions,
        lastCurrency,
        includeSubAccounts,
        recurring: allRecurring,
      };
      localStorage.setItem(FINANCE_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore quota or storage restriction errors
    }
  }, [
    allAccounts,
    allTransactions,
    allRecurring,
    lastCurrency,
    includeSubAccounts,
    hydrated,
  ]);

  const allById = useMemo(
    () => new Map(allAccounts.map((a) => [a.id, a])),
    [allAccounts]
  );

  // An account is hidden when it or any ancestor is in the trash.
  const hiddenIds = useMemo(() => {
    const hidden = new Set<string>();
    for (const account of allAccounts) {
      if (account.trashedAt) {
        for (const id of collectAccountSubtree(allAccounts, account.id)) {
          hidden.add(id);
        }
      }
    }
    return hidden;
  }, [allAccounts]);

  const accounts = useMemo(
    () => allAccounts.filter((a) => !hiddenIds.has(a.id)),
    [allAccounts, hiddenIds]
  );
  const trashedAccounts = useMemo(
    () => allAccounts.filter((a) => a.trashedAt),
    [allAccounts]
  );
  const transactions = useMemo(
    () => allTransactions.filter((t) => !hiddenIds.has(t.accountId)),
    [allTransactions, hiddenIds]
  );

  const recurringRules = useMemo(
    () => allRecurring.filter((r) => !hiddenIds.has(r.accountId)),
    [allRecurring, hiddenIds]
  );

  // Generate due recurring transactions now, every minute, and when the tab regains focus.
  // Transaction ids are derived from the occurrence time, so repeated runs never duplicate.
  useEffect(() => {
    if (!hydrated) return;
    const run = () => {
      const now = new Date();
      setNowMs(now.getTime());
      const generated: FinanceTransaction[] = [];
      const advanced = new Map<string, { nextIndex: number; version: string }>();
      for (const rule of allRecurring) {
        // Only auto-add rules record themselves; others wait in the due list.
        if (!rule.autoAdd || hiddenIds.has(rule.accountId)) continue;
        const result = generateDueTransactions(rule, now);
        if (result.transactions.length === 0) continue;
        generated.push(...result.transactions);
        advanced.set(rule.id, { nextIndex: result.nextIndex, version: rule.updatedAt });
      }
      if (generated.length === 0) return;
      setAllRecurring((prev) =>
        prev.map((r) => {
          const adv = advanced.get(r.id);
          // Skip if the rule was edited since this run computed its occurrences.
          if (!adv || adv.version !== r.updatedAt) return r;
          return { ...r, nextIndex: Math.max(r.nextIndex, adv.nextIndex) };
        })
      );
      setAllTransactions((prev) => {
        const existing = new Set(prev.map((tx) => tx.id));
        const fresh = generated.filter((tx) => !existing.has(tx.id));
        return fresh.length > 0 ? [...prev, ...fresh] : prev;
      });
    };
    run();
    const timer = window.setInterval(run, 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [allRecurring, hiddenIds, hydrated]);

  const dueOccurrences = useMemo(() => {
    if (!nowMs) return [];
    const now = new Date(nowMs);
    const recordedIds = new Set(allTransactions.map((tx) => tx.id));
    const out: DueOccurrence[] = [];
    for (const rule of allRecurring) {
      if (rule.autoAdd || rule.paused || hiddenIds.has(rule.accountId)) continue;
      for (const occ of listDueOccurrences(rule, now, 50)) {
        // Already recorded (e.g. confirmed before the series was edited).
        if (recordedIds.has(recurringTransactionId(rule.id, occ))) continue;
        out.push({ rule, occurrence: occ.toISOString() });
      }
    }
    return out.sort((a, b) => a.occurrence.localeCompare(b.occurrence));
  }, [allRecurring, allTransactions, hiddenIds, nowMs]);

  const confirmRecurringOccurrence = useCallback(
    (ruleId: string, occurrence: string, input?: TransactionInput) => {
      const rule = allRecurring.find((r) => r.id === ruleId);
      if (!rule) return;
      const nowIso = new Date().toISOString();
      const base = buildOccurrenceTransaction(rule, new Date(occurrence), nowIso);
      const tx: FinanceTransaction = input
        ? {
            ...buildTransaction(input),
            id: base.id,
            recordedAt: nowIso,
            recurringId: rule.id,
          }
        : base;
      setAllTransactions((prev) =>
        prev.some((t) => t.id === tx.id) ? prev : [...prev, tx]
      );
      setAllRecurring((prev) =>
        prev.map((r) => (r.id === ruleId ? markOccurrenceHandled(r, occurrence) : r))
      );
      setLastCurrency(tx.currency);
    },
    [allRecurring]
  );

  const skipRecurringOccurrence = useCallback((ruleId: string, occurrence: string) => {
    setAllRecurring((prev) =>
      prev.map((r) => (r.id === ruleId ? markOccurrenceHandled(r, occurrence) : r))
    );
  }, []);

  const usedTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const tx of allTransactions) {
      for (const tag of tx.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    for (const rule of allRecurring) {
      for (const tag of rule.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([tag]) => tag);
  }, [allRecurring, allTransactions]);

  const usedCurrencies = useMemo(() => {
    const set = new Set<string>();
    for (const tx of allTransactions) set.add(tx.currency);
    return [...set].sort();
  }, [allTransactions]);

  const getAccount = useCallback(
    (id: string) => (hiddenIds.has(id) ? undefined : allById.get(id)),
    [allById, hiddenIds]
  );
  const getAnyAccount = useCallback((id: string) => allById.get(id), [allById]);

  const createAccount = useCallback(
    (parentId?: string) => {
      const parent = parentId ? allById.get(parentId) : undefined;
      const account: FinanceAccount = {
        id: createId(),
        name: "",
        createdAt: new Date().toISOString(),
        ...(parent ? { parentId: parent.id } : {}),
      };
      setAllAccounts((prev) => [...prev, account]);
      return account;
    },
    [allById]
  );

  const updateAccount = useCallback((id: string, patch: AccountPatch) => {
    setAllAccounts((prev) =>
      prev.map((account) => {
        if (account.id !== id) return account;
        const next: FinanceAccount = { ...account };
        if (patch.name !== undefined) next.name = patch.name;
        if ("icon" in patch) {
          if (patch.icon) next.icon = patch.icon;
          else delete next.icon;
        }
        return next;
      })
    );
  }, []);

  const moveAccountToTrash = useCallback((id: string) => {
    const now = new Date().toISOString();
    setAllAccounts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, trashedAt: now } : a))
    );
  }, []);

  const restoreAccounts = useCallback(
    (ids: string[]) => {
      const restoreSet = new Set(ids);
      const byId = new Map(allAccounts.map((a) => [a.id, a]));
      const stillTrashed = (id: string) =>
        !restoreSet.has(id) && Boolean(byId.get(id)?.trashedAt);
      // True when the account or any of its ancestors remains in the trash.
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
      const next = allAccounts.map((account) => {
        if (!restoreSet.has(account.id) || !account.trashedAt) return account;
        restored += 1;
        // Re-home under the nearest ancestor that stays active (or the root).
        let parentId = account.parentId;
        const seen = new Set<string>();
        while (parentId && !seen.has(parentId) && chainHasTrashed(parentId)) {
          seen.add(parentId);
          parentId = byId.get(parentId)?.parentId;
        }
        if (parentId && !byId.has(parentId)) parentId = undefined;
        const { trashedAt: _t, parentId: _p, ...base } = account;
        void _t;
        void _p;
        return parentId ? { ...base, parentId } : base;
      });
      setAllAccounts(next);
      return restored;
    },
    [allAccounts]
  );

  const permanentlyDeleteAccounts = useCallback(
    (ids: string[]) => {
      const removeIds = new Set<string>();
      for (const id of ids) {
        for (const sub of collectAccountSubtree(allAccounts, id)) {
          removeIds.add(sub);
        }
      }
      const removedTx = allTransactions.filter((t) =>
        removeIds.has(t.accountId)
      ).length;
      setAllAccounts((prev) => prev.filter((a) => !removeIds.has(a.id)));
      setAllTransactions((prev) =>
        prev.filter((t) => !removeIds.has(t.accountId))
      );
      setAllRecurring((prev) => prev.filter((r) => !removeIds.has(r.accountId)));
      return { accounts: removeIds.size, transactions: removedTx };
    },
    [allAccounts, allTransactions]
  );

  const addTransaction = useCallback((input: TransactionInput) => {
    const tx = buildTransaction(input);
    setAllTransactions((prev) => [...prev, tx]);
    setLastCurrency(tx.currency);
    return tx;
  }, []);

  const updateTransaction = useCallback(
    (id: string, input: TransactionInput) => {
      setAllTransactions((prev) =>
        prev.map((tx) => {
          if (tx.id !== id) return tx;
          const rebuilt = buildTransaction(input);
          return {
            ...rebuilt,
            id: tx.id,
            recordedAt: tx.recordedAt,
            ...(tx.recurringId ? { recurringId: tx.recurringId } : {}),
          };
        })
      );
      const currency = normalizeCurrency(input.currency);
      if (currency) setLastCurrency(currency);
    },
    []
  );

  const deleteTransaction = useCallback((id: string) => {
    setAllTransactions((prev) => prev.filter((tx) => tx.id !== id));
  }, []);

  const getRecurringRule = useCallback(
    (id: string) => allRecurring.find((r) => r.id === id),
    [allRecurring]
  );

  const buildRuleFields = (input: RecurringInput) => {
    const template = buildTransaction({ ...input, occurredAt: input.startAt });
    return {
      accountId: template.accountId,
      name: template.name,
      kind: template.kind,
      amount: template.amount,
      fee: template.fee,
      currency: template.currency,
      ...(template.note ? { note: template.note } : {}),
      tags: normalizeTags(input.tags),
      frequency: input.frequency,
      interval: Math.max(1, Math.min(999, Math.floor(input.interval) || 1)),
      startAt: template.occurredAt,
      ...(input.endAt ? { endAt: input.endAt } : {}),
      ...(input.autoAdd ? { autoAdd: true } : {}),
    };
  };

  const addRecurringRule = useCallback((input: RecurringInput) => {
    const now = new Date().toISOString();
    const rule: RecurringRule = {
      id: createId(),
      ...buildRuleFields(input),
      nextIndex: 0,
      createdAt: now,
      updatedAt: now,
    };
    setAllRecurring((prev) => [...prev, rule]);
    setLastCurrency(rule.currency);
    return rule;
  }, []);

  const updateRecurringRule = useCallback((id: string, input: RecurringInput) => {
    const now = new Date().toISOString();
    setAllRecurring((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              id: r.id,
              ...buildRuleFields(input),
              nextIndex: 0,
              ...(r.paused ? { paused: true } : {}),
              createdAt: r.createdAt,
              updatedAt: now,
            }
          : r
      )
    );
    const currency = normalizeCurrency(input.currency);
    if (currency) setLastCurrency(currency);
  }, []);

  const setRecurringPaused = useCallback((id: string, paused: boolean) => {
    const now = new Date();
    setAllRecurring((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        if (paused) return { ...r, paused: true, updatedAt: now.toISOString() };
        // Resuming skips occurrences missed while paused.
        const { paused: _p, handledAhead: _h, ...rest } = r;
        void _p;
        void _h;
        return {
          ...rest,
          nextIndex: firstIndexAfter(r, now),
          updatedAt: now.toISOString(),
        };
      })
    );
  }, []);

  const deleteRecurringRule = useCallback((id: string) => {
    setAllRecurring((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const openTransactionDialog = useCallback(
    (request: TransactionDialogRequest) => setTransactionDialog(request),
    []
  );
  const closeTransactionDialog = useCallback(
    () => setTransactionDialog(null),
    []
  );

  const getExportSnapshot = useCallback(
    (): WorkspaceFinanceExport => ({
      accounts: allAccounts,
      transactions: allTransactions,
      recurring: allRecurring,
      lastCurrency,
      includeSubAccounts,
    }),
    [allAccounts, allTransactions, allRecurring, lastCurrency, includeSubAccounts]
  );

  const importFinance = useCallback(
    (data: WorkspaceFinanceExport, mode: ImportMode) => {
      const next = prepareFinanceImport(
        {
          accounts: allAccounts,
          transactions: allTransactions,
          recurring: allRecurring,
          lastCurrency,
          includeSubAccounts,
        },
        data,
        mode
      );

      try {
        const payload: StoredFinance = {
          version: 1,
          accounts: next.accounts,
          transactions: next.transactions,
          lastCurrency: next.lastCurrency,
          includeSubAccounts: next.includeSubAccounts,
          recurring: next.recurring,
        };
        localStorage.setItem(FINANCE_STORAGE_KEY, JSON.stringify(payload));
      } catch {
        // Ignore quota or storage restriction errors
      }

      setAllAccounts(next.accounts);
      setAllTransactions(next.transactions);
      setAllRecurring(next.recurring);
      setLastCurrency(next.lastCurrency);
      setIncludeSubAccounts(next.includeSubAccounts);

      return {
        accountsCount: data.accounts.length,
        transactionsCount: data.transactions.length,
        recurringCount: data.recurring.length,
      };
    },
    [allAccounts, allTransactions, allRecurring, lastCurrency, includeSubAccounts]
  );

  const value = useMemo<FinanceContextValue>(
    () => ({
      hydrated,
      accounts,
      transactions,
      trashedAccounts,
      lastCurrency,
      usedCurrencies,
      usedTags,
      recurringRules,
      getRecurringRule,
      addRecurringRule,
      updateRecurringRule,
      setRecurringPaused,
      deleteRecurringRule,
      dueOccurrences,
      confirmRecurringOccurrence,
      skipRecurringOccurrence,
      includeSubAccounts,
      setIncludeSubAccounts,
      getAccount,
      getAnyAccount,
      createAccount,
      updateAccount,
      moveAccountToTrash,
      restoreAccounts,
      permanentlyDeleteAccounts,
      addTransaction,
      updateTransaction,
      deleteTransaction,
      transactionDialog,
      openTransactionDialog,
      closeTransactionDialog,
      getExportSnapshot,
      importFinance,
    }),
    [
      hydrated,
      accounts,
      transactions,
      trashedAccounts,
      lastCurrency,
      usedCurrencies,
      usedTags,
      recurringRules,
      getRecurringRule,
      addRecurringRule,
      updateRecurringRule,
      setRecurringPaused,
      deleteRecurringRule,
      dueOccurrences,
      confirmRecurringOccurrence,
      skipRecurringOccurrence,
      includeSubAccounts,
      getAccount,
      getAnyAccount,
      createAccount,
      updateAccount,
      moveAccountToTrash,
      restoreAccounts,
      permanentlyDeleteAccounts,
      addTransaction,
      updateTransaction,
      deleteTransaction,
      transactionDialog,
      openTransactionDialog,
      closeTransactionDialog,
      getExportSnapshot,
      importFinance,
    ]
  );

  return (
    <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>
  );
}

export function useFinance(): FinanceContextValue {
  const ctx = useContext(FinanceContext);
  if (!ctx) {
    throw new Error("useFinance must be used within a FinanceProvider");
  }
  return ctx;
}
