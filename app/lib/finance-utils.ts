import { createId } from "./docs-utils";

export const FINANCE_STORAGE_KEY = "maa-finance-v1";
export const DEFAULT_CURRENCY = "USD";

export const COMMON_CURRENCIES: readonly string[] = [
  "USD",
  "EUR",
  "GBP",
  "KES",
  "UGX",
  "TZS",
  "ETB",
  "NGN",
  "ZAR",
  "AED",
  "SAR",
  "TRY",
  "INR",
  "CNY",
  "JPY",
  "CAD",
  "AUD",
  "CHF",
  "BTC",
  "ETH",
  "USDT",
  "USDC",
];

export type TransactionKind = "expense" | "income";

export interface FinanceAccount {
  id: string;
  name: string;
  icon?: string;
  parentId?: string;
  createdAt: string;
  /** Set when the account was moved to trash (its sub-accounts are hidden with it). */
  trashedAt?: string;
}

export interface FinanceTransaction {
  id: string;
  accountId: string;
  name: string;
  kind: TransactionKind;
  /** Positive amount in major currency units. */
  amount: number;
  /** Positive charge paid on top of (expense) or deducted from (income) the amount. */
  fee: number;
  currency: string;
  /** When the transaction actually happened (ISO 8601, UTC). */
  occurredAt: string;
  /** When the transaction was recorded in the app (ISO 8601, UTC). */
  recordedAt: string;
  updatedAt: string;
  note?: string;
  /** Lower-case tags without the leading `#`. */
  tags: string[];
  /** Recurring rule that generated this transaction, if any. */
  recurringId?: string;
}

export type TransactionInput = Pick<
  FinanceTransaction,
  "accountId" | "name" | "kind" | "amount" | "fee" | "currency" | "occurredAt"
> & { note?: string; tags?: string[] };

export type RecurringFrequency = "daily" | "weekly" | "monthly" | "yearly";

export const RECURRING_FREQUENCIES: { id: RecurringFrequency; label: string; unit: string }[] = [
  { id: "daily", label: "Daily", unit: "day" },
  { id: "weekly", label: "Weekly", unit: "week" },
  { id: "monthly", label: "Monthly", unit: "month" },
  { id: "yearly", label: "Yearly", unit: "year" },
];

/** Template that generates a transaction on a schedule. */
export interface RecurringRule {
  id: string;
  accountId: string;
  name: string;
  kind: TransactionKind;
  amount: number;
  fee: number;
  currency: string;
  note?: string;
  tags: string[];
  frequency: RecurringFrequency;
  /** Repeat every N units (e.g. every 2 weeks). */
  interval: number;
  /** First occurrence of the current schedule (ISO). Occurrences keep its local time of day. */
  startAt: string;
  /** Number of occurrences of the current schedule already generated. */
  nextIndex: number;
  /** Last allowed occurrence time (ISO, inclusive). */
  endAt?: string;
  paused?: boolean;
  /** Add transactions automatically when due; otherwise they wait as "due" for confirmation. */
  autoAdd?: boolean;
  /** Occurrences (ISO) confirmed or skipped ahead of `nextIndex` (out of order). */
  handledAhead?: string[];
  createdAt: string;
  updatedAt: string;
}

export type RecurringInput = Omit<TransactionInput, "occurredAt"> & {
  frequency: RecurringFrequency;
  interval: number;
  startAt: string;
  endAt?: string;
  autoAdd?: boolean;
};

/** A due occurrence of a confirm-first recurring rule. */
export interface DueOccurrence {
  rule: RecurringRule;
  /** Occurrence time (ISO). */
  occurrence: string;
}

export interface CurrencySummary {
  currency: string;
  income: number;
  expenses: number;
  fees: number;
  net: number;
  count: number;
}

export type FinancePeriod = "all" | "month" | "30d" | "year";

