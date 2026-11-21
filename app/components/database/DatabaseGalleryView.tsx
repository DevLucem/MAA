"use client";

import Link from "next/link";
import { Icon } from "../../assets/icons";
import {
  type DatabaseView,
  formatNumberProperty,
  formatPlainDateShort,
  getRowPropertyValue,
  type InlineDatabase,
  isDatePropertyValue,
  NOTION_COLOR_PILL_CLASS,
} from "../../lib/database-types";
import {
  type Doc,
  flattenDocBlocks,
  htmlToPlainText,
  resolveCoverBackground,
} from "../../lib/docs-utils";

interface DatabaseGalleryViewProps {
  db: InlineDatabase;
  view: DatabaseView;
  rows: Doc[];
  onCreateRow: () => void;
}

const GRID_CLASS_BY_SIZE = {
  small: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4",
  medium: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  large: "grid-cols-1 sm:grid-cols-2",
} as const;

/** Notion Gallery card grid using stretched-link card pattern and live mini page previews. */
export function DatabaseGalleryView({
  db,
  view,
  rows,
  onCreateRow,
}: DatabaseGalleryViewProps) {
  const size = view.cardSize ?? "medium";
  const gridClass = GRID_CLASS_BY_SIZE[size];
  const metaProps = view.visiblePropertyIds
    .filter((id) => id !== db.titlePropertyId)
    .map((id) => db.properties.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  return (
    <div className="space-y-2">
      <div className={`grid gap-3 ${gridClass}`}>
        {rows.map((row) => {
          const coverBg =
            view.cardCover === "page_cover"
              ? resolveCoverBackground(row.cover)
              : null;

          const previewBlocks = flattenDocBlocks(row.blocks)
            .filter(
              (b) =>
                b.type !== "divider" &&
                b.type !== "columns" &&
                (b.type === "database" || htmlToPlainText(b.content).length > 0)
            )
            .slice(0, 4);

          return (
            <article
              key={row.id}
              className="db-gallery-card flex flex-col overflow-hidden rounded-lg border border-border bg-canvas transition-colors"
            >
              {coverBg ? (
                <div
                  aria-hidden="true"
                  className="h-28 w-full shrink-0 border-b border-border"
                  style={{ background: coverBg }}
                />
              ) : (
                <div
                  aria-hidden="true"
                  className="h-28 w-full shrink-0 overflow-hidden border-b border-border bg-surface/60 p-3 text-[11px] leading-4 text-muted"
                >
                  {previewBlocks.length === 0 ? (
                    <span className="text-muted/50 italic">Empty page</span>
                  ) : (
                    <div className="space-y-1">
                      {previewBlocks.map((block) => {
                        const text = htmlToPlainText(block.content);
                        if (block.type === "database") {
                          return (
                            <p
                              key={block.id}
                              className="truncate font-medium text-foreground/80"
                            >
                              🗃️ {text}
                            </p>
                          );
                        }
                        if (
                          block.type === "h1" ||
                          block.type === "h2" ||
                          block.type === "h3"
                        ) {
                          return (
                            <p
                              key={block.id}
                              className="truncate font-semibold text-foreground/90"
                            >
                              {text}
                            </p>
                          );
                        }
                        if (block.type === "bullet") {
                          return (
                            <p key={block.id} className="truncate">
                              • {text}
                            </p>
                          );
                        }
                        return (
                          <p key={block.id} className="truncate">
                            {text}
                          </p>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <h4 className="px-3 pt-2.5 text-sm font-medium text-foreground">
                <Link
                  href={`/docs/${row.id}`}
                  className="card-link inline-flex max-w-full items-center gap-1.5"
                >
                  {row.icon ? (
                    <span aria-hidden="true" className="shrink-0">
                      {row.icon}
                    </span>
                  ) : (
                    <Icon
                      name="document"
                      className="size-3.5 shrink-0 text-muted"
                    />
                  )}
                  <span className="truncate">
                    {row.title.trim() || "Untitled"}
                  </span>
                </Link>
              </h4>

              {metaProps.length > 0 && (
                <div className="flex flex-wrap items-center gap-1 px-3 pt-1.5 pb-2.5">
                  {metaProps.map((prop) => {
                    const val = getRowPropertyValue(row, db, prop);
                    if (
                      val === null ||
                      val === "" ||
                      (Array.isArray(val) && val.length === 0)
                    ) {
                      return null;
                    }
                    if (Array.isArray(val) && prop.type === "multi_select") {
                      return val.map((item) => {
                        const opt = prop.options?.find((o) => o.name === item);
                        return (
                          <span
                            key={`${prop.id}-${item}`}
                            className={`inline-flex rounded px-1.5 py-0.5 text-[11px] font-medium ${NOTION_COLOR_PILL_CLASS[opt?.color ?? "default"]}`}
                          >
                            {item}
                          </span>
                        );
                      });
                    }
                    if (typeof val === "string" && prop.type === "select") {
                      const opt = prop.options?.find((o) => o.name === val);
                      return (
                        <span
                          key={prop.id}
                          className={`inline-flex rounded px-1.5 py-0.5 text-[11px] font-medium ${NOTION_COLOR_PILL_CLASS[opt?.color ?? "default"]}`}
                        >
                          {val}
                        </span>
                      );
                    }
                    if (isDatePropertyValue(val)) {
                      return (
                        <span key={prop.id} className="text-[11px] text-muted">
                          {formatPlainDateShort(val)}
                        </span>
                      );
                    }
                    if (typeof val === "number") {
                      return (
                        <span
                          key={prop.id}
                          className="font-mono text-[11px] text-muted"
                        >
                          {formatNumberProperty(val, prop.numberFormat)}
                        </span>
                      );
                    }
                    return (
                      <span
                        key={prop.id}
                        className="truncate text-[11px] text-muted"
                      >
                        {String(val)}
                      </span>
                    );
                  })}
                </div>
              )}

              {metaProps.length === 0 && <div className="pb-2.5" />}
            </article>
          );
        })}

        {!db.locked && (
          <button
            type="button"
            onClick={onCreateRow}
            className="flex min-h-36 flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border bg-surface/40 p-4 text-xs font-medium text-muted transition-colors hover:border-muted hover:bg-surface hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
          >
            <Icon name="plus" className="size-4" />
            <span>New page</span>
          </button>
        )}
      </div>
    </div>
  );
}
