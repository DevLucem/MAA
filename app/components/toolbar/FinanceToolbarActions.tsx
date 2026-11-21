"use client";

import { useRouter } from "next/navigation";
import { type CSSProperties, useId } from "react";
import { Icon } from "../../assets/icons";
import { useFinance } from "../../lib/finance-store";
import type { FinanceAccount } from "../../lib/finance-utils";
import { useToolbarMenu } from "./useToolbarMenu";

const menuItemClass =
  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-sm text-foreground transition-colors hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none";

/** Right-aligned finance account actions: Copy link and the `...` menu. */
export function FinanceToolbarActions({
  account,
  copiedLabel,
  onCopyLink,
}: {
  account: FinanceAccount;
  copiedLabel: string | null;
  onCopyLink: () => Promise<void>;
}) {
  const router = useRouter();
  const {
    accounts,
    createAccount,
    moveAccountToTrash,
    includeSubAccounts,
    setIncludeSubAccounts,
  } = useFinance();

  const menuTriggerId = useId();
  const menuPopoverId = useId();
  const menuAnchorName = `--anchor-${menuTriggerId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const { menuTriggerRef, menuPopoverRef, menuGroupRef, menuOpen, closeMenu } =
    useToolbarMenu(account.id);

  const subAccountCount = accounts.filter((a) => a.parentId === account.id).length;

  return (
    <div className="flex shrink-0 items-center gap-1">
      {copiedLabel && (
        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-foreground">
          {copiedLabel}
        </span>
      )}

      <button
        type="button"
        aria-label="Copy link"
        onClick={() => void onCopyLink()}
        className="inline-flex size-8 items-center justify-center rounded-md text-foreground transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary"
      >
        <Icon name="link" className="size-4" />
      </button>

      <button
        ref={menuTriggerRef}
        id={menuTriggerId}
        type="button"
        aria-label="Account actions"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        style={{ anchorName: menuAnchorName } as CSSProperties}
        {...({
          commandfor: menuPopoverId,
          command: "toggle-popover",
        } as Record<string, string>)}
        className={`inline-flex size-8 items-center justify-center rounded-md text-foreground transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary ${
          menuOpen ? "bg-secondary" : ""
        }`}
      >
        <Icon name="ellipsis" className="size-4" />
      </button>
      <div
        ref={menuPopoverRef}
        id={menuPopoverId}
        {...({ popover: "auto" } as Record<string, string>)}
        style={{ positionAnchor: menuAnchorName } as CSSProperties}
        className="toolbar-popover w-56 rounded-lg border border-border bg-canvas p-1.5 text-foreground shadow-lg"
      >
        <div className="px-2 py-1.5 text-xs text-muted">
          {subAccountCount} {subAccountCount === 1 ? "sub-account" : "sub-accounts"}
        </div>
        <hr className="my-1 border-border" />
        <div
          ref={menuGroupRef}
          {...({ focusgroup: "menu nomemory" } as Record<string, string>)}
          aria-labelledby={menuTriggerId}
          className="flex flex-col"
        >
          <button
            type="button"
            aria-pressed={includeSubAccounts}
            onClick={() => {
              setIncludeSubAccounts(!includeSubAccounts);
              closeMenu();
            }}
            className={`${menuItemClass} justify-between`}
          >
            <span>Include sub-accounts</span>
            {includeSubAccounts && (
              <span aria-hidden="true" className="text-xs text-primary">
                ✓
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              const child = createAccount(account.id);
              closeMenu();
              router.push(`/finance/${encodeURIComponent(child.id)}`);
            }}
            className={menuItemClass}
          >
            New sub-account
          </button>
          <hr className="my-1 border-border" />
          <button
            type="button"
            onClick={() => {
              closeMenu();
              moveAccountToTrash(account.id);
              router.push(
                account.parentId
                  ? `/finance/${encodeURIComponent(account.parentId)}`
                  : "/finance"
              );
            }}
            className={menuItemClass.replace("text-foreground", "text-danger")}
          >
            Move to trash
          </button>
        </div>
      </div>
    </div>
  );
}
