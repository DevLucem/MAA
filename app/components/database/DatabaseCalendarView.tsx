"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Icon } from "../../assets/icons";
import {
  addMonthsPlainDate,
  type DatabaseView,
  dayOfWeek,
  daysInMonth,
  formatPlainDate,
  FULL_MONTHS,
  getRowPropertyValue,
  type InlineDatabase,
  isDatePropertyValue,
  parsePlainDate,
  type PlainDateParts,
  type PropertyValue,
  todayPlainDate,
} from "../../lib/database-types";
import type { Doc } from "../../lib/docs-utils";
import { useTodayIsoDate } from "../../lib/use-client-date";

interface DatabaseCalendarViewProps {
  db: InlineDatabase;
  view: DatabaseView;
  rows: Doc[];
  onCreateRow: (initialProps?: Record<string, PropertyValue>) => void;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Location-agnostic Monthly Calendar view powered by pure PlainDate arithmetic. */
export function DatabaseCalendarView({
  db,
  view,
  rows,
  onCreateRow,
}: DatabaseCalendarViewProps) {
  const dateProp =
    db.properties.find((p) => p.id === view.calendarByPropertyId) ??
    db.properties.find((p) => p.type === "date");

  const [cursor, setCursor] = useState<{ year: number; month: number }>(() => {
    if (dateProp) {
      for (const row of rows) {
        const val = getRowPropertyValue(row, db, dateProp);
        const startStr = isDatePropertyValue(val)
          ? val.start
          : typeof val === "string"
            ? val
            : "";
        const parsed = parsePlainDate(startStr);
        if (parsed) {
          return { year: parsed.year, month: parsed.month };
        }
      }
    }
    return { year: 2026, month: 3 };
  });
  const todayIso = useTodayIsoDate();
  const today = useMemo(
    () => (todayIso ? parsePlainDate(todayIso) : null),
    [todayIso]
  );

  const gridCells = useMemo(() => {
    const firstOfMonth: PlainDateParts = {
      year: cursor.year,
      month: cursor.month,
      day: 1,
    };
    const startOffset = dayOfWeek(firstOfMonth);
    const totalDays = daysInMonth(cursor.year, cursor.month);
    const totalCells = Math.ceil((startOffset + totalDays) / 7) * 7;

    const prevMonth = addMonthsPlainDate(cursor.year, cursor.month, -1);
    const prevMonthDays = daysInMonth(prevMonth.year, prevMonth.month);
    const nextMonth = addMonthsPlainDate(cursor.year, cursor.month, 1);

    const cells: Array<{
      date: PlainDateParts;
      iso: string;
      inCurrentMonth: boolean;
    }> = [];

    for (let i = 0; i < totalCells; i += 1) {
      if (i < startOffset) {
        const day = prevMonthDays - startOffset + i + 1;
        const date = { year: prevMonth.year, month: prevMonth.month, day };
        cells.push({ date, iso: formatPlainDate(date), inCurrentMonth: false });
      } else if (i < startOffset + totalDays) {
        const day = i - startOffset + 1;
        const date = { year: cursor.year, month: cursor.month, day };
        cells.push({ date, iso: formatPlainDate(date), inCurrentMonth: true });
      } else {
        const day = i - (startOffset + totalDays) + 1;
        const date = { year: nextMonth.year, month: nextMonth.month, day };
        cells.push({ date, iso: formatPlainDate(date), inCurrentMonth: false });
      }
    }
    return cells;
  }, [cursor.month, cursor.year]);

  const datedRows = useMemo(() => {
    if (!dateProp) return [];
    const items: Array<{ doc: Doc; start: string; end: string }> = [];
    for (const row of rows) {
      const val = getRowPropertyValue(row, db, dateProp);
      if (isDatePropertyValue(val) && val.start) {
        items.push({
          doc: row,
          start: val.start.slice(0, 10),
          end: (val.end || val.start).slice(0, 10),
        });
      }
    }
    return items;
  }, [dateProp, db, rows]);

  return (
    <div className="space-y-2 rounded-lg border border-border bg-canvas p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">
          {FULL_MONTHS[cursor.month - 1]} {cursor.year}
        </h3>

        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() =>
              setCursor((c) => addMonthsPlainDate(c.year, c.month, -1))
            }
            className="inline-flex h-7 items-center rounded border border-border px-2 text-xs text-foreground hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => {
              const now = todayPlainDate();
              setCursor({ year: now.year, month: now.month });
            }}
            className="inline-flex h-7 items-center rounded border border-border px-2.5 text-xs font-medium text-foreground hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary"
          >
            Today
          </button>
          <button
            type="button"
            aria-label="Next month"
            onClick={() =>
              setCursor((c) => addMonthsPlainDate(c.year, c.month, 1))
            }
            className="inline-flex h-7 items-center rounded border border-border px-2 text-xs text-foreground hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary"
          >
            →
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[540px]">
          <div className="grid grid-cols-7 border-b border-border text-center text-xs font-medium text-muted">
            {WEEKDAYS.map((day) => (
              <div key={day} className="py-1.5">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 border-s border-border">
            {gridCells.map((cell) => {
              const isToday =
                today !== null &&
                cell.date.year === today.year &&
                cell.date.month === today.month &&
                cell.date.day === today.day;

              const cellDocs = datedRows.filter(
                (entry) => cell.iso >= entry.start && cell.iso <= entry.end
              );

              return (
                <div
                  key={cell.iso}
                  className={`group flex min-h-24 flex-col border-e border-b border-border p-1 ${
                    cell.inCurrentMonth ? "bg-canvas" : "bg-surface/60 text-muted"
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span
                      className={`inline-flex size-5 items-center justify-center rounded-full text-xs ${
                        isToday
                          ? "bg-danger font-semibold text-danger-foreground"
                          : "font-medium"
                      }`}
                    >
                      {cell.date.day}
                    </span>

                    {!db.locked && dateProp && (
                      <button
                        type="button"
                        aria-label={`Add item on ${cell.iso}`}
                        onClick={() =>
                          onCreateRow({ [dateProp.id]: { start: cell.iso } })
                        }
                        className="inline-flex size-5 items-center justify-center rounded text-muted opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-secondary hover:text-foreground focus-visible:opacity-100"
                      >
                        <Icon name="plus" className="size-3" />
                      </button>
                    )}
                  </div>

                  <div className="space-y-1">
                    {cellDocs.slice(0, 3).map(({ doc }) => (
                      <Link
                        key={doc.id}
                        href={`/docs/${doc.id}`}
                        className="flex items-center gap-1 truncate rounded border border-border bg-surface px-1.5 py-0.5 text-[11px] font-medium text-foreground hover:border-primary hover:bg-secondary"
                      >
                        {doc.icon && (
                          <span aria-hidden="true" className="shrink-0">
                            {doc.icon}
                          </span>
                        )}
                        <span className="truncate">
                          {doc.title.trim() || "Untitled"}
                        </span>
                      </Link>
                    ))}
                    {cellDocs.length > 3 && (
                      <span className="block px-1 text-[10px] text-muted">
                        +{cellDocs.length - 3} more
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
