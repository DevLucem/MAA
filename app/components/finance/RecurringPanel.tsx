"use client";

import { useMemo } from "react";
import { Icon } from "../../assets/icons";
import { useFinance } from "../../lib/finance-store";
import {
  accountDisplayName,
  describeSchedule,
  formatDateTime,
  formatMoney,
  nextOccurrence,
  type RecurringRule,
} from "../../lib/finance-utils";

/** Lists recurring rules with their schedule and next occurrence; click to edit the series. */
export function RecurringPanel({
  rules,
  showAccount,
}: {
  rules: RecurringRule[];
  showAccount: boolean;
}) {
  const { getAccount, openTransactionDialog, dueOccurrences } = useFinance();
  const dueCountByRule = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of dueOccurrences) {
      map.set(item.rule.id, (map.get(item.rule.id) ?? 0) + 1);
    }
    return map;
  }, [dueOccurrences]);

  const rows = useMemo(
    () =>
      rules
        .map((rule) => ({ rule, next: rule.paused ? null : nextOccurrence(rule) }))
        .sort((a, b) => {
          // Active upcoming first (soonest), then ended/paused.
          if (a.next && b.next) return a.next.getTime() - b.next.getTime();
          if (a.next) return -1;
          if (b.next) return 1;
          return a.rule.name.localeCompare(b.rule.name);
        }),
    [rules]
  );

  if (rows.length === 0) return null;

  return (
    <section aria-label="Recurring" className="rounded-xl border border-border bg-surface p-5">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <Icon name="sync" className="size-4 text-muted" />
        Recurring
      </h2>
      <p className="mt-1 text-xs text-muted">
        Auto ones are added when due; others wait in Due for you to confirm. Click one to edit,
        pause, or stop it.
      </p>
      <ul className="mt-4 space-y-2">
        {rows.map(({ rule, next }) => {
          const net = rule.kind === "income" ? rule.amount - rule.fee : -(rule.amount + rule.fee);
          const account = getAccount(rule.accountId);
          const dueCount = dueCountByRule.get(rule.id) ?? 0;
          const status = rule.paused
            ? "Paused"
            : dueCount > 0
              ? `${dueCount} due`
              : next
                ? `Next ${formatDateTime(next.toISOString())}`
                : "Ended";
          return (
            <li key={rule.id}>
              <button
                type="button"
                onClick={() => openTransactionDialog({ mode: "edit-rule", rule })}
                className={`flex w-full items-start justify-between gap-3 rounded-lg border border-border bg-canvas p-3 text-start transition-colors hover:bg-secondary/70 focus-visible:outline-2 focus-visible:outline-primary ${
                  rule.paused || !next ? "opacity-70" : ""
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {rule.name || "Untitled"}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-muted">
                    {describeSchedule(rule)} · {rule.autoAdd ? "Auto" : "Confirm"} · {status}
                    {showAccount && ` · ${accountDisplayName(account)}`}
                  </span>
                  {rule.tags.length > 0 && (
                    <span className="mt-1 flex flex-wrap gap-1">
                      {rule.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-primary/10 px-1.5 text-[10px] font-medium text-primary"
                        >
                          #{tag}
                        </span>
                      ))}
                    </span>
                  )}
                </span>
                <span
                  className={`shrink-0 text-sm font-semibold tabular-nums ${
                    net > 0 ? "text-success" : net < 0 ? "text-danger" : "text-foreground"
                  }`}
                >
                  {formatMoney(net, rule.currency, { signed: true })}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