export const FINANCE_PERIODS: { id: FinancePeriod; label: string }[] = [
  { id: "all", label: "All time" },
  { id: "month", label: "This month" },
  { id: "30d", label: "Last 30 days" },
  { id: "year", label: "This year" },
];

/* ---------- Normalization ---------- */

export function normalizeCurrency(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  // ISO codes (USD) and crypto tickers (BTC, USDT, DOGE) of 2–10 characters.
  return /^[A-Z][A-Z0-9]{1,9}$/.test(code) ? code : null;
}

function toPositiveNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function toIsoOr(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const time = Date.parse(value);
  return Number.isNaN(time) ? fallback : new Date(time).toISOString();
}

export function normalizeAccount(raw: unknown): FinanceAccount | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  if (typeof a.id !== "string" || !a.id) return null;
  const fallbackDate = "2026-11-21T09:00:00.000Z";
  return {
    id: a.id,
    name: typeof a.name === "string" ? a.name : "",
    createdAt: toIsoOr(a.createdAt, fallbackDate),
    ...(typeof a.trashedAt === "string" && a.trashedAt
      ? { trashedAt: toIsoOr(a.trashedAt, fallbackDate) }
      : {}),
    ...(typeof a.icon === "string" && a.icon ? { icon: a.icon } : {}),
    ...(typeof a.parentId === "string" && a.parentId && a.parentId !== a.id
      ? { parentId: a.parentId }
      : {}),
  };
}

export function normalizeTransaction(raw: unknown): FinanceTransaction | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Record<string, unknown>;
  if (typeof t.id !== "string" || !t.id) return null;
  if (typeof t.accountId !== "string" || !t.accountId) return null;
  const fallbackDate = "2026-11-21T09:00:00.000Z";
  const occurredAt = toIsoOr(t.occurredAt, fallbackDate);
  const recordedAt = toIsoOr(t.recordedAt, occurredAt);
  return {
    id: t.id,
    accountId: t.accountId,
    name: typeof t.name === "string" ? t.name : "",
    kind: t.kind === "income" ? "income" : "expense",
    amount: toPositiveNumber(t.amount),
    fee: toPositiveNumber(t.fee),
    currency: normalizeCurrency(t.currency) ?? DEFAULT_CURRENCY,
    occurredAt,
    recordedAt,
    updatedAt: toIsoOr(t.updatedAt, recordedAt),
    ...(typeof t.note === "string" && t.note.trim() ? { note: t.note } : {}),
    tags: normalizeTags(t.tags),
    ...(typeof t.recurringId === "string" && t.recurringId
      ? { recurringId: t.recurringId }
      : {}),
  };
}

export function buildTransaction(input: TransactionInput): FinanceTransaction {
  const now = new Date().toISOString();
  return {
    id: createId(),
    accountId: input.accountId,
    name: input.name.trim(),
    kind: input.kind,
    amount: toPositiveNumber(input.amount),
    fee: toPositiveNumber(input.fee),
    currency: normalizeCurrency(input.currency) ?? DEFAULT_CURRENCY,
    occurredAt: toIsoOr(input.occurredAt, now),
    recordedAt: now,
    updatedAt: now,
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    tags: normalizeTags(input.tags),
  };
}

/* ---------- Tags ---------- */

/** A tag starts with a letter or underscore, so `#1` or `#42` stay plain text. */
const TAG_BODY = "[\\p{L}_][\\p{L}\\p{N}_-]*";

export function normalizeTag(value: string): string | null {
  const tag = value.trim().replace(/^#+/, "").toLowerCase();
  return new RegExp(`^${TAG_BODY}$`, "u").test(tag) ? tag : null;
}

export function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const tag = normalizeTag(item);
    if (tag && !out.includes(tag)) out.push(tag);
  }
  return out;
}

/**
 * Pulls `#tags` out of free text. With `completedOnly`, only tags already followed by
 * whitespace or a comma are taken, so the tag still being typed stays in the text.
 */
