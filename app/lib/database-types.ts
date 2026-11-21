export type NotionColor =
  | "default"
  | "gray"
  | "brown"
  | "orange"
  | "yellow"
  | "green"
  | "blue"
  | "purple"
  | "pink"
  | "red";

export type BlockColor =
  | NotionColor
  | `${Exclude<NotionColor, "default">}_bg`;

export type DatabasePropertyType =
  | "title"
  | "text"
  | "number"
  | "select"
  | "multi_select"
  | "date"
  | "checkbox"
  | "url"
  | "relation"
  | "person"
  | "file"
  | "created_time"
  | "formula";

export interface SelectOption {
  id: string;
  name: string;
  color: NotionColor;
}

export interface DatabasePropertySchema {
  id: string;
  name: string;
  type: DatabasePropertyType;
  options?: SelectOption[];
  numberFormat?: "number" | "number_with_commas" | "percent";
  relationDatabaseId?: string;
  readOnly?: boolean;
  formulaKind?: "investment_approx";
}

export interface DatePropertyValue {
  start: string;
  end?: string;
}

export type PropertyValue =
  | string
  | number
  | boolean
  | string[]
  | DatePropertyValue
  | null;

export type DatabaseViewType =
  | "table"
  | "board"
  | "timeline"
  | "gallery"
  | "calendar";

export interface DatabaseFilter {
  id: string;
  propertyId: string;
  operator: "is" | "is_not" | "contains" | "is_empty" | "is_not_empty";
  values?: string[];
}

export interface DatabaseSort {
  propertyId: string;
  direction: "ascending" | "descending";
}

export interface DatabaseView {
  id: string;
  name: string;
  type: DatabaseViewType;
  visiblePropertyIds: string[];
  filters?: DatabaseFilter[];
  sorts?: DatabaseSort[];
  groupByPropertyId?: string;
  hideEmptyGroups?: boolean;
  timelineByPropertyId?: string;
  showTable?: boolean;
  calendarByPropertyId?: string;
  cardSize?: "small" | "medium" | "large";
  cardCover?: "none" | "page_cover" | "page_content";
}

export interface InlineDatabase {
  id: string;
  title: string;
  icon?: string;
  description?: string;
  locked?: boolean;
  fullWidth?: boolean;
  trashedAt?: string;
  parentDocId: string;
  titlePropertyId: string;
  properties: DatabasePropertySchema[];
  views: DatabaseView[];
}

export interface DatabaseRowRecord {
  id: string;
  title: string;
  createdAt: string;
  properties?: Record<string, PropertyValue>;
}

export interface PlainDateParts {
  year: number;
  month: number;
  day: number;
}

interface TemporalPlainDateLike {
  year: number;
  month: number;
  day: number;
}

interface TemporalLike {
  Now?: {
    plainDateISO: () => TemporalPlainDateLike;
  };
}

const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export const FULL_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export const NOTION_COLOR_PILL_CLASS: Record<NotionColor, string> = {
  default: "notion-pill-default",
  gray: "notion-pill-gray",
  brown: "notion-pill-brown",
  orange: "notion-pill-orange",
  yellow: "notion-pill-yellow",
  green: "notion-pill-green",
  blue: "notion-pill-blue",
  purple: "notion-pill-purple",
  pink: "notion-pill-pink",
  red: "notion-pill-red",
};

export function getNotionBlockColorClass(color?: BlockColor): string {
  if (!color || color === "default") return "";
  if (color.endsWith("_bg")) {
    const base = color.slice(0, -3);
    return `notion-bg-${base}`;
  }
  return `notion-text-${color}`;
}

export function getNotionDotColorVar(color: NotionColor): string {
  return `var(--notion-${color})`;
}

/** Parses YYYY-MM-DD (or leading ISO date) without Date string timezone drift. */
export function parsePlainDate(iso: string): PlainDateParts | null {
  if (!iso || typeof iso !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    return null;
  }
  return { year, month, day };
}

