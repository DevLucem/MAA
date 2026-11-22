"use client";

import { Suspense, useEffect, useId, useState } from "react";
import { Icon } from "../assets/icons";
import { AgentProvider, useAgent } from "../lib/agent-store";
import { DocsProvider } from "../lib/docs-store";
import { FinanceProvider } from "../lib/finance-store";
import { TodosProvider } from "../lib/todos-store";
import {
  AgentFloatingWidget,
  AgentRightSidebar,
} from "./AgentCompanionWidget";
import { AppToolbar } from "./AppToolbar";
import { DocsSidebar } from "./DocsSidebar";
import { FinanceSidebar } from "./FinanceSidebar";
import { TransactionDialogHost } from "./finance/TransactionDialog";
import { SettingsDialog } from "./SettingsDialog";
import { TodoDialogsHost } from "./todos/TodoDialogsHost";
import { TodosSidebar } from "./TodosSidebar";

function AppShellInner({ children }: { children: React.ReactNode }) {
  const sidebarId = useId();
  const { settingsOpen, openSettings, closeSettings } = useAgent();
  const [desktopOpen, setDesktopOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  return (
    <>
      <div className="flex h-dvh bg-canvas">
        {mobileOpen && (
          <div
            aria-hidden="true"
            onClick={() => setMobileOpen(false)}
            className="fixed inset-x-0 top-12 bottom-0 z-30 bg-black/50 md:hidden"
          />
        )}

        <aside
          id={sidebarId}
          aria-label="Sidebar"
          className={`w-64 shrink-0 flex-col overflow-hidden border-e border-border bg-surface ${
            mobileOpen ? "fixed top-12 bottom-0 start-0 z-40 flex" : "hidden"
          } ${
            desktopOpen
              ? "md:static md:inset-auto md:z-auto md:flex"
              : "md:hidden"
          }`}
        >
          <div className="scroll-region min-h-0 flex-1">
            <Suspense fallback={null}>
              <DocsSidebar onNavigate={() => setMobileOpen(false)} />
              <FinanceSidebar onNavigate={() => setMobileOpen(false)} />
              <TodosSidebar onNavigate={() => setMobileOpen(false)} />
            </Suspense>
          </div>

          <div className="shrink-0 border-t border-border p-2.5">
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                openSettings();
              }}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm font-medium text-muted transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
            >
              <Icon name="settings" className="size-4 shrink-0" />
              <span>Settings</span>
            </button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col bg-canvas">
          <Suspense
            fallback={
              <header className="flex h-12 shrink-0 items-center bg-canvas px-3" />
            }
          >
            <AppToolbar
              sidebarId={sidebarId}
              desktopOpen={desktopOpen}
              mobileOpen={mobileOpen}
              onToggleDesktop={() => setDesktopOpen((prev) => !prev)}
              onToggleMobile={() => setMobileOpen((prev) => !prev)}
            />
          </Suspense>

          <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
            <main className="scroll-region min-w-0 flex-1">{children}</main>
            <Suspense fallback={null}>
              <AgentRightSidebar />
            </Suspense>
          </div>
        </div>
      </div>

      <Suspense fallback={null}>
        <AgentFloatingWidget />
      </Suspense>
      <SettingsDialog open={settingsOpen} onClose={closeSettings} />
      <TransactionDialogHost />
      <Suspense fallback={null}>
        <TodoDialogsHost />
      </Suspense>
    </>
  );
}

/** Three-region layout shell with a toggleable sidebar, contextual toolbar, and main canvas. */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <DocsProvider>
      <FinanceProvider>
        <TodosProvider>
          <AgentProvider>
            <AppShellInner>{children}</AppShellInner>
          </AgentProvider>
        </TodosProvider>
      </FinanceProvider>
    </DocsProvider>
  );
}
