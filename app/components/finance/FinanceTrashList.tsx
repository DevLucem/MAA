"use client";

import { Icon } from "../../assets/icons";
import { useFinance } from "../../lib/finance-store";
import { accountDisplayName } from "../../lib/finance-utils";

/** Trashed finance accounts with restore and permanent-delete actions (used inside Settings › Trash). */
export function FinanceTrashList({
  onFeedback,
}: {
  onFeedback: (message: string) => void;
}) {
  const {
    trashedAccounts,
    getAnyAccount,
    restoreAccounts,
    permanentlyDeleteAccounts,
  } = useFinance();

  if (trashedAccounts.length === 0) return null;

  return (
    <section aria-label="Trashed finance accounts" className="space-y-2">
      <h3 className="text-xs font-semibold tracking-wider text-muted uppercase">
        Finance accounts
      </h3>
      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-canvas/50">
        {trashedAccounts.map((account) => {
          const name = accountDisplayName(account);
          const parent = account.parentId ? getAnyAccount(account.parentId) : undefined;
          return (
            <li
              key={account.id}
              className="flex items-start justify-between gap-3 px-3 py-2.5 hover:bg-secondary/40"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  {account.icon ? (
                    <span aria-hidden="true" className="text-sm leading-none">
                      {account.icon}
                    </span>
                  ) : (
                    <Icon name="wallet" className="size-3.5 shrink-0 text-muted" />
                  )}
                  <span className="truncate text-xs font-semibold text-foreground">
                    {name}
                  </span>
                </div>
                <p className="mt-0.5 text-[10px] text-muted">
                  {account.trashedAt ? `Trashed ${account.trashedAt.slice(0, 10)}` : "In Trash"}
                  {parent ? ` · Inside ${accountDisplayName(parent)}` : ""}
                  {" · Includes its sub-accounts and transactions"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  aria-label={`Restore ${name}`}
                  title="Restore account"
                  onClick={() => {
                    restoreAccounts([account.id]);
                    onFeedback(`Restored "${name}".`);
                  }}
                  className="inline-flex size-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <Icon name="restore" className="size-3.5" />
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${name} permanently`}
                  title="Delete permanently"
                  onClick={() => {
                    const result = permanentlyDeleteAccounts([account.id]);
                    onFeedback(
                      `Permanently deleted "${name}" (${result.accounts} ${
                        result.accounts === 1 ? "account" : "accounts"
                      }, ${result.transactions} ${
                        result.transactions === 1 ? "transaction" : "transactions"
                      }).`
                    );
                  }}
                  className="inline-flex size-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-danger/15 hover:text-danger focus-visible:outline-2 focus-visible:outline-danger"
                >
                  <Icon name="trash" className="size-3.5" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
