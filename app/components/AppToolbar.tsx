"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useCallback, useMemo, useState } from "react";
import { Icon } from "../assets/icons";
import { useDocs } from "../lib/docs-store";
import { getDocAncestors, getDocStats } from "../lib/docs-utils";
import { useFinance } from "../lib/finance-store";
import { accountDisplayName, getAccountAncestors } from "../lib/finance-utils";
import { DocToolbarActions } from "./toolbar/DocToolbarActions";
import { FinanceToolbarActions } from "./toolbar/FinanceToolbarActions";

function SidebarToggleButton({
  open,
  onToggle,
  controlsId,
  className,
}: {
  open: boolean;
  onToggle: () => void;
  controlsId: string;
  className: string;
}) {
  return (
    <button
      type="button"
      aria-label={open ? "Hide sidebar" : "Show sidebar"}
      aria-expanded={open}
      aria-controls={controlsId}
      onClick={onToggle}
      className={`size-8 shrink-0 items-center justify-center rounded-md text-foreground transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${className}`}
    >
      <Icon name="menu" className="size-4" />
    </button>
  );
}

interface AppToolbarProps {
  sidebarId: string;
  desktopOpen: boolean;
  mobileOpen: boolean;
  onToggleDesktop: () => void;
  onToggleMobile: () => void;
}