/** Formats calendar parts as strict ISO YYYY-MM-DD. */
export function formatPlainDate(parts: PlainDateParts): string {
  const y = String(parts.year).padStart(4, "0");
  const m = String(parts.month).padStart(2, "0");
  const d = String(parts.day).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Formats a single YYYY-MM-DD or DatePropertyValue for compact badge/cell display. */
export function formatPlainDateShort(
  value: string | DatePropertyValue
): string {
  if (typeof value === "string") {
    const parsed = parsePlainDate(value);
    if (!parsed) return value;
    return `${SHORT_MONTHS[parsed.month - 1]} ${parsed.day}, ${parsed.year}`;
  }
  const start = parsePlainDate(value.start);
  if (!start) return "";
  const startStr = `${SHORT_MONTHS[start.month - 1]} ${start.day}, ${start.year}`;
  if (!value.end) return startStr;
  const end = parsePlainDate(value.end);
  if (!end || value.end === value.start) return startStr;
  return `${startStr} → ${SHORT_MONTHS[end.month - 1]} ${end.day}, ${end.year}`;
}

/** Returns today's local calendar date (invoke only inside useEffect or event handlers). */
export function todayPlainDate(): PlainDateParts {
  const temporal = (globalThis as { Temporal?: TemporalLike }).Temporal;
  if (temporal?.Now?.plainDateISO) {
    const t = temporal.Now.plainDateISO();
    return { year: t.year, month: t.month, day: t.day };
  }
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
  };
}

/** Returns days in the given Gregorian year and 1-based month. */
export function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return isLeap ? 29 : 28;
  }
  if (month === 4 || month === 6 || month === 9 || month === 11) {
    return 30;
  }
  return 31;
}

/** Returns 0 (Sun) through 6 (Sat) using Sakamoto's calendar algorithm. */
export function dayOfWeek(parts: PlainDateParts): number {
  const offsets = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  let y = parts.year;
  if (parts.month < 3) y -= 1;
  return (
    (y +
      Math.floor(y / 4) -
      Math.floor(y / 100) +
      Math.floor(y / 400) +
      offsets[parts.month - 1] +
      parts.day) %
    7
  );
}

/** Converts PlainDateParts to days since 1970-01-01 using Hinnant's civil calendar math. */
export function plainDateToEpochDay(parts: PlainDateParts): number {
  const y = parts.year - (parts.month <= 2 ? 1 : 0);
  const era = Math.floor(y >= 0 ? y : y - 399) / 400;
  const eraInt = Math.trunc(era);
  const yoe = y - eraInt * 400;
  const doy =
    Math.floor((153 * (parts.month + (parts.month > 2 ? -3 : 9)) + 2) / 5) +
    parts.day -
    1;
  const doe =
    yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return eraInt * 146097 + doe - 719468;
}

/** Converts days since 1970-01-01 back into PlainDateParts. */
export function epochDayToPlainDate(epochDay: number): PlainDateParts {
  const z = epochDay + 719468;
  const era = Math.floor((z >= 0 ? z : z - 146096) / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor(
    (doe -
      Math.floor(doe / 1460) +
      Math.floor(doe / 36524) -
      Math.floor(doe / 146096)) /
      365
  );
  const y = yoe + era * 400;
  const doy =
    doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp + (mp < 10 ? 3 : -9);
  const year = y + (month <= 2 ? 1 : 0);
  return { year, month, day };
}

export function addMonthsPlainDate(
  year: number,
  month: number,
  delta: number
): { year: number; month: number } {
  const total = year * 12 + (month - 1) + delta;
  return {
    year: Math.floor(total / 12),
    month: (((total % 12) + 12) % 12) + 1,
  };
}

export function isDatePropertyValue(
  value: PropertyValue
): value is DatePropertyValue {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "start" in value &&
    typeof (value as { start?: unknown }).start === "string"
  );
}