export function extractTags(
  text: string,
  completedOnly: boolean
): { text: string; tags: string[] } {
  const pattern = new RegExp(
    `(^|\\s)#(${TAG_BODY})${completedOnly ? "(?=[\\s,])" : "(?=[\\s,]|$)"},?`,
    "gu"
  );
  const tags: string[] = [];
  const stripped = text.replace(pattern, (_m, lead: string, body: string) => {
    const tag = normalizeTag(body);
    if (tag && !tags.includes(tag)) tags.push(tag);
    return lead;
  });
  if (tags.length === 0) return { text, tags };
  return { text: stripped.replace(/\s{2,}/g, " ").replace(/^\s+/, ""), tags };
}

/** The partial `#tag` being typed at the end of the text, if any (without `#`). */
export function trailingTagFragment(text: string): string | null {
  const match = new RegExp(`(?:^|\\s)#(${TAG_BODY})?$`, "u").exec(text);
  return match ? (match[1] ?? "").toLowerCase() : null;
}

/* ---------- Recurring ---------- */

export function normalizeRecurringRule(raw: unknown): RecurringRule | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || !r.id) return null;
  if (typeof r.accountId !== "string" || !r.accountId) return null;
  const fallbackDate = "2026-11-21T09:00:00.000Z";
  const frequency = RECURRING_FREQUENCIES.some((f) => f.id === r.frequency)
    ? (r.frequency as RecurringFrequency)
    : "monthly";
  const interval =
    typeof r.interval === "number" && r.interval >= 1 ? Math.floor(r.interval) : 1;
  const createdAt = toIsoOr(r.createdAt, fallbackDate);
  return {
    id: r.id,
    accountId: r.accountId,
    name: typeof r.name === "string" ? r.name : "",
    kind: r.kind === "income" ? "income" : "expense",
    amount: toPositiveNumber(r.amount),
    fee: toPositiveNumber(r.fee),
    currency: normalizeCurrency(r.currency) ?? DEFAULT_CURRENCY,
    ...(typeof r.note === "string" && r.note.trim() ? { note: r.note } : {}),
    tags: normalizeTags(r.tags),
    frequency,
    interval: Math.min(interval, 999),
    startAt: toIsoOr(r.startAt, createdAt),
    nextIndex:
      typeof r.nextIndex === "number" && r.nextIndex >= 0 ? Math.floor(r.nextIndex) : 0,
    ...(typeof r.endAt === "string" && r.endAt ? { endAt: toIsoOr(r.endAt, createdAt) } : {}),
    ...(r.paused === true ? { paused: true } : {}),
    ...(r.autoAdd === true ? { autoAdd: true } : {}),
    ...(Array.isArray(r.handledAhead) && r.handledAhead.length > 0
      ? {
          handledAhead: r.handledAhead.filter(
            (v): v is string => typeof v === "string" && !Number.isNaN(Date.parse(v))
          ),
        }
      : {}),
    createdAt,
    updatedAt: toIsoOr(r.updatedAt, createdAt),
  };
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/** The n-th occurrence (0-based) of a schedule, computed from the start to avoid drift. */
export function occurrenceAt(
  rule: Pick<RecurringRule, "startAt" | "frequency" | "interval">,
  n: number
): Date {
  const start = new Date(rule.startAt);
  const steps = n * rule.interval;
  const d = new Date(start);
  if (rule.frequency === "daily") {
    d.setDate(start.getDate() + steps);
  } else if (rule.frequency === "weekly") {
    d.setDate(start.getDate() + steps * 7);
  } else {
    const monthsToAdd = rule.frequency === "monthly" ? steps : steps * 12;
    const target = start.getMonth() + monthsToAdd;
    const year = start.getFullYear() + Math.floor(target / 12);
    const month = ((target % 12) + 12) % 12;
    // Clamp e.g. the 31st to the last day of shorter months.
    d.setFullYear(year, month, Math.min(start.getDate(), daysInMonth(year, month)));
  }
  return d;
}