/** Notion-style top toolbar with breadcrumb navigation and active document/database controls. */
export function AppToolbar({
  sidebarId,
  desktopOpen,
  mobileOpen,
  onToggleDesktop,
  onToggleMobile,
}: AppToolbarProps) {
  const pathname = usePathname();
  const { docs, getDatabase } = useDocs();
  const { accounts: financeAccounts } = useFinance();

  const [copiedLabel, setCopiedLabel] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const activeRouteDbId = useMemo(() => {
    if (!pathname.startsWith("/docs/db/")) return null;
    const segment = pathname.slice("/docs/db/".length).split("/")[0];
    return segment ? decodeURIComponent(segment) : null;
  }, [pathname]);

  const activeDocId = useMemo(() => {
    if (!pathname.startsWith("/docs/") || pathname.startsWith("/docs/db/")) {
      return null;
    }
    const segment = pathname.slice("/docs/".length).split("/")[0];
    return segment || null;
  }, [pathname]);

  const activeDoc = useMemo(
    () => (activeDocId ? docs.find((d) => d.id === activeDocId) ?? null : null),
    [activeDocId, docs]
  );

  const activeRouteDb = useMemo(
    () => (activeRouteDbId ? getDatabase(activeRouteDbId) ?? null : null),
    [activeRouteDbId, getDatabase]
  );

  const breadcrumbDocs = useMemo(() => {
    if (activeDoc) return getDocAncestors(docs, activeDoc.id);
    if (activeRouteDb) return getDocAncestors(docs, activeRouteDb.parentDocId);
    return [];
  }, [activeDoc, activeRouteDb, docs]);

  const stats = useMemo(
    () => (activeDoc ? getDocStats(activeDoc) : null),
    [activeDoc]
  );

  const announce = useCallback((message: string) => {
    setAnnouncement("");
    requestAnimationFrame(() => setAnnouncement(message));
  }, []);

  const flashCopied = useCallback(
    (label: string) => {
      setCopiedLabel(label);
      announce(label);
      window.setTimeout(() => {
        setCopiedLabel((curr) => (curr === label ? null : curr));
      }, 1800);
    },
    [announce]
  );

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      flashCopied("Copied link");
    } catch {
      flashCopied("Copy failed");
    }
  }, [flashCopied]);

  const isDocsRoute = pathname === "/docs" || pathname.startsWith("/docs/");
  const isFinanceRoute =
    pathname === "/finance" || pathname.startsWith("/finance/");

  const financeAccountId = pathname.startsWith("/finance/")
    ? decodeURIComponent(pathname.slice("/finance/".length).split("/")[0] ?? "")
    : null;
  const financeBreadcrumbs = useMemo(
    () =>
      financeAccountId
        ? getAccountAncestors(financeAccounts, financeAccountId)
        : [],
    [financeAccountId, financeAccounts]
  );
  const activeFinanceAccount =
    financeBreadcrumbs.length > 0 &&
    financeBreadcrumbs[financeBreadcrumbs.length - 1].id === financeAccountId
      ? financeBreadcrumbs[financeBreadcrumbs.length - 1]
      : null;

  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-2 bg-canvas px-3">
      {/* Left side: Hamburger toggle + Breadcrumb */}
      <div className="flex min-w-0 items-center gap-1.5">
        <SidebarToggleButton
          open={mobileOpen}
          onToggle={onToggleMobile}
          controlsId={sidebarId}
          className="inline-flex md:hidden"
        />
        <SidebarToggleButton
          open={desktopOpen}
          onToggle={onToggleDesktop}
          controlsId={sidebarId}
          className="hidden md:inline-flex"
        />

        <nav
          aria-label="Breadcrumb"
          className="flex min-w-0 items-center gap-1 text-sm"
        >
          <Link
            href="/"
            aria-current={pathname === "/" ? "page" : undefined}
            className="shrink-0 rounded px-1.5 py-1 font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary"
          >
            MAA
          </Link>

          {isDocsRoute && (
            <>
              <span aria-hidden="true" className="text-muted">
                /
              </span>
              {pathname === "/docs" ? (
                <span
                  aria-current="page"
                  className="truncate rounded px-1.5 py-1 font-medium text-foreground"
                >
                  Docs
                </span>
              ) : (
                <Link
                  href="/docs"
                  className="shrink-0 rounded px-1.5 py-1 text-muted transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                >
                  Docs
                </Link>
              )}
            </>
          )}

          {isFinanceRoute && (
            <>
              <span aria-hidden="true" className="text-muted">
                /
              </span>
              {pathname === "/finance" ? (
                <span
                  aria-current="page"
                  className="truncate rounded px-1.5 py-1 font-medium text-foreground"
                >
                  Finance
                </span>
              ) : (
                <Link
                  href="/finance"
                  className="shrink-0 rounded px-1.5 py-1 text-muted transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                >
                  Finance
                </Link>
              )}
              {financeBreadcrumbs.map((account, idx) => {
                const isLast = idx === financeBreadcrumbs.length - 1;
                const label = accountDisplayName(account);
                return (
                  <Fragment key={account.id}>
                    <span aria-hidden="true" className="text-muted">
                      /
                    </span>
                    {isLast ? (
                      <span
                        aria-current="page"
                        className="inline-flex min-w-0 items-center gap-1.5 truncate rounded px-1.5 py-1 font-medium text-foreground"
                      >
                        {account.icon && (
                          <span aria-hidden="true" className="shrink-0 leading-none">
                            {account.icon}
                          </span>
                        )}
                        <span className="truncate">{label}</span>
                      </span>
                    ) : (
                      <Link
                        href={`/finance/${encodeURIComponent(account.id)}`}
                        className="inline-flex max-w-36 items-center gap-1.5 truncate rounded px-1.5 py-1 text-muted transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                      >
                        {account.icon && (
                          <span aria-hidden="true" className="shrink-0 leading-none">
                            {account.icon}
                          </span>
                        )}
                        <span className="truncate">{label}</span>
                      </Link>
                    )}
                  </Fragment>
                );
              })}
            </>
          )}

          {breadcrumbDocs.map((item, idx) => {
            const isLastDoc =
              Boolean(activeDoc) && idx === breadcrumbDocs.length - 1;
            const title = item.title.trim() || "Untitled";
            const itemDb = item.databaseId
              ? getDatabase(item.databaseId)
              : undefined;
            return (
              <Fragment key={item.id}>
                {itemDb && (
                  <>
                    <span aria-hidden="true" className="text-muted">
                      /
                    </span>
                    <Link
                      href={`/docs/db/${encodeURIComponent(itemDb.id)}`}
                      className="inline-flex max-w-36 items-center gap-1.5 truncate rounded px-1.5 py-1 text-muted transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      {itemDb.icon ? (
                        <span aria-hidden="true" className="shrink-0 leading-none">
                          {itemDb.icon}
                        </span>
                      ) : (
                        <Icon
                          name="database"
                          className="size-3.5 shrink-0 text-muted"
                        />
                      )}
                      <span className="truncate">{itemDb.title}</span>
                    </Link>
                  </>
                )}
                <span aria-hidden="true" className="text-muted">
                  /
                </span>
                {isLastDoc ? (
                  <span
                    aria-current="page"
                    className="inline-flex min-w-0 items-center gap-1.5 truncate rounded px-1.5 py-1 font-medium text-foreground"
                  >
                    {item.icon && (
                      <span aria-hidden="true" className="shrink-0 leading-none">
                        {item.icon}
                      </span>
                    )}
                    <span className="truncate">{title}</span>
                  </span>
                ) : (
                  <Link
                    href={`/docs/${item.id}`}
                    className="inline-flex max-w-36 items-center gap-1.5 truncate rounded px-1.5 py-1 text-muted transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    {item.icon && (
                      <span aria-hidden="true" className="shrink-0 leading-none">
                        {item.icon}
                      </span>
                    )}
                    <span className="truncate">{title}</span>
                  </Link>
                )}
              </Fragment>
            );
          })}

          {activeRouteDb && (
            <>
              <span aria-hidden="true" className="text-muted">
                /
              </span>
              <span
                aria-current="page"
                className="inline-flex min-w-0 items-center gap-1.5 truncate rounded px-1.5 py-1 font-medium text-foreground"
              >
                {activeRouteDb.icon ? (
                  <span aria-hidden="true" className="shrink-0 leading-none">
                    {activeRouteDb.icon}
                  </span>
                ) : (
                  <Icon
                    name="database"
                    className="size-3.5 shrink-0 text-muted"
                  />
                )}
                <span className="truncate">{activeRouteDb.title}</span>
              </span>
            </>
          )}
        </nav>
      </div>

      {/* Right side: Doc or Database actions */}
      {activeDoc && stats && (
        <DocToolbarActions
          activeDoc={activeDoc}
          stats={stats}
          copiedLabel={copiedLabel}
          onCopyLink={handleCopyLink}
          onFlashLabel={flashCopied}
        />
      )}

      {!activeDoc && activeRouteDb && (
        <div className="flex shrink-0 items-center gap-1">
          {copiedLabel && (
            <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-foreground">
              {copiedLabel}
            </span>
          )}

          <button
            type="button"
            aria-label="Copy link"
            onClick={() => void handleCopyLink()}
            className="inline-flex size-8 items-center justify-center rounded-md text-foreground transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary"
          >
            <Icon name="link" className="size-4" />
          </button>
        </div>
      )}

      {!activeDoc && !activeRouteDb && activeFinanceAccount && (
        <FinanceToolbarActions
          account={activeFinanceAccount}
          copiedLabel={copiedLabel}
          onCopyLink={handleCopyLink}
        />
      )}

      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </header>
  );
}
