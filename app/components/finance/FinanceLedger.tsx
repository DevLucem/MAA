"use client";

import { type ReactNode, useId, useMemo, useState } from "react";
import { Icon } from "../../assets/icons";
import { useFinance } from "../../lib/finance-store";
import { DuePanel } from "./DuePanel";
import { RecurringPanel } from "./RecurringPanel";
import {
  accountDisplayName,
  type CurrencySummary,
  type DueOccurrence,
  FINANCE_PERIODS,
  type FinancePeriod,
  type FinanceTransaction,
  formatDateTime,
  formatDayHeading,
  formatMoney,
  formatTime,
  localDayKey,
  matchesAmountFilters,
  parseTransactionQuery,
  periodStart,
  type RecurringRule,
  summarizeByCurrency,
  transactionNet,
  wasRecordedLate,
} from "../../lib/finance-utils";


function SummaryCards({ summaries }: { summaries: CurrencySummary[] }) {
  if (summaries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface p-6 text-center">
        <p className="text-sm font-medium text-foreground">No transactions in this period</p>
        <p className="mt-1 text-xs text-muted">
          Stats appear here once you record transactions.
        </p>
      </div>
    );
  }

  return (
    <section
      aria-label="Totals by currency"
      tabIndex={0}
      className="summary-scroller -mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-2 focus-visible:outline-2 focus-visible:outline-primary"
    >
      {summaries.map((s) => (
        <div
          key={s.currency}
          className="w-max min-w-[min(18rem,80vw)] max-w-[90vw] shrink-0 snap-start rounded-xl border border-border bg-surface p-4"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted">Net · {s.currency}</p>
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
              {s.count} {s.count === 1 ? "transaction" : "transactions"}
            </span>
          </div>
          <p
            className={`mt-2 text-2xl font-bold tracking-tight tabular-nums ${
              s.net > 0 ? "text-success" : s.net < 0 ? "text-danger" : ""
            }`}
          >
            {formatMoney(s.net, s.currency, { signed: true })}
          </p>
          <dl className="mt-3 grid grid-cols-3 gap-x-4 gap-y-2 border-t border-border pt-3 text-xs">
            <div>
              <dt className="text-muted">Income</dt>
              <dd className="mt-0.5 font-medium tabular-nums">
                {formatMoney(s.income, s.currency)}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Expenses</dt>
              <dd className="mt-0.5 font-medium tabular-nums">
                {formatMoney(s.expenses, s.currency)}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Fees</dt>
              <dd className="mt-0.5 font-medium tabular-nums">
                {formatMoney(s.fees, s.currency)}
              </dd>
            </div>
          </dl>
        </div>
      ))}
    </section>
  );
}

interface FinanceLedgerProps {
  /** Transactions in scope (e.g. all, or one account's). */
  transactions: FinanceTransaction[];
  /** Preselected account when recording a new transaction. */
  defaultAccountId?: string;
  /** Show which account each transaction belongs to. */
  showAccount: boolean;
  /** Optional side panel rendered next to the list, given period-filtered transactions and the period start. */
  renderAside?: (
    periodTransactions: FinanceTransaction[],
    periodFrom: string | null
  ) => ReactNode;
  emptyHint?: string;
  /** Recurring rules in scope, shown in the side column. */
  recurringRules?: RecurringRule[];
  /** Due confirm-first occurrences in scope, shown above the list. */
  dueOccurrences?: DueOccurrence[];
}

