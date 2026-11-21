"use client";

import { useDocs } from "../lib/docs-store";
import type { Doc } from "../lib/docs-utils";
import { PropertyCellInput } from "./database/PropertyCellInput";

/** Editable Notion properties block displayed beneath the page title for database items. */
export function PagePropertiesPanel({ doc }: { doc: Doc }) {
  const { getDatabase, updateDocProperty } = useDocs();
  if (!doc.databaseId) return null;

  const db = getDatabase(doc.databaseId);
  if (!db) return null;

  const nonTitleProps = db.properties.filter(
    (prop) => prop.id !== db.titlePropertyId && prop.type !== "title"
  );
  if (nonTitleProps.length === 0) return null;

  return (
    <section
      aria-label={`${db.title} properties`}
      className="mb-6 rounded-lg border border-border/70 bg-surface/40 px-3 py-2"
    >
      <dl className="divide-y divide-border/50">
        {nonTitleProps.map((prop) => (
          <div
            key={prop.id}
            className="flex flex-col gap-1 py-1.5 sm:flex-row sm:items-center sm:gap-4"
          >
            <dt className="w-36 shrink-0 text-xs font-medium text-muted">
              {prop.name}
            </dt>
            <dd className="min-w-0 flex-1">
              <PropertyCellInput
                row={doc}
                db={db}
                prop={prop}
                locked={db.locked}
                onUpdateProperty={updateDocProperty}
              />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