/** Next not-yet-generated occurrence, or null when the schedule has ended. */
export function nextOccurrence(rule: RecurringRule): Date | null {
  const next = occurrenceAt(rule, rule.nextIndex);
  if (rule.endAt && next.getTime() > Date.parse(rule.endAt)) return null;
  return next;
}

/** Index of the first occurrence strictly after `now` (used when resuming a paused rule). */
export function firstIndexAfter(rule: RecurringRule, now: Date): number {
  let n = rule.nextIndex;
  for (let guard = 0; guard < 100000 && occurrenceAt(rule, n) <= now; guard += 1) n += 1;
  return n;
}

/** Deterministic id so generating the same occurrence twice is harmless. */
export function recurringTransactionId(ruleId: string, occurrence: Date): string {
  return `rec-${ruleId}-${occurrence.getTime()}`;
}

/** Builds the transaction for one occurrence of a rule. */
export function buildOccurrenceTransaction(
  rule: RecurringRule,
  occurrence: Date,
  recordedAt: string
): FinanceTransaction {
  return {
    id: recurringTransactionId(rule.id, occurrence),
    accountId: rule.accountId,
    name: rule.name,
    kind: rule.kind,
    amount: rule.amount,
    fee: rule.fee,
    currency: rule.currency,
    occurredAt: occurrence.toISOString(),
    recordedAt,
    updatedAt: recordedAt,
    ...(rule.note ? { note: rule.note } : {}),
    tags: [...rule.tags],
    recurringId: rule.id,
  };
}

/** Unhandled occurrences up to `now`, oldest first (capped). Ignores `paused`/`autoAdd`. */
export function listDueOccurrences(rule: RecurringRule, now: Date, max = 200): Date[] {
  const out: Date[] = [];
  const endMs = rule.endAt ? Date.parse(rule.endAt) : Infinity;
  const handled = new Set(rule.handledAhead ?? []);
  for (let n = rule.nextIndex; out.length < max; n += 1) {
    const occ = occurrenceAt(rule, n);
    if (occ > now || occ.getTime() > endMs) break;
    if (!handled.has(occ.toISOString())) out.push(occ);
  }
  return out;
}

/** Marks one occurrence as confirmed/skipped, advancing `nextIndex` past handled ones. */
export function markOccurrenceHandled(rule: RecurringRule, occurrence: string): RecurringRule {
  const handled = new Set(rule.handledAhead ?? []);
  handled.add(occurrence);
  let nextIndex = rule.nextIndex;
  for (let guard = 0; guard < 100000; guard += 1) {
    const iso = occurrenceAt(rule, nextIndex).toISOString();
    if (!handled.has(iso)) break;
    handled.delete(iso);
    nextIndex += 1;
  }
  // Drop anything that is now behind nextIndex.
  const nextMs = occurrenceAt(rule, nextIndex).getTime();
  const remaining = [...handled].filter((iso) => Date.parse(iso) > nextMs);
  const { handledAhead: _h, ...rest } = rule;
  void _h;
  return remaining.length > 0
    ? { ...rest, nextIndex, handledAhead: remaining }
    : { ...rest, nextIndex };
}

/** Builds transactions for every due occurrence up to `now` (capped per run). */
export function generateDueTransactions(
  rule: RecurringRule,
  now: Date,
  maxPerRun = 500
): { transactions: FinanceTransaction[]; nextIndex: number } {
  if (rule.paused) return { transactions: [], nextIndex: rule.nextIndex };
  const due = listDueOccurrences(rule, now, maxPerRun);
  const nowIso = now.toISOString();
  const transactions = due.map((occ) => buildOccurrenceTransaction(rule, occ, nowIso));
  // Advance past everything up to the last generated occurrence (handled-ahead ones included).
  let nextIndex = rule.nextIndex;
  const last = due[due.length - 1];
  if (last) {
    while (occurrenceAt(rule, nextIndex) <= last) nextIndex += 1;
  }
  return { transactions, nextIndex };
}

