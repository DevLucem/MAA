import {
  addMonthsPlainDate,
  dayOfWeek,
  daysInMonth,
  epochDayToPlainDate,
  formatPlainDate,
  type NotionColor,
  parsePlainDate,
  plainDateToEpochDay,
} from "./database-types";
import { createId } from "./docs-utils";

export const TODOS_STORAGE_KEY = "maa-todos-v1";

export type TodoPriority = 1 | 2 | 3 | 4;
export type TodoViewLayout = "list" | "board";
export type TodoSortBy = "manual" | "due" | "priority" | "title" | "created";
export type TodoRecurrenceFrequency =
  | "daily"
  | "weekdays"
  | "weekly"
  | "monthly"
  | "yearly";

export interface TodoRecurrence {
  frequency: TodoRecurrenceFrequency;
  interval: number;
  /** 0 (Sun) - 6 (Sat), optionally used for weekly recurrence. */
  weekday?: number;
}

export interface TodoProject {
  id: string;
  name: string;
  color: NotionColor;
  icon?: string;
  parentId?: string;
  favorite?: boolean;
  viewLayout?: TodoViewLayout;
  order: number;
  createdAt: string;
  trashedAt?: string;
}

export interface TodoSection {
  id: string;
  projectId: string;
  name: string;
  order: number;
  collapsed?: boolean;
  createdAt: string;
}

export interface TodoLabel {
  id: string;
  name: string;
  color: NotionColor;
  favorite?: boolean;
}

export interface TodoComment {
  id: string;
  text: string;
  createdAt: string;
}

export interface TodoTask {
  id: string;
  title: string;
  description?: string;
  /** null means Inbox. */
  projectId: string | null;
  sectionId?: string | null;
  parentId?: string | null;
  priority: TodoPriority;
  /** Location-agnostic calendar date YYYY-MM-DD. */
  dueDate?: string;
  /** Wall-clock time HH:mm (24h). */
  dueTime?: string;
  recurrence?: TodoRecurrence;
  labels: string[];
  completed: boolean;
  completedAt?: string;
  order: number;
  comments?: TodoComment[];
  createdAt: string;
  updatedAt: string;
}

export interface TodoCompletionLog {
  id: string;
  taskId: string;
  title: string;
  projectId: string | null;
  completedAt: string;
  previousDueDate?: string;
}

export const PRIORITY_META: Record<
  TodoPriority,
  {
    label: string;
    short: string;
    colorVar: string;
    textClass: string;
    pillClass: string;
  }
> = {
  1: {
    label: "Priority 1",
    short: "P1",
    colorVar: "var(--danger)",
    textClass: "text-danger",
    pillClass: "notion-pill-red",
  },
  2: {
    label: "Priority 2",
    short: "P2",
    colorVar: "var(--notion-orange)",
    textClass: "notion-text-orange",
    pillClass: "notion-pill-orange",
  },
  3: {
    label: "Priority 3",
    short: "P3",
    colorVar: "var(--primary)",
    textClass: "text-primary",
    pillClass: "notion-pill-blue",
  },
  4: {
    label: "Priority 4",
    short: "P4",
    colorVar: "var(--muted)",
    textClass: "text-muted",
    pillClass: "notion-pill-default",
  },
};

export const PROJECT_COLORS: ReadonlyArray<{
  id: NotionColor;
  label: string;
  dotVar: string;
}> = [
  { id: "blue", label: "Blue", dotVar: "var(--notion-blue)" },
  { id: "red", label: "Red", dotVar: "var(--notion-red)" },
  { id: "orange", label: "Orange", dotVar: "var(--notion-orange)" },
  { id: "yellow", label: "Yellow", dotVar: "var(--notion-yellow)" },
  { id: "green", label: "Green", dotVar: "var(--notion-green)" },
  { id: "purple", label: "Purple", dotVar: "var(--notion-purple)" },
  { id: "pink", label: "Pink", dotVar: "var(--notion-pink)" },
  { id: "brown", label: "Brown", dotVar: "var(--notion-brown)" },
  { id: "gray", label: "Gray", dotVar: "var(--notion-gray)" },
  { id: "default", label: "Default", dotVar: "var(--muted)" },
];

const VALID_NOTION_COLORS = new Set<NotionColor>(
  PROJECT_COLORS.map((c) => c.id)
);

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

const FULL_WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const SHORT_WEEKDAYS = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
] as const;

interface TemporalPlainDateInstance {
  toString(): string;
  add(
    duration: { days?: number; months?: number; years?: number },
    options?: { overflow?: "constrain" | "reject" }
  ): TemporalPlainDateInstance;
}

interface TemporalPlainDateNamespace {
  from(value: string): TemporalPlainDateInstance;
}

function getTemporalPlainDate(): TemporalPlainDateNamespace | undefined {
  return (
    globalThis as { Temporal?: { PlainDate?: TemporalPlainDateNamespace } }
  ).Temporal?.PlainDate;
}

