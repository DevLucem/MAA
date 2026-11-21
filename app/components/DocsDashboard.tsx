"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";
import { Icon } from "../assets/icons";
import { useDocs } from "../lib/docs-store";
import { getDocStats, getWorkspaceInsights } from "../lib/docs-utils";
import { useTodayIsoDate } from "../lib/use-client-date";

/** Docs overview dashboard with workspace insights, document list, and open tasks. */
export function DocsDashboard() {
  const searchId = useId();
  const router = useRouter();
  const { docs, createDoc, toggleTodo, deleteDoc } = useDocs();

  const [query, setQuery] = useState("");
  const todayPrefix = useTodayIsoDate() ?? "";

  const statsByDocId = useMemo(
    () => new Map(docs.map((doc) => [doc.id, getDocStats(doc)])),
    [docs]
  );

  const insights = useMemo(
    () => getWorkspaceInsights(docs, todayPrefix),
    [docs, todayPrefix]
  );

  const filteredDocs = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter((doc) => {
      const title = (doc.title || "Untitled").toLowerCase();
      const preview = (statsByDocId.get(doc.id)?.preview ?? "").toLowerCase();
      return title.includes(q) || preview.includes(q);
    });
  }, [docs, query, statsByDocId]);

  const taskCompletionPct =
    insights.todoTotal > 0
      ? Math.round((insights.todoCompleted / insights.todoTotal) * 100)
      : 0;

  const maxBlockGroupCount = Math.max(
    1,
    ...insights.blockTypeCounts.map((item) => item.count)
  );

  const handleCreateDoc = () => {
    const created = createDoc();
    router.push(`/docs/${created.id}`);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-8 lg:px-12">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Docs</h1>
          <p className="mt-1 text-sm text-muted">
            Workspace documents, writing metrics, and open action items.
          </p>
        </div>
        <button
          type="button"
          onClick={handleCreateDoc}
          className="primary inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <Icon name="plus" className="size-4" />
          New document
        </button>
      </div>

      {/* 4 Insight KPI Cards */}
      <section
        aria-label="Document insights"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs font-medium text-muted">Total Docs</p>
          <p className="mt-2 text-2xl font-bold tracking-tight">
            {insights.totalDocs}
          </p>
          <p className="mt-1 text-xs text-muted">
            {insights.updatedTodayCount} updated today
          </p>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs font-medium text-muted">Total Words</p>
          <p className="mt-2 text-2xl font-bold tracking-tight">
            {insights.totalWords.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-muted">
            ~{insights.totalReadingMinutes} min total read
          </p>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs font-medium text-muted">Task Progress</p>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <p className="text-2xl font-bold tracking-tight">
              {insights.todoCompleted}/{insights.todoTotal}
            </p>
            <span className="text-xs font-medium text-muted">
              {taskCompletionPct}%
            </span>
          </div>
          <div
            aria-hidden="true"
            className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary"
          >
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${taskCompletionPct}%` }}
            />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs font-medium text-muted">Total Blocks</p>
          <p className="mt-2 text-2xl font-bold tracking-tight">
            {insights.totalBlocks}
          </p>
          <p className="mt-1 text-xs text-muted">
            Avg {insights.avgWordsPerDoc} words / doc
          </p>
        </div>
      </section>

      {/* Insights & Documents Row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Documents List */}
        <section
          aria-label="Documents"
          className="rounded-xl border border-border bg-surface p-5 lg:col-span-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
            <h2 className="text-base font-semibold">Documents</h2>
            <div className="w-full sm:w-64">
              <label htmlFor={searchId} className="sr-only">
                Search documents
              </label>
              <input
                id={searchId}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter documents…"
                className="h-9 w-full rounded-md border border-border bg-canvas px-3 text-sm text-foreground placeholder:text-muted focus-visible:outline-2 focus-visible:outline-primary"
              />
            </div>
          </div>

          {filteredDocs.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm font-medium text-foreground">
                {docs.length === 0
                  ? "No documents yet"
                  : "No matching documents"}
              </p>
              <p className="mt-1 text-xs text-muted">
                {docs.length === 0
                  ? "Create your first document to get started."
                  : "Try a different search term."}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {filteredDocs.map((doc) => {
                const stats = statsByDocId.get(doc.id) ?? getDocStats(doc);
                const title = doc.title.trim() || "Untitled";
                return (
                  <li
                    key={doc.id}
                    className="flex items-start justify-between gap-3 py-3.5"
                  >
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/docs/${doc.id}`}
                        className="inline-flex max-w-full items-center gap-2 text-sm font-semibold text-foreground hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
                      >
                        {doc.icon ? (
                          <span
                            aria-hidden="true"
                            className="inline-flex size-4 shrink-0 items-center justify-center text-sm leading-none"
                          >
                            {doc.icon}
                          </span>
                        ) : (
                          <Icon
                            name="document"
                            className="size-4 shrink-0 text-muted"
                          />
                        )}
                        <span className="truncate">{title}</span>
                      </Link>
                      {stats.preview && (
                        <p className="mt-1 line-clamp-2 text-xs text-muted">
                          {stats.preview}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                        <span>
                          {stats.wordCount}{" "}
                          {stats.wordCount === 1 ? "word" : "words"}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{stats.readingMinutes} min read</span>
                        {stats.todoTotal > 0 && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="rounded-full bg-secondary px-2 py-0.5 font-medium text-secondary-foreground">
                              {stats.todoCompleted}/{stats.todoTotal} tasks
                            </span>
                          </>
                        )}
                        <span aria-hidden="true">·</span>
                        <span>Updated {doc.updatedAt.slice(0, 10)}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      aria-label={`Move ${title} to trash`}
                      title="Move to trash"
                      onClick={() => deleteDoc(doc.id)}
                      className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-secondary hover:text-danger focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      <Icon name="trash" className="size-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Right Insights Column */}
        <div className="space-y-6 lg:col-span-2">
          <section
            aria-label="Content Breakdown"
            className="rounded-xl border border-border bg-surface p-5"
          >
            <h2 className="text-base font-semibold">Content Breakdown</h2>
            <p className="mt-1 text-xs text-muted">
              Block distribution across all documents.
            </p>
            <div className="mt-4 space-y-3">
              {insights.blockTypeCounts.map((group) => {
                const widthPct = Math.round(
                  (group.count / maxBlockGroupCount) * 100
                );
                return (
                  <div key={group.label} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-foreground">
                        {group.label}
                      </span>
                      <span className="text-muted">{group.count}</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-primary transition-[width]"
                        style={{
                          width: `${group.count > 0 ? Math.max(6, widthPct) : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section
            aria-label="Open To-dos"
            className="rounded-xl border border-border bg-surface p-5"
          >
            <h2 className="text-base font-semibold">Open To-dos</h2>
            <p className="mt-1 text-xs text-muted">
              Unchecked tasks pulled directly from your docs.
            </p>

            {insights.openTodos.length === 0 ? (
              <p className="mt-4 text-xs text-muted">
                All to-do items are complete.
              </p>
            ) : (
              <ul className="mt-4 space-y-2.5">
                {insights.openTodos.map((todo) => (
                  <li
                    key={`${todo.docId}-${todo.blockId}`}
                    className="flex items-start gap-2.5 rounded-lg border border-border bg-canvas p-2.5"
                  >
                    <input
                      type="checkbox"
                      checked={false}
                      aria-label={`Complete "${todo.text}"`}
                      onChange={() => toggleTodo(todo.docId, todo.blockId)}
                      className="mt-0.5 size-4 shrink-0 cursor-pointer rounded border-border"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-foreground">{todo.text}</p>
                      <Link
                        href={`/docs/${todo.docId}`}
                        className="mt-0.5 inline-block text-xs text-muted hover:text-primary"
                      >
                        {todo.docTitle} →
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
