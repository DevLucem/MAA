"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";
import { Icon } from "../assets/icons";
import { useFinance } from "../lib/finance-store";
import {
  accountDisplayName,
  buildAccountTree,
  type FinanceAccount,
  getAccountAncestors,
} from "../lib/finance-utils";

function getRowIndent(level: number): string {
  return `${1 + level * 0.75}rem`;
}

interface AccountTreeNodeProps {
  account: FinanceAccount;
  childrenByParent: Map<string, FinanceAccount[]>;
  depth: number;
  pathname: string;
  collapsedIds: Set<string>;
  txCountByAccount: Map<string, number>;
  onToggle: (id: string) => void;
  onNewTransaction: (accountId: string) => void;
  onNavigate?: () => void;
}

function AccountTreeNode({
  account,
  childrenByParent,
  depth,
  pathname,
  collapsedIds,
  txCountByAccount,
  onToggle,
  onNewTransaction,
  onNavigate,
}: AccountTreeNodeProps) {
  const children = childrenByParent.get(account.id) ?? [];
  const hasChildren = children.length > 0;
  const isExpanded = !collapsedIds.has(account.id);
  const href = `/finance/${encodeURIComponent(account.id)}`;
  const isActive = pathname === href;
  const name = accountDisplayName(account);
  const txCount = txCountByAccount.get(account.id) ?? 0;

  return (
    <li>
      <div
        className={`group flex items-center gap-0.5 rounded-md pe-1 transition-colors ${
          isActive
            ? "bg-secondary font-medium text-foreground"
            : "text-muted hover:bg-secondary/70 hover:text-foreground"
        }`}
        style={{ paddingInlineStart: getRowIndent(depth) }}
      >
        {hasChildren ? (
          <button
            type="button"
            aria-label={`Toggle ${name} sub-accounts`}
            aria-expanded={isExpanded}
            onClick={() => onToggle(account.id)}
            className="inline-flex size-6 shrink-0 items-center justify-center rounded text-muted hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
          >
            <Icon
              name="chevron-right"
              className={`size-3.5 transition-transform ${
                isExpanded ? "rotate-90" : ""
              }`}
            />
          </button>
        ) : (
          <span aria-hidden="true" className="size-6 shrink-0" />
        )}

        <Link
          href={href}
          onClick={onNavigate}
          aria-current={isActive ? "page" : undefined}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-primary"
        >
          {account.icon ? (
            <span
              aria-hidden="true"
              className="inline-flex size-4 shrink-0 items-center justify-center text-sm leading-none"
            >
              {account.icon}
            </span>
          ) : (
            <Icon name="wallet" className="size-4 shrink-0 text-muted" />
          )}
          <span className="truncate">{name}</span>
        </Link>

        {txCount > 0 && (
          <span
            className="shrink-0 px-1 text-[11px] tabular-nums text-muted group-focus-within:hidden group-hover:hidden"
            aria-label={`${txCount} ${txCount === 1 ? "transaction" : "transactions"}`}
          >
            {txCount}
          </span>
        )}

        <button
          type="button"
          aria-label={`New transaction in ${name}`}
          title="New transaction"
          onClick={() => onNewTransaction(account.id)}
          className="inline-flex size-6 shrink-0 items-center justify-center rounded text-muted opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-secondary hover:text-foreground focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-primary"
        >
          <Icon name="plus" className="size-3.5" />
        </button>
      </div>

      {hasChildren && isExpanded && (
        <ul className="mt-0.5 space-y-0.5">
          {children.map((child) => (
            <AccountTreeNode
              key={child.id}
              account={child}
              childrenByParent={childrenByParent}
              depth={depth + 1}
              pathname={pathname}
              collapsedIds={collapsedIds}
              txCountByAccount={txCountByAccount}
              onToggle={onToggle}
              onNewTransaction={onNewTransaction}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/** Collapsible Finance navigation section with nested accounts, mirroring the Docs section. */
export function FinanceSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const listId = useId();
  const pathname = usePathname();
  const router = useRouter();
  const { accounts, transactions, createAccount, openTransactionDialog } =
    useFinance();

  const [expanded, setExpanded] = useState(true);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set());
  const [userClosedOnPath, setUserClosedOnPath] = useState<{
    path: string;
    ids: Set<string>;
  }>({ path: "", ids: new Set() });

  const isOverview = pathname === "/finance";
  const activeAccountId = pathname.startsWith("/finance/")
    ? decodeURIComponent(pathname.slice("/finance/".length).split("/")[0] ?? "")
    : null;

  const { roots, childrenByParent } = useMemo(
    () => buildAccountTree(accounts),
    [accounts]
  );

  const txCountByAccount = useMemo(() => {
    const map = new Map<string, number>();
    for (const tx of transactions) {
      map.set(tx.accountId, (map.get(tx.accountId) ?? 0) + 1);
    }
    return map;
  }, [transactions]);

  // Keep the active account's ancestors open unless the user closed them on this route.
  const effectiveCollapsedIds = useMemo(() => {
    if (!activeAccountId) return collapsedIds;
    const manuallyClosed =
      userClosedOnPath.path === pathname ? userClosedOnPath.ids : null;
    const next = new Set(collapsedIds);
    let changed = false;
    for (const ancestor of getAccountAncestors(accounts, activeAccountId)) {
      if (ancestor.id === activeAccountId) continue;
      if (next.has(ancestor.id) && !manuallyClosed?.has(ancestor.id)) {
        next.delete(ancestor.id);
        changed = true;
      }
    }
    return changed ? next : collapsedIds;
  }, [accounts, activeAccountId, collapsedIds, pathname, userClosedOnPath]);

  const handleToggle = (id: string) => {
    const nextCollapsed = !effectiveCollapsedIds.has(id);
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (nextCollapsed) next.add(id);
      else next.delete(id);
      return next;
    });
    setUserClosedOnPath((prev) => {
      const ids = new Set(prev.path === pathname ? prev.ids : []);
      if (nextCollapsed) ids.add(id);
      else ids.delete(id);
      return { path: pathname, ids };
    });
  };

  const handleCreate = () => {
    const account = createAccount();
    setExpanded(true);
    onNavigate?.();
    router.push(`/finance/${encodeURIComponent(account.id)}`);
  };

  const handleNewTransaction = (accountId: string) => {
    onNavigate?.();
    openTransactionDialog({ mode: "new", accountId });
  };

  return (
    <nav aria-label="Finance" className="px-3 pb-3">
      <div
        className={`flex items-center gap-1 rounded-md px-1 py-1 transition-colors ${
          isOverview ? "bg-secondary" : ""
        }`}
      >
        <button
          type="button"
          aria-label="Toggle Finance accounts"
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() => setExpanded((prev) => !prev)}
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
        >
          <Icon
            name="chevron-right"
            className={`size-4 transition-transform ${expanded ? "rotate-90" : ""}`}
          />
        </button>

        <Link
          href="/finance"
          onClick={onNavigate}
          aria-current={isOverview ? "page" : undefined}
          className="min-w-0 flex-1 truncate rounded-md px-1.5 py-1 text-sm font-semibold text-foreground transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary"
        >
          Finance
        </Link>

        <button
          type="button"
          aria-label="New account"
          onClick={() => handleCreate()}
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
        >
          <Icon name="plus" className="size-4" />
        </button>
      </div>

      {expanded && (
        <ul id={listId} className="mt-1 space-y-0.5">
          {roots.length === 0 ? (
            <li className="ps-10 pe-3 py-1.5 text-xs text-muted">
              No accounts yet
            </li>
          ) : (
            roots.map((account) => (
              <AccountTreeNode
                key={account.id}
                account={account}
                childrenByParent={childrenByParent}
                depth={0}
                pathname={pathname}
                collapsedIds={effectiveCollapsedIds}
                txCountByAccount={txCountByAccount}
                onToggle={handleToggle}
                onNewTransaction={handleNewTransaction}
                onNavigate={onNavigate}
              />
            ))
          )}
        </ul>
      )}
    </nav>
  );
}