export function describeSchedule(
  rule: Pick<RecurringRule, "frequency" | "interval">
): string {
  const meta = RECURRING_FREQUENCIES.find((f) => f.id === rule.frequency);
  if (!meta) return "";
  if (rule.interval <= 1) return meta.label;
  return `Every ${rule.interval} ${meta.unit}s`;
}

/* ---------- Account tree helpers ---------- */

export function buildAccountTree(accounts: FinanceAccount[]): {
  roots: FinanceAccount[];
  childrenByParent: Map<string, FinanceAccount[]>;
} {
  const ids = new Set(accounts.map((a) => a.id));
  const roots: FinanceAccount[] = [];
  const childrenByParent = new Map<string, FinanceAccount[]>();
  for (const account of accounts) {
    if (account.parentId && ids.has(account.parentId)) {
      const list = childrenByParent.get(account.parentId) ?? [];
      list.push(account);
      childrenByParent.set(account.parentId, list);
    } else {
      roots.push(account);
    }
  }
  return { roots, childrenByParent };
}

/** Returns the account id and all of its descendant account ids. */
export function collectAccountSubtree(
  accounts: FinanceAccount[],
  rootId: string
): Set<string> {
  const result = new Set<string>([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const account of accounts) {
      if (
        account.parentId &&
        result.has(account.parentId) &&
        !result.has(account.id)
      ) {
        result.add(account.id);
        changed = true;
      }
    }
  }
  return result;
}

/** Ancestors from the root down to (and including) the given account. */
export function getAccountAncestors(
  accounts: FinanceAccount[],
  accountId: string
): FinanceAccount[] {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const chain: FinanceAccount[] = [];
  const seen = new Set<string>();
  let current = byId.get(accountId);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    chain.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return chain;
}

/** Flattened depth-first list used for indented account pickers. */
export function flattenAccountTree(
  accounts: FinanceAccount[]
): { account: FinanceAccount; depth: number }[] {
  const { roots, childrenByParent } = buildAccountTree(accounts);
  const out: { account: FinanceAccount; depth: number }[] = [];
  const visit = (account: FinanceAccount, depth: number) => {
    out.push({ account, depth });
    for (const child of childrenByParent.get(account.id) ?? []) {
      visit(child, depth + 1);
    }
  };
  for (const root of roots) visit(root, 0);
  return out;
}

export function accountDisplayName(account: FinanceAccount | undefined): string {
  return account?.name.trim() || "Untitled account";
}

/* ---------- Money & stats ---------- */

/** Signed effect of a transaction on its account balance (fees always reduce it). */
export function transactionNet(tx: FinanceTransaction): number {
  return tx.kind === "income" ? tx.amount - tx.fee : -(tx.amount + tx.fee);
}

/** Removes float noise from sums (e.g. 0.1 + 0.2) while keeping satoshi-level precision. */
function roundMoney(value: number): number {
  return Number(value.toFixed(MAX_MONEY_DECIMALS));
}

/** Per-currency totals. Currencies are never mixed or converted. */
export function summarizeByCurrency(
  transactions: FinanceTransaction[]
): CurrencySummary[] {
  const map = new Map<string, CurrencySummary>();
  for (const tx of transactions) {
    const entry = map.get(tx.currency) ?? {
      currency: tx.currency,
      income: 0,
      expenses: 0,
      fees: 0,
      net: 0,
      count: 0,
    };
    if (tx.kind === "income") entry.income += tx.amount;
    else entry.expenses += tx.amount;
    entry.fees += tx.fee;
    entry.net += transactionNet(tx);
    entry.count += 1;
    map.set(tx.currency, entry);
  }
  return [...map.values()]
    .map((s) => ({
      ...s,
      income: roundMoney(s.income),
      expenses: roundMoney(s.expenses),
      fees: roundMoney(s.fees),
      net: roundMoney(s.net),
    }))
    .sort((a, b) => b.count - a.count || a.currency.localeCompare(b.currency));
}

