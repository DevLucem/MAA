"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { Icon } from "../assets/icons";
import { useFinance } from "../lib/finance-store";
import { buildAccountTree } from "../lib/finance-utils";
import { AccountBreakdown } from "./finance/AccountBreakdown";
import { FinanceLedger } from "./finance/FinanceLedger";

/** Finance overview: stats across all accounts and the full transaction list. */
export function FinanceDashboard() {
  const router = useRouter();
  const { hydrated, accounts, transactions, recurringRules, dueOccurrences, createAccount } =
    useFinance();

  const roots = useMemo(() => buildAccountTree(accounts).roots, [accounts]);

  const handleCreateAccount = () => {
    const account = createAccount();
    router.push(`/finance/${encodeURIComponent(account.id)}`);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-8 lg:px-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Finance</h1>
          <p className="mt-1 text-sm text-muted">
            Overall stats and every transaction across your accounts.
          </p>
        </div>
        <button
          type="button"
          onClick={handleCreateAccount}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <Icon name="wallet" className="size-4" />
          New account
        </button>
      </div>

      {!hydrated ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <FinanceLedger
          transactions={transactions}
          recurringRules={recurringRules}
          dueOccurrences={dueOccurrences}
          showAccount
          renderAside={(periodTransactions) => (
            <AccountBreakdown
              title="Accounts"
              description="Net per account for the selected period, including sub-accounts."
              accounts={roots}
              transactions={periodTransactions}
            />
          )}
        />
      )}
    </div>
  );
}
