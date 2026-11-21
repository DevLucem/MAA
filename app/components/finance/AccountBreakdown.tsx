"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Icon } from "../../assets/icons";
import { useFinance } from "../../lib/finance-store";
import {
  accountDisplayName,
  collectAccountSubtree,
  type FinanceAccount,
  type FinanceTransaction,
  formatMoney,
  summarizeByCurrency,
} from "../../lib/finance-utils";

/** Lists accounts with their rolled-up (including sub-accounts) net totals per currency. */
export function AccountBreakdown({
  title,
  description,
  accounts: shownAccounts,
  transactions,
}: {
  title: string;
  description: string;
  accounts: FinanceAccount[];
  transactions: FinanceTransaction[];
}) {
  const { accounts } = useFinance();

  const rows = useMemo(
    () =>
      shownAccounts.map((account) => {
        const subtree = collectAccountSubtree(accounts, account.id);
        const scoped = transactions.filter((tx) => subtree.has(tx.accountId));
        return {
          account,
          subAccounts: subtree.size - 1,
          summaries: summarizeByCurrency(scoped),
        };
      }),
    [accounts, shownAccounts, transactions]
  );

  return (
    <section
      aria-label={title}
      className="rounded-xl border border-border bg-surface p-5"
    >
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-1 text-xs text-muted">{description}</p>

      {rows.length === 0 ? (
        <p className="mt-4 text-xs text-muted">No accounts yet.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {rows.map(({ account, subAccounts, summaries }) => (
            <li key={account.id}>
              <Link
                href={`/finance/${encodeURIComponent(account.id)}`}
                className="flex items-start justify-between gap-3 rounded-lg border border-border bg-canvas p-3 transition-colors hover:bg-secondary/70 focus-visible:outline-2 focus-visible:outline-primary"
              >
                <span className="flex min-w-0 items-center gap-2">
                  {account.icon ? (
                    <span aria-hidden="true" className="text-base leading-none">
                      {account.icon}
                    </span>
                  ) : (
                    <Icon name="wallet" className="size-4 shrink-0 text-muted" />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {accountDisplayName(account)}
                    </span>
                    {subAccounts > 0 && (
                      <span className="block text-[11px] text-muted">
                        incl. {subAccounts} sub-account{subAccounts === 1 ? "" : "s"}
                      </span>
                    )}
                  </span>
                </span>
                <span className="shrink-0 text-end text-sm tabular-nums">
                  {summaries.length === 0 ? (
                    <span className="text-xs text-muted">No activity</span>
                  ) : (
                    summaries.map((s) => (
                      <span
                        key={s.currency}
                        className={`block font-semibold ${
                          s.net > 0
                            ? "text-success"
                            : s.net < 0
                              ? "text-danger"
                              : "text-foreground"
                        }`}
                      >
                        {formatMoney(s.net, s.currency, { signed: true })}
                      </span>
                    ))
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
