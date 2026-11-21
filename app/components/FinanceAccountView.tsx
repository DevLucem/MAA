"use client";

import { useParams, useRouter } from "next/navigation";
import { useId, useMemo, useRef, useState } from "react";
import { Icon } from "../assets/icons";
import { useFinance } from "../lib/finance-store";
import { buildAccountTree, collectAccountSubtree } from "../lib/finance-utils";
import { useDismissible } from "../lib/use-dismissible";
import { AccountBreakdown } from "./finance/AccountBreakdown";
import { FinanceLedger } from "./finance/FinanceLedger";
import { IconPickerPopover } from "./IconPickerPopover";

/** Single account page: editable name/icon, its stats, and its transactions. */
export function FinanceAccountView() {
  const params = useParams<{ accountId: string }>();
  const accountId = params.accountId ? decodeURIComponent(params.accountId) : "";
  const router = useRouter();
  const nameId = useId();
  const {
    hydrated,
    accounts,
    transactions,
    recurringRules,
    dueOccurrences,
    getAccount,
    updateAccount,
    includeSubAccounts,
  } = useFinance();

  const account = getAccount(accountId);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const iconWrapRef = useRef<HTMLDivElement>(null);

  useDismissible(iconPickerOpen, [iconWrapRef], () => setIconPickerOpen(false));

  const children = useMemo(
    () => buildAccountTree(accounts).childrenByParent.get(accountId) ?? [],
    [accounts, accountId]
  );
  const hasChildren = children.length > 0;
  const showSubtree = includeSubAccounts && hasChildren;

  const scopeIds = useMemo(
    () =>
      showSubtree ? collectAccountSubtree(accounts, accountId) : new Set([accountId]),
    [accountId, accounts, showSubtree]
  );
  const scopedTransactions = useMemo(
    () => transactions.filter((tx) => scopeIds.has(tx.accountId)),
    [scopeIds, transactions]
  );
  const scopedDue = useMemo(
    () => dueOccurrences.filter((item) => scopeIds.has(item.rule.accountId)),
    [dueOccurrences, scopeIds]
  );
  const scopedRules = useMemo(
    () => recurringRules.filter((rule) => scopeIds.has(rule.accountId)),
    [recurringRules, scopeIds]
  );

  if (!hydrated) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-6 text-sm text-muted sm:px-8 lg:px-12">
        Loading…
      </div>
    );
  }

  if (!account) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12 text-center sm:px-8 lg:px-12">
        <p className="text-sm font-medium text-foreground">Account not found</p>
        <p className="mt-1 text-xs text-muted">It may have been moved to trash.</p>
        <button
          type="button"
          onClick={() => router.push("/finance")}
          className="mt-4 h-9 rounded-md border border-border px-3 text-sm font-medium hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary"
        >
          Back to Finance
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-8 lg:px-12">
      <div className="flex min-w-0 items-center gap-2">
        <div ref={iconWrapRef} className="relative">
          <button
            type="button"
            aria-label="Change account icon"
            aria-expanded={iconPickerOpen}
            onClick={() => setIconPickerOpen((prev) => !prev)}
            className="inline-flex size-11 items-center justify-center rounded-lg text-2xl transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary"
          >
            {account.icon ?? <Icon name="wallet" className="size-6 text-muted" />}
          </button>
          {iconPickerOpen && (
            <IconPickerPopover
              selectedIcon={account.icon}
              label="Choose account icon"
              onSelect={(emoji) => {
                updateAccount(account.id, { icon: emoji });
                setIconPickerOpen(false);
              }}
            />
          )}
        </div>
        <label htmlFor={nameId} className="sr-only">
          Account name
        </label>
        <input
          id={nameId}
          key={account.id}
          type="text"
          autoFocus={!account.name}
          autoComplete="off"
          value={account.name}
          onChange={(e) => updateAccount(account.id, { name: e.target.value })}
          placeholder="Untitled account"
          className="min-w-0 flex-1 rounded-md bg-transparent px-1 py-1 text-2xl font-bold tracking-tight text-foreground placeholder:text-muted/60 focus-visible:outline-2 focus-visible:outline-primary"
        />
      </div>

      <FinanceLedger
        key={account.id}
        transactions={scopedTransactions}
        recurringRules={scopedRules}
        dueOccurrences={scopedDue}
        defaultAccountId={account.id}
        showAccount={showSubtree}
        emptyHint={
          showSubtree
            ? "No transactions in this account or its sub-accounts yet."
            : "Record the first transaction for this account."
        }
        renderAside={
          hasChildren
            ? (_periodTransactions, periodFrom) => (
                <AccountBreakdown
                  title="Sub-accounts"
                  description="Net per sub-account for the selected period, including their own sub-accounts."
                  accounts={children}
                  transactions={
                    periodFrom
                      ? transactions.filter((tx) => tx.occurredAt >= periodFrom)
                      : transactions
                  }
                />
              )
            : undefined
        }
      />
    </div>
  );
}