/** Most decimals ever displayed or kept when summing (covers satoshis and most tokens). */
export const MAX_MONEY_DECIMALS = 10;

/**
 * Display precision for common crypto assets that Intl does not know.
 * `min` is always shown (e.g. BTC 0.50 not BTC 0.5); more digits appear when the value has them.
 */
const CRYPTO_PRECISION: Record<string, { min: number }> = {
  BTC: { min: 2 },
  ETH: { min: 2 },
  LTC: { min: 2 },
  SOL: { min: 2 },
  XMR: { min: 2 },
  DOGE: { min: 2 },
  USDT: { min: 2 },
  USDC: { min: 2 },
  SAT: { min: 0 },
  SATS: { min: 0 },
};

/** Number of decimal places a number actually carries (handles `1e-8`), capped. */
export function decimalPlaces(value: number): number {
  if (!Number.isFinite(value)) return 0;
  // Trim float noise like 0.30000000000000004 first.
  const text = Math.abs(value).toFixed(MAX_MONEY_DECIMALS).replace(/0+$/, "");
  const dot = text.indexOf(".");
  return dot === -1 ? 0 : text.length - dot - 1;
}

/** Plain decimal string without exponent or grouping, for number inputs (e.g. 1e-8 → "0.00000001"). */
export function toPlainNumberString(value: number): string {
  if (!Number.isFinite(value)) return "";
  return value.toLocaleString("en-US", {
    useGrouping: false,
    maximumFractionDigits: MAX_MONEY_DECIMALS,
  });
}

const defaultDigitsCache = new Map<string, number | null>();

/** Standard minor-unit digits for an ISO currency (USD 2, JPY 0), or null when Intl rejects the code. */
function isoDefaultDigits(currency: string): number | null {
  let digits = defaultDigitsCache.get(currency);
  if (digits === undefined) {
    try {
      digits = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
      }).resolvedOptions().maximumFractionDigits ?? 2;
    } catch {
      digits = null;
    }
    defaultDigitsCache.set(currency, digits);
  }
  return digits;
}

const moneyFormatters = new Map<string, Intl.NumberFormat>();

function getFormatter(key: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  let formatter = moneyFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(undefined, options);
    moneyFormatters.set(key, formatter);
  }
  return formatter;
}

/**
 * Formats an amount with its currency code. Shows at least the currency's standard decimals
 * and more when the value has them (up to MAX_MONEY_DECIMALS), so BTC 0.00012345 is not
 * rounded to BTC 0.00.
 */
export function formatMoney(
  value: number,
  currency: string,
  options: { signed?: boolean } = {}
): string {
  const crypto = CRYPTO_PRECISION[currency];
  const isoDigits = isoDefaultDigits(currency);
  const minDigits = crypto?.min ?? isoDigits ?? 2;
  const maxDigits = Math.min(
    MAX_MONEY_DECIMALS,
    Math.max(minDigits, decimalPlaces(value))
  );
  const signDisplay = options.signed ? "exceptZero" : "auto";
  const key = `${currency}|${signDisplay}|${minDigits}|${maxDigits}`;

  if (isoDigits !== null) {
    // Valid 3-letter code (including non-ISO ones like BTC): let Intl place the code.
    return getFormatter(key, {
      style: "currency",
      currency,
      currencyDisplay: "code",
      signDisplay,
      minimumFractionDigits: minDigits,
      maximumFractionDigits: maxDigits,
    }).format(value);
  }
  // Longer tickers (USDT, DOGE…) are not accepted by Intl as currencies.
  // Sign goes before the code to match Intl output ("-BTC 1.00", "+USDT 5.00").
  const number = getFormatter(`n|${currency}|${minDigits}|${maxDigits}`, {
    style: "decimal",
    minimumFractionDigits: minDigits,
    maximumFractionDigits: maxDigits,
  }).format(Math.abs(value));
  const isZero = number.replace(/[^1-9]/g, "") === "";
  const sign = isZero ? "" : value < 0 ? "-" : options.signed ? "+" : "";
  return `${sign}${currency} ${number}`;
}