/** Normalizes a label name into a lowercase single-token slug without leading @. */
export function normalizeLabelName(name: string): string {
  return name
    .trim()
    .replace(/^[@#]+/, "")
    .replace(/\s+/g, "-")
    .toLowerCase();
}

export function projectDisplayName(project: Pick<TodoProject, "name">): string {
  return project.name.trim() || "Untitled project";
}

export interface ParsedTodoEmbedLink {
  projectId: string;
  sectionId?: string;
}

const TODO_PROJECT_PATH_PREFIX = "/todos/project/";

/** Builds an internal href for a Todo project or specific section deep link. */
export function buildTodoProjectHref(
  projectId: string,
  sectionId?: string | null
): string {
  const base = `${TODO_PROJECT_PATH_PREFIX}${encodeURIComponent(projectId)}`;
  const cleanSection = sectionId?.trim();
  return cleanSection ? `${base}?section=${encodeURIComponent(cleanSection)}` : base;
}

/** Builds a shareable URL for a Todo project or section using `origin` when available. */
export function buildTodoProjectUrl(
  projectId: string,
  sectionId?: string | null,
  origin?: string
): string {
  const href = buildTodoProjectHref(projectId, sectionId);
  const cleanOrigin = origin?.trim().replace(/\/+$/, "");
  return cleanOrigin ? `${cleanOrigin}${href}` : href;
}

/** Parses an internal path or full origin URL pointing to a Todo project or section. */
export function parseTodoEmbedLink(
  raw: string,
  currentOrigin?: string
): ParsedTodoEmbedLink | null {
  const trimmed = raw.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;

  let url: URL;
  if (trimmed.startsWith(TODO_PROJECT_PATH_PREFIX)) {
    try {
      url = new URL(trimmed, "http://localhost");
    } catch {
      return null;
    }
  } else if (/^https?:\/\//i.test(trimmed)) {
    try {
      url = new URL(trimmed);
    } catch {
      return null;
    }
    if (currentOrigin) {
      const normalizedOrigin = currentOrigin.trim().replace(/\/+$/, "");
      if (url.origin !== normalizedOrigin) return null;
    }
  } else {
    return null;
  }

  if (!url.pathname.startsWith(TODO_PROJECT_PATH_PREFIX)) return null;
  const rest = url.pathname.slice(TODO_PROJECT_PATH_PREFIX.length);
  const segments = rest.split("/");
  if (segments.length > 2 || (segments.length === 2 && segments[1] !== "")) {
    return null;
  }
  const rawProjectId = segments[0];
  if (!rawProjectId) return null;

  let projectId: string;
  try {
    projectId = decodeURIComponent(rawProjectId).trim();
  } catch {
    return null;
  }
  if (!projectId) return null;

  let sectionId = url.searchParams.get("section")?.trim() || undefined;
  if (!sectionId && url.hash.length > 1) {
    try {
      sectionId =
        new URLSearchParams(url.hash.slice(1)).get("section")?.trim() ||
        undefined;
    } catch {
      sectionId = undefined;
    }
  }

  return {
    projectId,
    ...(sectionId ? { sectionId } : {}),
  };
}

/** Validates and normalizes YYYY-MM-DD using strict civil calendar checks. */
export function normalizePlainDateIso(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const parsed = parsePlainDate(value);
  return parsed ? formatPlainDate(parsed) : undefined;
}

/** Validates wall-clock HH:mm (24h). */
export function normalizeDueTime(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return undefined;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return undefined;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** Adds delta calendar days to YYYY-MM-DD without timezone drift. */
export function addDaysIso(iso: string, delta: number): string {
  const TemporalPlainDate = getTemporalPlainDate();
  if (TemporalPlainDate) {
    try {
      return TemporalPlainDate.from(iso).add({ days: delta }).toString();
    } catch {
      // Fall back to civil calendar math if invalid
    }
  }
  const parts = parsePlainDate(iso);
  if (!parts) return iso;
  return formatPlainDate(epochDayToPlainDate(plainDateToEpochDay(parts) + delta));
}

/** Adds deltaMonths calendar months with overflow: 'constrain' month-end clamping. */
export function addMonthsIso(iso: string, deltaMonths: number): string {
  const TemporalPlainDate = getTemporalPlainDate();
  if (TemporalPlainDate) {
    try {
      return TemporalPlainDate.from(iso)
        .add({ months: deltaMonths }, { overflow: "constrain" })
        .toString();
    } catch {
      // Fall back to civil calendar math
    }
  }
  const parts = parsePlainDate(iso);
  if (!parts) return iso;
  const nextYm = addMonthsPlainDate(parts.year, parts.month, deltaMonths);
  const clampedDay = Math.min(parts.day, daysInMonth(nextYm.year, nextYm.month));
  return formatPlainDate({
    year: nextYm.year,
    month: nextYm.month,
    day: clampedDay,
  });
}

/** Returns 0 (Sun) through 6 (Sat) for a YYYY-MM-DD calendar date. */
export function getWeekdayFromIso(iso: string): number {
  const parts = parsePlainDate(iso);
  return parts ? dayOfWeek(parts) : 0;
}

/** Returns the upcoming Saturday (or next Saturday if today is Saturday). */
export function getNextWeekendIso(todayIso: string): string {
  const dow = getWeekdayFromIso(todayIso);
  const offset = dow === 6 ? 7 : 6 - dow;
  return addDaysIso(todayIso, offset);
}

/** Returns the upcoming Monday (next week start). */
export function getNextWeekMondayIso(todayIso: string): string {
  const dow = getWeekdayFromIso(todayIso);
  const offset = dow === 0 ? 1 : 8 - dow;
  return addDaysIso(todayIso, offset);
}

export function isOverdue(
  dueDate: string | undefined,
  todayIso: string
): boolean {
  return Boolean(dueDate && todayIso && dueDate < todayIso);
}

/** Formats HH:mm wall-clock time as 12-hour display (e.g. "3:00 PM"). */
export function formatDueTime(dueTime: string): string {
  const norm = normalizeDueTime(dueTime);
  if (!norm) return dueTime;
  const [hStr, mStr] = norm.split(":");
  const h24 = Number(hStr);
  const period = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${mStr} ${period}`;
}

export type DueTone = "overdue" | "today" | "tomorrow" | "upcoming" | "future";

/** Formats a task's due date + time into Todoist-style relative text and semantic tone. */
export function formatTodoDueLabel(
  dueDate: string,
  dueTime: string | undefined,
  todayIso: string
): { label: string; tone: DueTone } {
  const dParts = parsePlainDate(dueDate);
  const tParts = parsePlainDate(todayIso);
  if (!dParts) {
    return { label: dueDate, tone: "future" };
  }

  let label: string;
  let tone: DueTone = "future";

  if (tParts) {
    const diff = plainDateToEpochDay(dParts) - plainDateToEpochDay(tParts);
    if (diff < 0) {
      tone = "overdue";
      if (diff === -1) {
        label = "Yesterday";
      } else {
        label =
          dParts.year === tParts.year
            ? `${SHORT_MONTHS[dParts.month - 1]} ${dParts.day}`
            : `${SHORT_MONTHS[dParts.month - 1]} ${dParts.day}, ${dParts.year}`;
      }
    } else if (diff === 0) {
      tone = "today";
      label = "Today";
    } else if (diff === 1) {
      tone = "tomorrow";
      label = "Tomorrow";
    } else if (diff <= 6) {
      tone = "upcoming";
      label = FULL_WEEKDAYS[dayOfWeek(dParts)];
    } else {
      tone = "future";
      label =
        dParts.year === tParts.year
          ? `${SHORT_MONTHS[dParts.month - 1]} ${dParts.day}`
          : `${SHORT_MONTHS[dParts.month - 1]} ${dParts.day}, ${dParts.year}`;
    }
  } else {
    label = `${SHORT_MONTHS[dParts.month - 1]} ${dParts.day}`;
  }

  if (dueTime) {
    label = `${label} ${formatDueTime(dueTime)}`;
  }

  return { label, tone };
}

/** Formats day section headers in Upcoming & Today views. */
export function formatDayHeader(
  iso: string,
  todayIso: string
): { primary: string; secondary: string } {
  const dParts = parsePlainDate(iso);
  const tParts = parsePlainDate(todayIso);
  if (!dParts) return { primary: iso, secondary: "" };

  const primary =
    tParts && dParts.year !== tParts.year
      ? `${SHORT_MONTHS[dParts.month - 1]} ${dParts.day}, ${dParts.year}`
      : `${SHORT_MONTHS[dParts.month - 1]} ${dParts.day}`;

  const weekdayName = FULL_WEEKDAYS[dayOfWeek(dParts)];
  if (!tParts) return { primary, secondary: weekdayName };

  const diff = plainDateToEpochDay(dParts) - plainDateToEpochDay(tParts);
  if (diff === 0) return { primary, secondary: `Today · ${weekdayName}` };
  if (diff === 1) return { primary, secondary: `Tomorrow · ${weekdayName}` };
  if (diff === -1) return { primary, secondary: `Yesterday · ${weekdayName}` };
  return { primary, secondary: weekdayName };
}

/** Formats short header subtitle date (e.g. "Sun, Nov 22"). */
export function formatHeaderToday(iso: string): string {
  const parts = parsePlainDate(iso);
  if (!parts) return "";
  return `${SHORT_WEEKDAYS[dayOfWeek(parts)]}, ${SHORT_MONTHS[parts.month - 1]} ${parts.day}`;
}

export function formatShortMonthDay(iso: string): {
  month: string;
  weekdayShort: string;
  day: number;
} {
  const parts = parsePlainDate(iso);
  if (!parts) return { month: "", weekdayShort: "", day: 1 };
  return {
    month: SHORT_MONTHS[parts.month - 1],
    weekdayShort: SHORT_WEEKDAYS[dayOfWeek(parts)],
    day: parts.day,
  };
}

export function formatRecurrenceLabel(rec: TodoRecurrence): string {
  const interval = Math.max(1, Math.floor(rec.interval) || 1);
  if (rec.frequency === "weekdays") return "Every weekday";
  if (rec.frequency === "daily") {
    return interval === 1 ? "Every day" : `Every ${interval} days`;
  }
  if (rec.frequency === "weekly") {
    if (interval === 1 && rec.weekday !== undefined) {
      return `Every ${FULL_WEEKDAYS[rec.weekday] ?? "week"}`;
    }
    return interval === 1 ? "Every week" : `Every ${interval} weeks`;
  }
  if (rec.frequency === "monthly") {
    return interval === 1 ? "Every month" : `Every ${interval} months`;
  }
  return interval === 1 ? "Every year" : `Every ${interval} years`;
}

function stepRecurrenceOnce(iso: string, rec: TodoRecurrence): string {
  const interval = Math.max(1, Math.floor(rec.interval) || 1);
  switch (rec.frequency) {
    case "daily":
      return addDaysIso(iso, interval);
    case "weekdays": {
      let next = addDaysIso(iso, 1);
      for (let i = 0; i < 7; i += 1) {
        const dow = getWeekdayFromIso(next);
        if (dow !== 0 && dow !== 6) return next;
        next = addDaysIso(next, 1);
      }
      return next;
    }
    case "weekly":
      return addDaysIso(iso, 7 * interval);
    case "monthly":
      return addMonthsIso(iso, interval);
    case "yearly":
      return addMonthsIso(iso, 12 * interval);
  }
}

/** Advances a recurring task's due date strictly past todayIso so overdue recurrences land in the future. */
export function computeNextRecurrenceDate(
  fromIso: string,
  rec: TodoRecurrence,
  todayIso: string
): string {
  const base = normalizePlainDateIso(fromIso) ?? todayIso;
  let next = stepRecurrenceOnce(base, rec);
  if (!todayIso) return next;
  let guard = 0;
  while (next <= todayIso && guard < 1000) {
    next = stepRecurrenceOnce(next, rec);
    guard += 1;
  }
  return next;
}

const WEEKDAY_MAP: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};

const MONTH_MAP: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

function nextOccurrenceOfWeekday(todayIso: string, targetDow: number): string {
  const currentDow = getWeekdayFromIso(todayIso);
  let delta = (targetDow - currentDow + 7) % 7;
  if (delta === 0) delta = 7;
  return addDaysIso(todayIso, delta);
}

function nextWeekdayOnOrAfter(iso: string): string {
  let cur = iso;
  for (let i = 0; i < 7; i += 1) {
    const dow = getWeekdayFromIso(cur);
    if (dow !== 0 && dow !== 6) return cur;
    cur = addDaysIso(cur, 1);
  }
  return iso;
}

export interface ParsedQuickTodo {
  cleanedTitle: string;
  priority?: TodoPriority;
  dueDate?: string;
  dueTime?: string;
  recurrence?: TodoRecurrence;
  labels: string[];
  projectId?: string | null;
  matchedProjectName?: string;
}

/** Parses Todoist-style inline tokens (p1-p4, @label, #project, dates, times, and "every ..."). */
export function parseTodoQuickInput(
  raw: string,
  todayIso: string,
  projects: TodoProject[]
): ParsedQuickTodo {
  let text = raw;
  let priority: TodoPriority | undefined;
  let dueDate: string | undefined;
  let dueTime: string | undefined;
  let recurrence: TodoRecurrence | undefined;
  const labels: string[] = [];
  let projectId: string | null | undefined;
  let matchedProjectName: string | undefined;

  const consume = (pattern: RegExp, handler: (match: RegExpExecArray) => boolean) => {
    const re = new RegExp(pattern.source, pattern.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (handler(m)) {
        const before = text.slice(0, m.index);
        const after = text.slice(m.index + m[0].length);
        text = `${before} ${after}`;
        re.lastIndex = 0;
      } else {
        if (!re.global) break;
      }
    }
  };

  // 1. Priority p1..p4
  consume(/(?:^|\s)p([1-4])(?=$|\s)/i, (m) => {
    priority = Number(m[1]) as TodoPriority;
    return true;
  });

  // 2. @labels
  consume(/(?:^|\s)@([a-zA-Z0-9_-]+)(?=$|\s)/g, (m) => {
    const norm = normalizeLabelName(m[1]);
    if (norm && !labels.includes(norm)) labels.push(norm);
    return true;
  });

  // 3. #project (supports quoted #"Project Name" or #ProjectName)
  consume(/(?:^|\s)#(?:"([^"]+)"|([^\s#]+))(?=$|\s)/g, (m) => {
    const token = (m[1] ?? m[2] ?? "").trim();
    if (!token) return false;
    const lowered = token.toLowerCase();
    if (lowered === "inbox") {
      projectId = null;
      matchedProjectName = "Inbox";
      return true;
    }
    const slugged = lowered.replace(/[-_]+/g, " ");
    const match = projects.find((p) => {
      const pName = projectDisplayName(p).toLowerCase();
      return (
        pName === lowered ||
        pName === slugged ||
        pName.replace(/\s+/g, "") === lowered.replace(/\s+/g, "")
      );
    });
    if (match) {
      projectId = match.id;
      matchedProjectName = projectDisplayName(match);
      return true;
    }
    return false;
  });

  // 4. Recurrence ("every ...")
  consume(
    /(?:^|\s)every\s+(weekday|workday|work\s+day|other\s+day|other\s+week|other\s+month|(\d+)\s+(days?|weeks?|months?|years?)|(day|daily|week|weekly|month|monthly|year|yearly)|(mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?))(?=$|\s)/i,
    (m) => {
      const full = m[1].toLowerCase().replace(/\s+/g, " ");
      if (full === "weekday" || full === "workday" || full === "work day") {
        recurrence = { frequency: "weekdays", interval: 1 };
        return true;
      }
      if (full === "other day") {
        recurrence = { frequency: "daily", interval: 2 };
        return true;
      }
      if (full === "other week") {
        recurrence = { frequency: "weekly", interval: 2 };
        return true;
      }
      if (full === "other month") {
        recurrence = { frequency: "monthly", interval: 2 };
        return true;
      }
      if (m[2] && m[3]) {
        const n = Math.max(1, Math.min(365, Number(m[2]) || 1));
        const unit = m[3].toLowerCase();
        if (unit.startsWith("day")) recurrence = { frequency: "daily", interval: n };
        else if (unit.startsWith("week")) recurrence = { frequency: "weekly", interval: n };
        else if (unit.startsWith("month")) recurrence = { frequency: "monthly", interval: n };
        else if (unit.startsWith("year")) recurrence = { frequency: "yearly", interval: n };
        return Boolean(recurrence);
      }
      if (m[4]) {
        const unit = m[4].toLowerCase();
        if (unit === "day" || unit === "daily") recurrence = { frequency: "daily", interval: 1 };
        else if (unit === "week" || unit === "weekly") recurrence = { frequency: "weekly", interval: 1 };
        else if (unit === "month" || unit === "monthly") recurrence = { frequency: "monthly", interval: 1 };
        else if (unit === "year" || unit === "yearly") recurrence = { frequency: "yearly", interval: 1 };
        return Boolean(recurrence);
      }
      if (m[5]) {
        const dow = WEEKDAY_MAP[m[5].toLowerCase()];
        if (dow !== undefined) {
          recurrence = { frequency: "weekly", interval: 1, weekday: dow };
          return true;
        }
      }
      return false;
    }
  );

  if (!recurrence) {
    consume(/(?:^|\s)(daily|weekly|monthly|yearly|annually)(?=$|\s)/i, (m) => {
      const word = m[1].toLowerCase();
      if (word === "daily") recurrence = { frequency: "daily", interval: 1 };
      else if (word === "weekly") recurrence = { frequency: "weekly", interval: 1 };
      else if (word === "monthly") recurrence = { frequency: "monthly", interval: 1 };
      else recurrence = { frequency: "yearly", interval: 1 };
      return true;
    });
  }

  // 5. Explicit YYYY-MM-DD
  consume(/(?:^|\s)(\d{4}-\d{2}-\d{2})(?=$|\s)/, (m) => {
    const iso = normalizePlainDateIso(m[1]);
    if (!iso) return false;
    dueDate = iso;
    return true;
  });

  // 6. Relative date keywords
  if (!dueDate && todayIso) {
    consume(/(?:^|\s)(today|tod)(?=$|\s)/i, () => {
      dueDate = todayIso;
      return true;
    });
  }
  if (!dueDate && todayIso) {
    consume(/(?:^|\s)(tomorrow|tom)(?=$|\s)/i, () => {
      dueDate = addDaysIso(todayIso, 1);
      return true;
    });
  }
  if (!dueDate && todayIso) {
    consume(/(?:^|\s)(?:this\s+weekend|weekend)(?=$|\s)/i, () => {
      dueDate = getNextWeekendIso(todayIso);
      return true;
    });
  }
  if (!dueDate && todayIso) {
    consume(/(?:^|\s)next\s+week(?=$|\s)/i, () => {
      dueDate = getNextWeekMondayIso(todayIso);
      return true;
    });
  }
  if (!dueDate && todayIso) {
    consume(/(?:^|\s)in\s+(\d+)\s+days?(?=$|\s)/i, (m) => {
      const n = Math.max(0, Math.min(3650, Number(m[1]) || 0));
      dueDate = addDaysIso(todayIso, n);
      return true;
    });
  }
  if (!dueDate && todayIso) {
    consume(
      /(?:^|\s)(?:next\s+)?(mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)(?=$|\s)/i,
      (m) => {
        const dow = WEEKDAY_MAP[m[1].toLowerCase()];
        if (dow === undefined) return false;
        dueDate = nextOccurrenceOfWeekday(todayIso, dow);
        return true;
      }
    );
  }
  if (!dueDate && todayIso) {
    const todayParts = parsePlainDate(todayIso);
    if (todayParts) {
      consume(
        /(?:^|\s)(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?=$|\s)/i,
        (m) => {
          const month = MONTH_MAP[m[1].toLowerCase()];
          const day = Number(m[2]);
          if (!month || day < 1 || day > 31) return false;
          let year = todayParts.year;
          if (day > daysInMonth(year, month)) return false;
          let candidate = formatPlainDate({ year, month, day });
          if (candidate < todayIso) {
            year += 1;
            if (day <= daysInMonth(year, month)) {
              candidate = formatPlainDate({ year, month, day });
            }
          }
          dueDate = candidate;
          return true;
        }
      );
    }
  }
  if (!dueDate && todayIso) {
    const todayParts = parsePlainDate(todayIso);
    if (todayParts) {
      consume(
        /(?:^|\s)(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?=$|\s)/i,
        (m) => {
          const day = Number(m[1]);
          const month = MONTH_MAP[m[2].toLowerCase()];
          if (!month || day < 1 || day > 31) return false;
          let year = todayParts.year;
          if (day > daysInMonth(year, month)) return false;
          let candidate = formatPlainDate({ year, month, day });
          if (candidate < todayIso) {
            year += 1;
            if (day <= daysInMonth(year, month)) {
              candidate = formatPlainDate({ year, month, day });
            }
          }
          dueDate = candidate;
          return true;
        }
      );
    }
  }

  // 7. Wall-clock times: "at 3pm", "at 9:30am", "3:30pm", "at 14:30"
  consume(
    /(?:^|\s)(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)(?=$|\s)/i,
    (m) => {
      let hour = Number(m[1]);
      const minute = m[2] ? Number(m[2]) : 0;
      const ampm = m[3].toLowerCase();
      if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return false;
      if (ampm === "pm" && hour < 12) hour += 12;
      if (ampm === "am" && hour === 12) hour = 0;
      dueTime = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
      return true;
    }
  );
  if (!dueTime) {
    consume(/(?:^|\s)at\s+(\d{1,2}):(\d{2})(?=$|\s)/i, (m) => {
      const norm = normalizeDueTime(`${m[1]}:${m[2]}`);
      if (!norm) return false;
      dueTime = norm;
      return true;
    });
  }

  // Default date when recurrence or time is given without an explicit date
  if (!dueDate && recurrence && todayIso) {
    if (recurrence.frequency === "weekly" && recurrence.weekday !== undefined) {
      const currentDow = getWeekdayFromIso(todayIso);
      dueDate =
        currentDow === recurrence.weekday
          ? todayIso
          : nextOccurrenceOfWeekday(todayIso, recurrence.weekday);
    } else if (recurrence.frequency === "weekdays") {
      dueDate = nextWeekdayOnOrAfter(todayIso);
    } else {
      dueDate = todayIso;
    }
  } else if (!dueDate && dueTime && todayIso) {
    dueDate = todayIso;
  }

  const cleanedTitle = text.replace(/\s+/g, " ").trim();

  return {
    cleanedTitle,
    ...(priority ? { priority } : {}),
    ...(dueDate ? { dueDate } : {}),
    ...(dueTime ? { dueTime } : {}),
    ...(recurrence ? { recurrence } : {}),
    labels,
    ...(projectId !== undefined ? { projectId } : {}),
    ...(matchedProjectName ? { matchedProjectName } : {}),
  };
}

/** Builds root projects and a parentId -> children map in order. */
export function buildProjectTree(projects: TodoProject[]): {
  roots: TodoProject[];
  childrenByParent: Map<string, TodoProject[]>;
} {
  const sorted = [...projects].sort(
    (a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt)
  );
  const idSet = new Set(sorted.map((p) => p.id));
  const roots: TodoProject[] = [];
  const childrenByParent = new Map<string, TodoProject[]>();

  for (const project of sorted) {
    if (
      project.parentId &&
      idSet.has(project.parentId) &&
      project.parentId !== project.id
    ) {
      const list = childrenByParent.get(project.parentId) ?? [];
      list.push(project);
      childrenByParent.set(project.parentId, list);
    } else {
      roots.push(project);
    }
  }

  return { roots, childrenByParent };
}

/** Flattens projects in depth-first tree order for dropdowns. */
export function flattenProjectTree(
  projects: TodoProject[]
): Array<{ project: TodoProject; depth: number }> {
  const { roots, childrenByParent } = buildProjectTree(projects);
  const out: Array<{ project: TodoProject; depth: number }> = [];
  const visited = new Set<string>();

  const walk = (node: TodoProject, depth: number) => {
    if (visited.has(node.id)) return;
    visited.add(node.id);
    out.push({ project: node, depth });
    for (const child of childrenByParent.get(node.id) ?? []) {
      walk(child, depth + 1);
    }
  };

  for (const root of roots) walk(root, 0);
  return out;
}

/** Returns ancestors from root down to the given project (inclusive). */
export function getProjectAncestors(
  projects: TodoProject[],
  projectId: string
): TodoProject[] {
  const byId = new Map(projects.map((p) => [p.id, p]));
  const chain: TodoProject[] = [];
  const seen = new Set<string>();
  let curr = byId.get(projectId);
  while (curr && !seen.has(curr.id)) {
    chain.unshift(curr);
    seen.add(curr.id);
    curr = curr.parentId ? byId.get(curr.parentId) : undefined;
  }
  return chain;
}

/** Collects a project id and all its descendant project ids. */
export function collectProjectSubtree(
  projects: TodoProject[],
  rootId: string
): Set<string> {
  const result = new Set<string>();
  const childrenMap = new Map<string, string[]>();
  for (const p of projects) {
    if (p.parentId) {
      const list = childrenMap.get(p.parentId) ?? [];
      list.push(p.id);
      childrenMap.set(p.parentId, list);
    }
  }
  const stack = [rootId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (result.has(id)) continue;
    result.add(id);
    for (const child of childrenMap.get(id) ?? []) {
      stack.push(child);
    }
  }
  return result;
}

/** Breaks missing or cyclic parentId links in a project list. */
export function repairProjectHierarchy(projects: TodoProject[]): TodoProject[] {
  const cloned = projects.map((p) => ({ ...p }));
  const byId = new Map(cloned.map((p) => [p.id, p]));

  for (const p of cloned) {
    if (!p.parentId) continue;
    if (!byId.has(p.parentId) || p.parentId === p.id) {
      delete p.parentId;
      continue;
    }
    const seen = new Set<string>([p.id]);
    let curr = byId.get(p.parentId);
    while (curr) {
      if (seen.has(curr.id)) {
        delete p.parentId;
        break;
      }
      seen.add(curr.id);
      curr = curr.parentId ? byId.get(curr.parentId) : undefined;
    }
  }

  return cloned;
}

export function normalizeProject(raw: unknown): TodoProject | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const id = typeof obj.id === "string" && obj.id.trim() ? obj.id.trim() : "";
  if (!id) return null;

  const color: NotionColor =
    typeof obj.color === "string" &&
    VALID_NOTION_COLORS.has(obj.color as NotionColor)
      ? (obj.color as NotionColor)
      : "blue";

  const project: TodoProject = {
    id,
    name: typeof obj.name === "string" ? obj.name : "",
    color,
    order:
      typeof obj.order === "number" && Number.isFinite(obj.order)
        ? obj.order
        : 0,
    createdAt:
      typeof obj.createdAt === "string" && obj.createdAt
        ? obj.createdAt
        : new Date(0).toISOString(),
  };

  if (typeof obj.icon === "string" && obj.icon.trim()) {
    project.icon = obj.icon.trim();
  }
  if (typeof obj.parentId === "string" && obj.parentId.trim()) {
    project.parentId = obj.parentId.trim();
  }
  if (obj.favorite === true) project.favorite = true;
  if (obj.viewLayout === "board" || obj.viewLayout === "list") {
    project.viewLayout = obj.viewLayout;
  }
  if (typeof obj.trashedAt === "string" && obj.trashedAt) {
    project.trashedAt = obj.trashedAt;
  }

  return project;
}

export function normalizeSection(raw: unknown): TodoSection | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const id = typeof obj.id === "string" && obj.id.trim() ? obj.id.trim() : "";
  const projectId =
    typeof obj.projectId === "string" && obj.projectId.trim()
      ? obj.projectId.trim()
      : "";
  if (!id || !projectId) return null;

  const section: TodoSection = {
    id,
    projectId,
    name: typeof obj.name === "string" ? obj.name : "",
    order:
      typeof obj.order === "number" && Number.isFinite(obj.order)
        ? obj.order
        : 0,
    createdAt:
      typeof obj.createdAt === "string" && obj.createdAt
        ? obj.createdAt
        : new Date(0).toISOString(),
  };

  if (obj.collapsed === true) section.collapsed = true;
  return section;
}

export function normalizeLabel(raw: unknown): TodoLabel | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const name =
    typeof obj.name === "string" ? normalizeLabelName(obj.name) : "";
  if (!name) return null;

  const color: NotionColor =
    typeof obj.color === "string" &&
    VALID_NOTION_COLORS.has(obj.color as NotionColor)
      ? (obj.color as NotionColor)
      : "gray";

  const label: TodoLabel = {
    id: typeof obj.id === "string" && obj.id.trim() ? obj.id.trim() : createId(),
    name,
    color,
  };
  if (obj.favorite === true) label.favorite = true;
  return label;
}

function normalizeRecurrence(raw: unknown): TodoRecurrence | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const obj = raw as Record<string, unknown>;
  const freq = obj.frequency;
  if (
    freq !== "daily" &&
    freq !== "weekdays" &&
    freq !== "weekly" &&
    freq !== "monthly" &&
    freq !== "yearly"
  ) {
    return undefined;
  }
  const interval =
    typeof obj.interval === "number" && Number.isFinite(obj.interval)
      ? Math.max(1, Math.min(365, Math.floor(obj.interval)))
      : 1;
  const rec: TodoRecurrence = { frequency: freq, interval };
  if (
    typeof obj.weekday === "number" &&
    Number.isInteger(obj.weekday) &&
    obj.weekday >= 0 &&
    obj.weekday <= 6
  ) {
    rec.weekday = obj.weekday;
  }
  return rec;
}

function normalizeComment(raw: unknown): TodoComment | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const text = typeof obj.text === "string" ? obj.text.trim() : "";
  if (!text) return null;
  return {
    id: typeof obj.id === "string" && obj.id.trim() ? obj.id.trim() : createId(),
    text,
    createdAt:
      typeof obj.createdAt === "string" && obj.createdAt
        ? obj.createdAt
        : new Date(0).toISOString(),
  };
}

export function normalizeTask(raw: unknown): TodoTask | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const id = typeof obj.id === "string" && obj.id.trim() ? obj.id.trim() : "";
  if (!id) return null;

  const priority: TodoPriority =
    obj.priority === 1 ||
    obj.priority === 2 ||
    obj.priority === 3 ||
    obj.priority === 4
      ? obj.priority
      : 4;

  const projectId =
    typeof obj.projectId === "string" && obj.projectId.trim()
      ? obj.projectId.trim()
      : null;

  const labels = Array.isArray(obj.labels)
    ? Array.from(
        new Set(
          obj.labels
            .filter((l): l is string => typeof l === "string")
            .map(normalizeLabelName)
            .filter(Boolean)
        )
      )
    : [];

  const comments = Array.isArray(obj.comments)
    ? obj.comments
        .map(normalizeComment)
        .filter((c): c is TodoComment => c !== null)
    : undefined;

  const dueDate = normalizePlainDateIso(obj.dueDate);
  const dueTime = dueDate ? normalizeDueTime(obj.dueTime) : undefined;
  const recurrence = normalizeRecurrence(obj.recurrence);

  const createdAt =
    typeof obj.createdAt === "string" && obj.createdAt
      ? obj.createdAt
      : new Date(0).toISOString();

  const task: TodoTask = {
    id,
    title: typeof obj.title === "string" ? obj.title : "",
    projectId,
    priority,
    labels,
    completed: Boolean(obj.completed),
    order:
      typeof obj.order === "number" && Number.isFinite(obj.order)
        ? obj.order
        : 0,
    createdAt,
    updatedAt:
      typeof obj.updatedAt === "string" && obj.updatedAt
        ? obj.updatedAt
        : createdAt,
  };

  if (typeof obj.description === "string" && obj.description.trim()) {
    task.description = obj.description;
  }
  if (typeof obj.sectionId === "string" && obj.sectionId.trim() && projectId) {
    task.sectionId = obj.sectionId.trim();
  }
  if (typeof obj.parentId === "string" && obj.parentId.trim() && obj.parentId !== id) {
    task.parentId = obj.parentId.trim();
  }
  if (dueDate) task.dueDate = dueDate;
  if (dueTime) task.dueTime = dueTime;
  if (recurrence) task.recurrence = recurrence;
  if (task.completed && typeof obj.completedAt === "string" && obj.completedAt) {
    task.completedAt = obj.completedAt;
  }
  if (comments && comments.length > 0) task.comments = comments;

  return task;
}

export function normalizeCompletionLog(raw: unknown): TodoCompletionLog | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const id = typeof obj.id === "string" && obj.id.trim() ? obj.id.trim() : "";
  const taskId =
    typeof obj.taskId === "string" && obj.taskId.trim()
      ? obj.taskId.trim()
      : "";
  const title = typeof obj.title === "string" ? obj.title : "";
  const completedAt =
    typeof obj.completedAt === "string" && obj.completedAt
      ? obj.completedAt
      : "";
  if (!id || !taskId || !completedAt) return null;

  const entry: TodoCompletionLog = {
    id,
    taskId,
    title,
    projectId:
      typeof obj.projectId === "string" && obj.projectId.trim()
        ? obj.projectId.trim()
        : null,
    completedAt,
  };

  const prevDue = normalizePlainDateIso(obj.previousDueDate);
  if (prevDue) entry.previousDueDate = prevDue;

  return entry;
}

const titleCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

/** Sorts tasks according to Todoist sort modes. */
export function sortTodoTasks(tasks: TodoTask[], sortBy: TodoSortBy): TodoTask[] {
  const copy = [...tasks];
  copy.sort((a, b) => {
    if (sortBy === "priority") {
      if (a.priority !== b.priority) return a.priority - b.priority;
      const ad = a.dueDate ?? "9999-99-99";
      const bd = b.dueDate ?? "9999-99-99";
      if (ad !== bd) return ad.localeCompare(bd);
      return a.order - b.order;
    }
    if (sortBy === "due") {
      const ad = a.dueDate ?? "9999-99-99";
      const bd = b.dueDate ?? "9999-99-99";
      if (ad !== bd) return ad.localeCompare(bd);
      const at = a.dueTime ?? "99:99";
      const bt = b.dueTime ?? "99:99";
      if (at !== bt) return at.localeCompare(bt);
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.order - b.order;
    }
    if (sortBy === "title") {
      return (
        titleCollator.compare(a.title, b.title) || a.order - b.order
      );
    }
    if (sortBy === "created") {
      return b.createdAt.localeCompare(a.createdAt);
    }
    return a.order - b.order || a.createdAt.localeCompare(b.createdAt);
  });
  return copy;
}