/** Period filter, per-currency stats, and day-grouped transaction list with add/edit dialog. */
export function FinanceLedger({
  transactions,
  defaultAccountId,
  showAccount,
  renderAside,
  emptyHint = "Record your first transaction to get started.",
  recurringRules = [],
  dueOccurrences = [],
}: FinanceLedgerProps) {
  const searchId = useId();
  const searchHintId = useId();
  const { accounts, getAccount, openTransactionDialog } = useFinance();

  const [period, setPeriod] = useState<{ id: FinancePeriod; from: string | null }>({
    id: "all",
    from: null,
  });
  const [query, setQuery] = useState("");

  const periodTransactions = useMemo(
    () =>
      period.from
        ? transactions.filter((tx) => tx.occurredAt >= period.from!)
        : transactions,
    [period.from, transactions]
  );

  const summaries = useMemo(
    () => summarizeByCurrency(periodTransactions),
    [periodTransactions]
  );

  const visibleGroups = useMemo(() => {
    const { terms, amountFilters, tagFilters } = parseTransactionQuery(query);
    const filtered = periodTransactions.filter((tx) => {
      if (!matchesAmountFilters(transactionNet(tx), amountFilters)) return false;
      if (!tagFilters.every((f) => tx.tags.some((tag) => tag.startsWith(f)))) return false;
      if (terms.length === 0) return true;
      const haystack = [
        tx.name,
        tx.note ?? "",
        tx.currency,
        tx.kind,
        tx.tags.map((tag) => `#${tag}`).join(" "),
        accountDisplayName(getAccount(tx.accountId)),
      ]
        .join(" ")
        .toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
    filtered.sort(
      (a, b) =>
        b.occurredAt.localeCompare(a.occurredAt) ||
        b.recordedAt.localeCompare(a.recordedAt)
    );
    const groups: { day: string; items: FinanceTransaction[] }[] = [];
    for (const tx of filtered) {
      const day = localDayKey(tx.occurredAt);
      const last = groups[groups.length - 1];
      if (last && last.day === day) last.items.push(tx);
      else groups.push({ day, items: [tx] });
    }
    return groups;
  }, [getAccount, periodTransactions, query]);

  const hasAccounts = accounts.length > 0;
  const customAside = renderAside?.(periodTransactions, period.from);
  const aside =
    customAside || recurringRules.length > 0 ? (
      <>
        {customAside}
        <RecurringPanel rules={recurringRules} showAccount={showAccount} />
      </>
    ) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="group"
          aria-label="Period"
          className="inline-flex flex-wrap gap-1 rounded-lg bg-secondary p-1"
        >
          {FINANCE_PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={period.id === p.id}
              onClick={() => setPeriod({ id: p.id, from: periodStart(p.id, new Date()) })}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
                period.id === p.id
                  ? "bg-canvas text-foreground shadow-sm"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          disabled={!hasAccounts}
          onClick={() =>
            openTransactionDialog({ mode: "new", accountId: defaultAccountId })
          }
          title={hasAccounts ? undefined : "Create an account first"}
          className="primary inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <Icon name="plus" className="size-4" />
          New transaction
        </button>
      </div>

      <SummaryCards summaries={summaries} />

      <DuePanel items={dueOccurrences} showAccount={showAccount} />

      <div className={`grid grid-cols-1 gap-6 ${aside ? "lg:grid-cols-5" : ""}`}>
        <section
          aria-label="Transactions"
          className={`rounded-xl border border-border bg-surface p-5 ${aside ? "lg:col-span-3" : ""}`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
            <h2 className="text-base font-semibold">Transactions</h2>
            <div className="flex w-full flex-wrap gap-2 sm:w-auto">
              <label htmlFor={searchId} className="sr-only">
                Search transactions
              </label>
              <input
                id={searchId}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search, #tag, >40, <-45…"
                aria-describedby={searchHintId}
                title="Words match name, note, account, currency or type. #tag matches tags. Use >, >=, <, <=, = with a number to filter by amount (expenses are negative), e.g. #food <-45"
                className="h-9 min-w-0 flex-1 rounded-md border border-border bg-canvas px-3 text-sm text-foreground placeholder:text-muted focus-visible:outline-2 focus-visible:outline-primary sm:w-64"
              />
              <span id={searchHintId} className="sr-only">
                Words match name, note, account, currency, or type. Hash followed
                by a word matches tags. Use greater
                than, less than, or equals with a number to filter by amount;
                expenses are negative, for example less than minus 45.
              </span>
            </div>
          </div>

          {visibleGroups.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm font-medium text-foreground">
                {transactions.length === 0 ? "No transactions yet" : "No matching transactions"}
              </p>
              <p className="mt-1 text-xs text-muted">
                {!hasAccounts
                  ? "Create an account with the + next to Finance in the sidebar."
                  : transactions.length === 0
                    ? emptyHint
                    : "Try a different filter or period."}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {visibleGroups.map((group) => (
                <section key={group.day} aria-label={formatDayHeading(group.items[0].occurredAt)} className="py-3">
                  <h3 className="pb-1.5 text-xs font-semibold text-muted">
                    {formatDayHeading(group.items[0].occurredAt)}
                  </h3>
                  <ul className="space-y-0.5">
                    {group.items.map((tx) => {
                      const net = transactionNet(tx);
                      const account = getAccount(tx.accountId);
                      const late = wasRecordedLate(tx);
                      return (
                        <li key={tx.id}>
                          <button
                            type="button"
                            onClick={() =>
                              openTransactionDialog({ mode: "edit", transaction: tx })
                            }
                            className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-start transition-colors hover:bg-secondary/70 focus-visible:outline-2 focus-visible:outline-primary"
                          >
                            <span
                              aria-hidden="true"
                              className={`inline-flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                                tx.kind === "income"
                                  ? "bg-success/15 text-success"
                                  : "bg-danger/15 text-danger"
                              }`}
                            >
                              {tx.kind === "income" ? "+" : "−"}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex min-w-0 items-center gap-1.5 overflow-hidden">
                                <span className="truncate text-sm font-medium text-foreground">
                                  {tx.name || "Untitled transaction"}
                                </span>
                                {tx.recurringId && (
                                  <Icon
                                    name="sync"
                                    className="size-3 shrink-0 text-muted"
                                    label="Recurring"
                                  />
                                )}
                                {tx.tags.map((tag) => (
                                  <span
                                    key={tag}
                                    className="shrink-0 rounded-full bg-primary/10 px-1.5 text-[10px] font-medium text-primary"
                                  >
                                    #{tag}
                                  </span>
                                ))}
                              </span>
                              <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
                                <span>{formatTime(tx.occurredAt)}</span>
                                {showAccount && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span className="truncate">
                                      {account?.icon ? `${account.icon} ` : ""}
                                      {accountDisplayName(account)}
                                    </span>
                                  </>
                                )}
                                {late && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span title={`Recorded ${formatDateTime(tx.recordedAt)}`}>
                                      recorded later
                                    </span>
                                  </>
                                )}
                                {tx.note && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span className="truncate">{tx.note}</span>
                                  </>
                                )}
                              </span>
                            </span>
                            <span className="shrink-0 text-end">
                              <span
                                className={`block text-sm font-semibold tabular-nums ${
                                  net > 0 ? "text-success" : net < 0 ? "text-danger" : "text-foreground"
                                }`}
                              >
                                {formatMoney(net, tx.currency, { signed: true })}
                              </span>
                              {tx.fee > 0 && (
                                <span className="block text-[11px] text-muted tabular-nums">
                                  incl. {formatMoney(tx.fee, tx.currency)} fee
                                </span>
                              )}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </section>

        {aside && <div className="space-y-6 lg:col-span-2">{aside}</div>}
      </div>

    </div>
  );
}
