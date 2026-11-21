"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../../assets/icons";
import {
  addMonthsPlainDate,
  type DatabaseView,
  epochDayToPlainDate,
  formatPlainDateShort,
  FULL_MONTHS,
  getNotionDotColorVar,
  getRowPropertyValue,
  type InlineDatabase,
  isDatePropertyValue,
  NOTION_COLOR_PILL_CLASS,
  type NotionColor,
  parsePlainDate,
  plainDateToEpochDay,
  todayPlainDate,
} from "../../lib/database-types";
import type { Doc } from "../../lib/docs-utils";
import { useTodayIsoDate } from "../../lib/use-client-date";

type TimelineZoom = "month" | "quarter" | "year";

const ZOOM_PX_PER_DAY: Record<TimelineZoom, number> = {
  month: 10,
  quarter: 4.5,
  year: 1.6,
};

interface DatabaseTimelineViewProps {
  db: InlineDatabase;
  view: DatabaseView;
  rows: Doc[];
  onCreateRow: () => void;
}

interface TimelineItem {
  doc: Doc;
  startDay: number;
  endDay: number;
  dateLabel: string;
  color: NotionColor;
}

/** Synchronized split-pane Gantt Timeline view with Month/Quarter/Year zoom and Today marker. */
export function DatabaseTimelineView({
  db,
  view,
  rows,
  onCreateRow,
}: DatabaseTimelineViewProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const dateProp =
    db.properties.find((p) => p.id === view.timelineByPropertyId) ??
    db.properties.find((p) => p.type === "date");
  const statusProp = db.properties.find((p) => p.type === "select");

  const todayIso = useTodayIsoDate();
  const todayDay = useMemo(() => {
    if (!todayIso) return null;
    const parsed = parsePlainDate(todayIso);
    return parsed ? plainDateToEpochDay(parsed) : null;
  }, [todayIso]);

  const { items, undatedRows, minDay, maxDay, defaultZoom } = useMemo(() => {
    const dated: TimelineItem[] = [];
    const undated: Doc[] = [];
    let min = Infinity;
    let max = -Infinity;

    for (const row of rows) {
      const val = dateProp ? getRowPropertyValue(row, db, dateProp) : null;
      const startParsed = isDatePropertyValue(val)
        ? parsePlainDate(val.start)
        : null;

      if (!startParsed) {
        undated.push(row);
        continue;
      }

      const endParsed =
        (isDatePropertyValue(val) && val.end ? parsePlainDate(val.end) : null) ??
        startParsed;

      const sDay = plainDateToEpochDay(startParsed);
      const eDay = Math.max(sDay, plainDateToEpochDay(endParsed));
      min = Math.min(min, sDay);
      max = Math.max(max, eDay);

      let color: NotionColor = "blue";
      if (statusProp) {
        const sVal = getRowPropertyValue(row, db, statusProp);
        if (typeof sVal === "string" && sVal) {
          const opt = statusProp.options?.find((o) => o.name === sVal);
          if (opt) color = opt.color;
        }
      }

      dated.push({
        doc: row,
        startDay: sDay,
        endDay: eDay,
        dateLabel: isDatePropertyValue(val) ? formatPlainDateShort(val) : "",
        color,
      });
    }

    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      const anchorDay =
        todayDay ?? plainDateToEpochDay({ year: 2026, month: 1, day: 1 });
      return {
        items: dated,
        undatedRows: undated,
        minDay: anchorDay - 180,
        maxDay: anchorDay + 185,
        defaultZoom: "year" as TimelineZoom,
      };
    }

    const rangeMin =
      todayDay !== null
        ? Math.min(min - 21, todayDay - 150)
        : min - 21;
    const rangeMax =
      todayDay !== null
        ? Math.max(max + 30, todayDay + 180)
        : max + 30;
    const span = rangeMax - rangeMin;
    const computedZoom: TimelineZoom =
      span > 550 ? "year" : span > 140 ? "quarter" : "month";

    return {
      items: dated,
      undatedRows: undated,
      minDay: rangeMin,
      maxDay: rangeMax,
      defaultZoom: computedZoom,
    };
  }, [dateProp, db, rows, statusProp, todayDay]);

  const [userZoom, setZoom] = useState<TimelineZoom | null>(null);
  const zoom = userZoom ?? defaultZoom;

  const pxPerDay = ZOOM_PX_PER_DAY[zoom];
  const totalDays = Math.max(30, maxDay - minDay + 1);
  const canvasWidth = Math.max(580, Math.round(totalDays * pxPerDay));

  const monthTicks = useMemo(() => {
    const startParts = epochDayToPlainDate(minDay);
    const endParts = epochDayToPlainDate(maxDay);
    const ticks: Array<{
      key: string;
      label: string;
      leftPx: number;
      widthPx: number;
    }> = [];

    let cursor = { year: startParts.year, month: startParts.month };
    while (
      cursor.year < endParts.year ||
      (cursor.year === endParts.year && cursor.month <= endParts.month)
    ) {
      const mStartDay = plainDateToEpochDay({
        year: cursor.year,
        month: cursor.month,
        day: 1,
      });
      const nextCursor = addMonthsPlainDate(cursor.year, cursor.month, 1);
      const mNextStartDay = plainDateToEpochDay({
        year: nextCursor.year,
        month: nextCursor.month,
        day: 1,
      });

      const clampedStart = Math.max(minDay, mStartDay);
      const clampedEnd = Math.min(maxDay + 1, mNextStartDay);
      if (clampedEnd > clampedStart) {
        const widthPx = (clampedEnd - clampedStart) * pxPerDay;
        const shortMonth = FULL_MONTHS[cursor.month - 1].slice(0, 3);
        const showYear = cursor.month === 1 || ticks.length === 0;
        const label =
          widthPx < 28
            ? ""
            : showYear
              ? widthPx >= 72
                ? `${shortMonth} ${cursor.year}`
                : widthPx >= 46
                  ? `${shortMonth} '${String(cursor.year).slice(-2)}`
                  : shortMonth
              : shortMonth;
        ticks.push({
          key: `${cursor.year}-${cursor.month}`,
          label,
          leftPx: (clampedStart - minDay) * pxPerDay,
          widthPx,
        });
      }

      cursor = nextCursor;
    }

    return ticks;
  }, [maxDay, minDay, pxPerDay]);

  const showTodayLine =
    todayDay !== null && todayDay >= minDay && todayDay <= maxDay;
  const todayLeftPx =
    todayDay !== null ? Math.round((todayDay - minDay) * pxPerDay) : 0;

  const lastAutoScrolledKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (todayDay === null) return;
    const scroller = scrollerRef.current;
    if (!scroller) return;
    if (todayDay < minDay || todayDay > maxDay) return;

    const scrollKey = `${db.id}:${view.id}`;
    if (lastAutoScrolledKeyRef.current === scrollKey) return;

    const frame = requestAnimationFrame(() => {
      const currentScroller = scrollerRef.current;
      if (!currentScroller || currentScroller.clientWidth === 0) return;
      const targetX =
        (todayDay - minDay) * pxPerDay - currentScroller.clientWidth / 2;
      currentScroller.scrollLeft = Math.max(0, targetX);
      lastAutoScrolledKeyRef.current = scrollKey;
    });

    return () => cancelAnimationFrame(frame);
  }, [db.id, view.id, todayDay, minDay, maxDay, pxPerDay]);

  const handleJumpToday = () => {
    const nowDay = todayDay ?? plainDateToEpochDay(todayPlainDate());
    const scroller = scrollerRef.current;
    if (scroller && nowDay >= minDay && nowDay <= maxDay) {
      const x = (nowDay - minDay) * pxPerDay - scroller.clientWidth / 2;
      scroller.scrollTo({ left: Math.max(0, x), behavior: "smooth" });
    }
  };

  const showTablePane = view.showTable !== false;

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-lg border border-border bg-canvas">
        {/* Timeline Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface px-3 py-1.5">
          <span className="text-xs text-muted">
            {items.length} scheduled
            {undatedRows.length > 0 ? ` · ${undatedRows.length} undated` : ""}
          </span>
          <div className="flex items-center gap-1.5">
            <div
              role="group"
              aria-label="Timeline zoom"
              className="inline-flex rounded-md border border-border bg-canvas p-0.5 text-xs"
            >
              {(["month", "quarter", "year"] as const).map((level) => (
                <button
                  key={level}
                  type="button"
                  aria-pressed={zoom === level}
                  onClick={() => setZoom(level)}
                  className={`rounded px-2 py-0.5 capitalize transition-colors ${
                    zoom === level
                      ? "bg-secondary font-medium text-foreground"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={handleJumpToday}
              className="inline-flex h-6 items-center rounded border border-border bg-canvas px-2 text-xs font-medium text-foreground hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary"
            >
              Today
            </button>
          </div>
        </div>

        {/* Synchronized Split Pane */}
        <div className="flex">
          {showTablePane && (
            <div className="w-40 shrink-0 border-e border-border bg-canvas sm:w-52">
              <div className="flex h-8 items-center border-b border-border bg-surface px-2.5 text-xs font-medium text-muted">
                Name
              </div>
              {items.length === 0 ? (
                <div className="flex h-10 items-center px-2.5 text-xs text-muted">
                  No dated items
                </div>
              ) : (
                items.map((item) => (
                  <div
                    key={item.doc.id}
                    className="flex h-9 items-center border-b border-border/70 px-2.5 last:border-b-0"
                  >
                    <Link
                      href={`/docs/${item.doc.id}`}
                      className="flex min-w-0 items-center gap-1.5 truncate text-xs font-medium text-foreground hover:text-primary"
                    >
                      {item.doc.icon ? (
                        <span aria-hidden="true" className="shrink-0">
                          {item.doc.icon}
                        </span>
                      ) : (
                        <Icon
                          name="document"
                          className="size-3.5 shrink-0 text-muted"
                        />
                      )}
                      <span className="truncate">
                        {item.doc.title.trim() || "Untitled"}
                      </span>
                    </Link>
                  </div>
                ))
              )}
            </div>
          )}

          <div
            ref={scrollerRef}
            tabIndex={0}
            role="region"
            aria-label={`${db.title} timeline grid`}
            className="relative flex-1 overflow-x-auto bg-canvas focus-visible:outline-2 focus-visible:outline-primary"
          >
            <div
              className="relative"
              style={{ width: `${canvasWidth}px`, minWidth: "100%" }}
            >
              {/* Month scale header */}
              <div className="relative flex h-8 border-b border-border bg-surface">
                {monthTicks.map((tick) => (
                  <div
                    key={tick.key}
                    style={{
                      left: `${tick.leftPx}px`,
                      width: `${tick.widthPx}px`,
                    }}
                    className="absolute top-0 bottom-0 flex items-center overflow-hidden border-e border-border/70 px-2 text-[11px] font-medium whitespace-nowrap text-muted"
                  >
                    {tick.label}
                  </div>
                ))}
              </div>

              {/* Today marker line */}
              {showTodayLine && (
                <div
                  aria-hidden="true"
                  style={{ left: `${todayLeftPx}px` }}
                  className="pointer-events-none absolute top-0 bottom-0 z-10 w-px bg-danger"
                >
                  <span className="absolute top-1 -translate-x-1/2 rounded bg-danger px-1 py-0.5 text-[9px] font-semibold text-danger-foreground">
                    Today
                  </span>
                </div>
              )}

              {/* Timeline bars */}
              {items.length === 0 ? (
                <div className="flex h-10 items-center px-3 text-xs text-muted">
                  Add dates to items to view them on the timeline.
                </div>
              ) : (
                items.map((item) => {
                  const leftPx = Math.max(0, (item.startDay - minDay) * pxPerDay);
                  const rawWidth = (item.endDay - item.startDay + 1) * pxPerDay;
                  const widthPx = Math.max(96, rawWidth);

                  return (
                    <div
                      key={item.doc.id}
                      className="relative flex h-9 items-center border-b border-border/70 last:border-b-0"
                    >
                      <Link
                        href={`/docs/${item.doc.id}`}
                        title={`${item.doc.title || "Untitled"} (${item.dateLabel})`}
                        style={{
                          left: `${leftPx}px`,
                          width: `${widthPx}px`,
                        }}
                        className={`absolute flex h-7 items-center gap-1.5 overflow-hidden rounded-md border border-border px-2 text-xs font-medium shadow-2xs transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-primary ${NOTION_COLOR_PILL_CLASS[item.color]}`}
                      >
                        <span
                          aria-hidden="true"
                          className="size-1.5 shrink-0 rounded-full"
                          style={{
                            backgroundColor: getNotionDotColorVar(item.color),
                          }}
                        />
                        {item.doc.icon && (
                          <span aria-hidden="true" className="shrink-0">
                            {item.doc.icon}
                          </span>
                        )}
                        <span className="truncate">
                          {item.doc.title.trim() || "Untitled"}
                        </span>
                      </Link>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Undated items footer */}
        {undatedRows.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-border bg-surface/60 px-3 py-2 text-xs">
            <span className="font-medium text-muted">Unscheduled:</span>
            {undatedRows.map((row) => (
              <Link
                key={row.id}
                href={`/docs/${row.id}`}
                className="inline-flex items-center gap-1 rounded border border-border bg-canvas px-2 py-0.5 text-xs text-foreground hover:border-primary hover:bg-secondary"
              >
                {row.icon && <span aria-hidden="true">{row.icon}</span>}
                <span>{row.title.trim() || "Untitled"}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {!db.locked && (
        <button
          type="button"
          onClick={onCreateRow}
          className="inline-flex h-7 items-center gap-1 rounded px-2 text-xs font-medium text-muted transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
        >
          <Icon name="plus" className="size-3.5" />
          <span>New</span>
        </button>
      )}
    </div>
  );
}