/* ---------- Search ---------- */

type AmountOperator = ">" | ">=" | "<" | "<=" | "=";

export interface TransactionQuery {
  /** Lower-cased words that must all appear in name, note, currency, or account. */
  terms: string[];
  /** Comparisons applied to the signed net amount (income positive, expenses negative). */
  amountFilters: { op: AmountOperator; value: number }[];
  /** `#tag` tokens; a transaction must have a tag starting with each. */
  tagFilters: string[];
}

/**
 * Parses a search string like `coffee >40 <=-45.5`.
 * Words are matched as text; `#tag` matches tags; `>`, `>=`, `<`, `<=`, `=` followed by a
 * number filter by signed net amount.
 */
export function parseTransactionQuery(input: string): TransactionQuery {
  const normalized = input
    .replace(/[\u2212\u2013]/g, "-") // typographic minus / en dash
    .replace(/(>=|<=|>|<|=)\s+(?=[-+]?\d|[-+]?\.\d)/g, "$1") // allow "> 40"
    .trim()
    .toLowerCase();
  const query: TransactionQuery = { terms: [], amountFilters: [], tagFilters: [] };
  if (!normalized) return query;
  for (const token of normalized.split(/\s+/)) {
    const match = /^(>=|<=|>|<|=)([-+]?(?:\d+(?:\.\d*)?|\.\d+))$/.exec(
      token.replace(/,/g, "")
    );
    if (match) {
      query.amountFilters.push({
        op: match[1] as AmountOperator,
        value: Number(match[2]),
      });
    } else if (token.startsWith("#")) {
      const tag = token.replace(/^#+/, "");
      if (tag) query.tagFilters.push(tag);
    } else {
      query.terms.push(token);
    }
  }
  return query;
}

export function matchesAmountFilters(
  net: number,
  filters: TransactionQuery["amountFilters"]
): boolean {
  const epsilon = 1e-9;
  return filters.every(({ op, value }) => {
    switch (op) {
      case ">":
        return net > value + epsilon;
      case ">=":
        return net >= value - epsilon;
      case "<":
        return net < value - epsilon;
      case "<=":
        return net <= value + epsilon;
      case "=":
        // Match to the precision typed: "=3" ≈ 2 decimals, "=0.00012345" to 8.
        return Math.abs(net - value) < 0.5 * 10 ** -Math.max(2, decimalPlaces(value));
    }
  });
}

/* ---------- Dates ---------- */

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Converts an ISO instant into a `datetime-local` input value in local time. */
export function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

/** Converts a `datetime-local` value (interpreted as local time) into an ISO instant. */
export function fromLocalInputValue(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Local calendar day key (YYYY-MM-DD) for grouping. */
export function localDayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const dayHeadingFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});
const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});
const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export function formatDayHeading(iso: string): string {
  return dayHeadingFormatter.format(new Date(iso));
}

export function formatTime(iso: string): string {
  return timeFormatter.format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return dateTimeFormatter.format(new Date(iso));
}

/** Returns the inclusive lower bound for a period, computed against `now`. */
export function periodStart(period: FinancePeriod, now: Date): string | null {
  if (period === "all") return null;
  if (period === "month") {
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  }
  if (period === "year") {
    return new Date(now.getFullYear(), 0, 1).toISOString();
  }
  const start = new Date(now);
  start.setDate(start.getDate() - 30);
  return start.toISOString();
}

/** True when a transaction was recorded noticeably after it happened (> 1 hour). */
export function wasRecordedLate(tx: FinanceTransaction): boolean {
  return Date.parse(tx.recordedAt) - Date.parse(tx.occurredAt) > 60 * 60 * 1000;
}
