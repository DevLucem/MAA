"use client";

import { Icon } from "../../assets/icons";
import { useFinance } from "../../lib/finance-store";
import {
  accountDisplayName,
  type DueOccurrence,
  formatDateTime,
  formatMoney,
} from "../../lib/finance-utils";

const smallButton =
  "inline-flex h-7 items-center rounded-md px-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary";

/** Due occurrences of confirm-first recurring rules, with Add / Skip / review actions. */
export function DuePanel({
  items,
  showAccount,
}: {
  items: DueOccurrence[];
  showAccount: boolean;
}) {
  const {
    getAccount,
    confirmRecurringOccurrence,
    skipRecurringOccurrence,
    openTransactionDialog,
  } = useFinance();

  if (items.length === 0) return null;

  return (
    <section
      aria-label="Due recurring transactions"
      className="rounded-xl border border-primary/40 bg-primary/5 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Icon name="sync" className="size-4 text-primary" />
          Due
          <span className="rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground tabular-nums">
            {items.length}
          </span>
        </h2>
        {items.length > 1 && (
          <button
            type="button"
            onClick={() => {
              for (const item of items) {
                confirmRecurringOccurrence(item.rule.id, item.occurrence);
              }
            }}
            className={`${smallButton} text-primary hover:bg-primary/10`}
          >
            Add all
          </button>
        )}
      </div>
      <ul className="mt-3 space-y-1.5">
        {items.map((item) => {
          const { rule, occurrence } = item;
          const net = rule.kind === "income" ? rule.amount - rule.fee : -(rule.amount + rule.fee);
          const name = rule.name || "Untitled";
          return (
            <li
              key={`${rule.id}-${occurrence}`}
              className="flex items-center gap-2 rounded-lg border border-border bg-canvas p-2"
            >
              <button
                type="button"
                onClick={() => openTransactionDialog({ mode: "new", due: item })}
                title="Review before adding"
                className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-md px-1 text-start focus-visible:outline-2 focus-visible:outline-primary"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {name}
                  </span>
                  <span className="block truncate text-[11px] text-muted">
                    Due {formatDateTime(occurrence)}
                    {showAccount && ` · ${accountDisplayName(getAccount(rule.accountId))}`}
                  </span>
                </span>
                <span
                  className={`shrink-0 text-sm font-semibold tabular-nums ${
                    net > 0 ? "text-success" : net < 0 ? "text-danger" : "text-foreground"
                  }`}
                >
                  {formatMoney(net, rule.currency, { signed: true })}
                </span>
              </button>
              <button
                type="button"
                aria-label={`Skip ${name} due ${formatDateTime(occurrence)}`}
                onClick={() => skipRecurringOccurrence(rule.id, occurrence)}
                className={`${smallButton} text-muted hover:bg-secondary hover:text-foreground`}
              >
                Skip
              </button>
              <button
                type="button"
                aria-label={`Add ${name} due ${formatDateTime(occurrence)}`}
                onClick={() => confirmRecurringOccurrence(rule.id, occurrence)}
                className={`${smallButton} primary hover:opacity-90`}
              >
                Add
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