/** Resolves any property value (including title, created_time, and formula) for a row doc. */
export function getRowPropertyValue(
  row: DatabaseRowRecord,
  db: InlineDatabase,
  prop: DatabasePropertySchema
): PropertyValue {
  if (prop.type === "title" || prop.id === db.titlePropertyId) {
    return row.title;
  }
  if (prop.type === "created_time") {
    return row.createdAt ? row.createdAt.slice(0, 10) : null;
  }
  if (prop.type === "formula" && prop.formulaKind === "investment_approx") {
    const manual = row.properties?.["Current value (manual)"];
    if (typeof manual === "number") return manual;
    const initial = Number(row.properties?.["Initial investment"] ?? 0);
    const topUps = Number(row.properties?.["Top-ups"] ?? 0);
    const yieldPct = Number(row.properties?.["Avg yield %"] ?? 0);
    const base = initial + topUps;
    if (!Number.isFinite(base) || base === 0) return null;
    return Math.round(base * (1 + (Number.isFinite(yieldPct) ? yieldPct : 0)));
  }
  const raw = row.properties?.[prop.id];
  return raw === undefined ? null : raw;
}

const textCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

export function formatNumberProperty(
  value: number,
  format?: DatabasePropertySchema["numberFormat"]
): string {
  if (!Number.isFinite(value)) return "";
  if (format === "percent") {
    return `${(value * 100).toFixed(2)}%`;
  }
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function getPropertySearchText(
  row: DatabaseRowRecord,
  db: InlineDatabase,
  prop: DatabasePropertySchema
): string {
  const val = getRowPropertyValue(row, db, prop);
  if (val === null || val === undefined) return "";
  if (typeof val === "string") return val;
  if (typeof val === "number") return formatNumberProperty(val, prop.numberFormat);
  if (typeof val === "boolean") return val ? "yes" : "no";
  if (Array.isArray(val)) return val.join(" ");
  if (isDatePropertyValue(val)) {
    return val.end ? `${val.start} ${val.end}` : val.start;
  }
  return "";
}

function matchesDatabaseFilter(
  row: DatabaseRowRecord,
  db: InlineDatabase,
  filter: DatabaseFilter
): boolean {
  const prop = db.properties.find((p) => p.id === filter.propertyId);
  if (!prop) return true;
  const val = getRowPropertyValue(row, db, prop);
  const targets = filter.values ?? [];

  const isEmpty =
    val === null ||
    val === undefined ||
    val === "" ||
    (Array.isArray(val) && val.length === 0) ||
    (isDatePropertyValue(val) && !val.start);

  if (filter.operator === "is_empty") return isEmpty;
  if (filter.operator === "is_not_empty") return !isEmpty;

  if (filter.operator === "is") {
    if (targets.length === 0) return true;
    if (Array.isArray(val)) return val.some((item) => targets.includes(item));
    if (typeof val === "boolean") {
      return targets.includes(val ? "true" : "false");
    }
    return targets.includes(String(val ?? ""));
  }

  if (filter.operator === "is_not") {
    if (targets.length === 0) return true;
    if (Array.isArray(val)) return !val.some((item) => targets.includes(item));
    if (typeof val === "boolean") {
      return !targets.includes(val ? "true" : "false");
    }
    return !targets.includes(String(val ?? ""));
  }

  if (filter.operator === "contains") {
    if (targets.length === 0) return true;
    const text = getPropertySearchText(row, db, prop).toLowerCase();
    return targets.some((t) => text.includes(t.toLowerCase()));
  }

  return true;
}

function getComparableSortValue(
  row: DatabaseRowRecord,
  db: InlineDatabase,
  prop: DatabasePropertySchema
): { kind: "empty" } | { kind: "number"; num: number } | { kind: "text"; text: string } {
  const val = getRowPropertyValue(row, db, prop);
  if (val === null || val === undefined || val === "") {
    return { kind: "empty" };
  }
  if (prop.type === "number" || prop.type === "formula") {
    if (typeof val === "number" && Number.isFinite(val)) {
      return { kind: "number", num: val };
    }
    return { kind: "empty" };
  }
  if (prop.type === "date" || prop.type === "created_time") {
    const startStr = isDatePropertyValue(val)
      ? val.start
      : typeof val === "string"
        ? val
        : "";
    const parsed = parsePlainDate(startStr);
    return parsed ? { kind: "number", num: plainDateToEpochDay(parsed) } : { kind: "empty" };
  }
  if (prop.type === "checkbox") {
    return { kind: "number", num: val ? 1 : 0 };
  }
  if (Array.isArray(val)) {
    return val.length > 0
      ? { kind: "text", text: val.join(", ") }
      : { kind: "empty" };
  }
  return { kind: "text", text: String(val) };
}

/** Filters and sorts database rows using view config, search query, and optional active sort. */
export function filterAndSortDatabaseRows<T extends DatabaseRowRecord>(
  rows: T[],
  db: InlineDatabase,
  view: DatabaseView,
  searchQuery: string,
  runtimeSort?: DatabaseSort | null
): T[] {
  const activeFilters = view.filters ?? [];
  const q = searchQuery.trim().toLowerCase();

  const filtered = rows.filter((row) => {
    for (const filter of activeFilters) {
      if (!matchesDatabaseFilter(row, db, filter)) return false;
    }
    if (!q) return true;
    if ((row.title || "Untitled").toLowerCase().includes(q)) return true;
    return db.properties.some((prop) =>
      getPropertySearchText(row, db, prop).toLowerCase().includes(q)
    );
  });

  const sorts = runtimeSort ? [runtimeSort] : (view.sorts ?? []);
  if (sorts.length === 0) return filtered;

  return [...filtered].sort((a, b) => {
    for (const sort of sorts) {
      const prop = db.properties.find((p) => p.id === sort.propertyId);
      if (!prop) continue;
      const ca = getComparableSortValue(a, db, prop);
      const cb = getComparableSortValue(b, db, prop);
      if (ca.kind === "empty" && cb.kind === "empty") continue;
      if (ca.kind === "empty") return 1;
      if (cb.kind === "empty") return -1;

      const factor = sort.direction === "ascending" ? 1 : -1;
      let cmp = 0;
      if (ca.kind === "number" && cb.kind === "number") {
        cmp = ca.num - cb.num;
      } else if (ca.kind === "text" && cb.kind === "text") {
        cmp = textCollator.compare(ca.text, cb.text);
      }
      if (cmp !== 0) return cmp * factor;
    }
    return 0;
  });
}

export function createDefaultDatabase(
  parentDocId: string,
  initialViewType: DatabaseViewType = "table",
  createIdFn: () => string
): InlineDatabase {
  const dbId = `db-${createIdFn()}`;
  const viewId = `view-${createIdFn()}`;
  const viewLabels: Record<DatabaseViewType, string> = {
    table: "Table",
    board: "Board",
    timeline: "Timeline",
    gallery: "Gallery",
    calendar: "Calendar",
  };

  return {
    id: dbId,
    title: "Untitled Database",
    icon: "🗃️",
    parentDocId,
    titlePropertyId: "Name",
    properties: [
      { id: "Name", name: "Name", type: "title" },
      {
        id: "Status",
        name: "Status",
        type: "select",
        options: [
          { id: "not-started", name: "Not started", color: "red" },
          { id: "in-progress", name: "In progress", color: "yellow" },
          { id: "completed", name: "Completed", color: "green" },
        ],
      },
      {
        id: "Tags",
        name: "Tags",
        type: "multi_select",
        options: [
          { id: "priority", name: "Priority", color: "blue" },
          { id: "personal", name: "Personal", color: "purple" },
        ],
      },
      { id: "Date", name: "Date", type: "date" },
    ],
    views: [
      {
        id: viewId,
        name: viewLabels[initialViewType],
        type: initialViewType,
        visiblePropertyIds: ["Name", "Status", "Tags", "Date"],
        groupByPropertyId: "Status",
        timelineByPropertyId: "Date",
        calendarByPropertyId: "Date",
        showTable: true,
        cardSize: "medium",
        cardCover: "page_content",
      },
    ],
  };
}
