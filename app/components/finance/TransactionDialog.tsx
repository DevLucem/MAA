"use client";

import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Icon } from "../../assets/icons";
import {
  type TransactionDialogRequest,
  useFinance,
} from "../../lib/finance-store";
import {
  accountDisplayName,
  COMMON_CURRENCIES,
  describeSchedule,
  extractTags,
  type FinanceTransaction,
  flattenAccountTree,
  formatDateTime,
  formatMoney,
  fromLocalInputValue,
  generateDueTransactions,
  localDayKey,
  nextOccurrence,
  normalizeCurrency,
  RECURRING_FREQUENCIES,
  type RecurringFrequency,
  type RecurringRule,
  toLocalInputValue,
  trailingTagFragment,
  type TransactionKind,
} from "../../lib/finance-utils";

const OTHER_CURRENCY = "__other__";

/** Renders the shared transaction dialog whenever one is requested via the finance store. */
export function TransactionDialogHost() {
  const { transactionDialog, closeTransactionDialog } = useFinance();
  if (!transactionDialog) return null;
  const key =
    transactionDialog.mode === "edit"
      ? `edit-${transactionDialog.transaction.id}`
      : transactionDialog.mode === "edit-rule"
        ? `rule-${transactionDialog.rule.id}`
        : transactionDialog.due
          ? `due-${transactionDialog.due.rule.id}-${transactionDialog.due.occurrence}`
          : `new-${transactionDialog.accountId ?? ""}`;
  return (
    <TransactionDialog
      key={key}
      request={transactionDialog}
      onClose={closeTransactionDialog}
    />
  );
}

interface TransactionDialogProps {
  request: TransactionDialogRequest;
  onClose: () => void;
}

const inputClass =
  "h-9 w-full rounded-md border border-border bg-canvas px-3 text-sm text-foreground placeholder:text-muted focus-visible:outline-2 focus-visible:outline-primary";
const labelClass = "mb-1 block text-xs font-medium text-muted";

/** End of the given local calendar day (YYYY-MM-DD) as an ISO instant. */
function endOfLocalDay(value: string): string | undefined {
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();
}

/** Native <dialog> form for recording or editing a transaction or a recurring series. Mount to open. */
function TransactionDialog({ request, onClose }: TransactionDialogProps) {
  const transaction: FinanceTransaction | undefined =
    request.mode === "edit" ? request.transaction : undefined;
  const rule: RecurringRule | undefined =
    request.mode === "edit-rule" ? request.rule : undefined;
  const defaultAccountId = request.mode === "new" ? request.accountId : undefined;
  /** Reviewing a due occurrence of a confirm-first recurring rule. */
  const due = request.mode === "new" ? request.due : undefined;
  const source = transaction ?? rule ?? due?.rule;

  const titleId = useId();
  const baseId = useId();
  const tagHintId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const {
    accounts,
    lastCurrency,
    usedCurrencies,
    usedTags,
    getAccount,
    getRecurringRule,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    addRecurringRule,
    updateRecurringRule,
    setRecurringPaused,
    deleteRecurringRule,
    confirmRecurringOccurrence,
    skipRecurringOccurrence,
    openTransactionDialog,
  } = useFinance();

  const initialAccountId =
    source?.accountId ??
    (defaultAccountId && getAccount(defaultAccountId)
      ? defaultAccountId
      : accounts[0]?.id ?? "");

  const [nowMs] = useState(() => Date.now());
  const [accountId, setAccountId] = useState(initialAccountId);
  const [name, setName] = useState(source?.name ?? "");
  const [tags, setTags] = useState<string[]>(source?.tags ?? []);
  const [nameFocused, setNameFocused] = useState(false);
  const [kind, setKind] = useState<TransactionKind>(source?.kind ?? "expense");
  const [amount, setAmount] = useState(source ? String(source.amount) : "");
  const [fee, setFee] = useState(source && source.fee > 0 ? String(source.fee) : "");
  const initialCurrency = source?.currency ?? lastCurrency;
  const [currency, setCurrency] = useState(initialCurrency);
  // Pick from previously used currencies; switch to free entry for a new one.
  const [customCurrency, setCustomCurrency] = useState(
    !usedCurrencies.includes(initialCurrency)
  );
  const [occurredAt, setOccurredAt] = useState(() => {
    if (transaction) return toLocalInputValue(transaction.occurredAt);
    if (due) return toLocalInputValue(due.occurrence);
    if (rule) {
      const next = nextOccurrence(rule);
      return toLocalInputValue((next ?? new Date(rule.startAt)).toISOString());
    }
    return toLocalInputValue(new Date().toISOString());
  });
  const [note, setNote] = useState(source?.note ?? "");
  const [repeat, setRepeat] = useState<RecurringFrequency | "none">(
    rule?.frequency ?? "none"
  );
  const [repeatInterval, setRepeatInterval] = useState(String(rule?.interval ?? 1));
  const [endDate, setEndDate] = useState(rule?.endAt ? localDayKey(rule.endAt) : "");
  const [autoAdd, setAutoAdd] = useState(rule?.autoAdd ?? false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const accountOptions = useMemo(() => flattenAccountTree(accounts), [accounts]);
  const currencySuggestions = useMemo(
    () => COMMON_CURRENCIES.filter((code) => !usedCurrencies.includes(code)),
    [usedCurrencies]
  );
  const seriesRule = transaction?.recurringId
    ? getRecurringRule(transaction.recurringId)
    : due?.rule;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  // Progressive enhancement fallback for browsers without native `closedby="any"`.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || "closedBy" in HTMLDialogElement.prototype) return;
    const isOutside = (event: PointerEvent) => {
      const rect = dialog.getBoundingClientRect();
      return (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      );
    };
    let pressedOutside = false;
    const down = (e: PointerEvent) => {
      pressedOutside = isOutside(e);
    };
    const up = (e: PointerEvent) => {
      if (pressedOutside && isOutside(e)) dialog.close();
      pressedOutside = false;
    };
    dialog.addEventListener("pointerdown", down);
    dialog.addEventListener("pointerup", up);
    return () => {
      dialog.removeEventListener("pointerdown", down);
      dialog.removeEventListener("pointerup", up);
    };
  }, []);

  const addTags = (incoming: string[]) => {
    if (incoming.length === 0) return;
    setTags((prev) => [...prev, ...incoming.filter((tag) => !prev.includes(tag))]);
  };

  /** Moves completed `#tags` (followed by a space or comma) out of the text into chips. */
  const handleTaggedChange = (value: string, setter: (v: string) => void) => {
    const { text, tags: found } = extractTags(value, true);
    addTags(found);
    setter(text);
  };

  const tagFragment = nameFocused ? trailingTagFragment(name) : null;
  const tagSuggestions =
    tagFragment === null
      ? []
      : usedTags
          .filter((tag) => tag.startsWith(tagFragment) && !tags.includes(tag))
          .slice(0, 6);

  const applySuggestion = (tag: string) => {
    setName((prev) => prev.replace(/(^|\s)#[^\s#]*$/u, "$1"));
    addTags([tag]);
    document.getElementById(`${baseId}-name`)?.focus();
  };

  const handleNameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // Enter or Tab while typing a tag commits it instead of submitting / leaving.
    if ((event.key === "Enter" || event.key === "Tab") && tagFragment) {
      event.preventDefault();
      const { text, tags: found } = extractTags(name, false);
      addTags(found);
      setName(text);
    } else if (event.key === "Backspace" && name === "" && tags.length > 0) {
      setTags((prev) => prev.slice(0, -1));
    }
  };

  const parsedAmount = Number(amount) || 0;
  const parsedFee = Number(fee) || 0;
  const parsedInterval = Math.max(1, Math.min(999, Math.floor(Number(repeatInterval)) || 1));
  const normalizedCurrency = normalizeCurrency(currency);
  const net = kind === "income" ? parsedAmount - parsedFee : -(parsedAmount + parsedFee);
  const isRecurring = repeat !== "none";
  const occurredIso = fromLocalInputValue(occurredAt);
  const endAt = isRecurring && endDate ? endOfLocalDay(endDate) : undefined;
  const repeatUnit = RECURRING_FREQUENCIES.find((f) => f.id === repeat)?.unit ?? "";

  // Preview how many occurrences are already due (they are added immediately on save).
  const dueNowCount =
    isRecurring && occurredIso
      ? generateDueTransactions(
          {
            id: "preview",
            accountId,
            name,
            kind,
            amount: parsedAmount,
            fee: parsedFee,
            currency: normalizedCurrency ?? "USD",
            tags,
            frequency: repeat,
            interval: parsedInterval,
            startAt: occurredIso,
            nextIndex: 0,
            ...(endAt ? { endAt } : {}),
            createdAt: occurredIso,
            updatedAt: occurredIso,
          },
          new Date(nowMs),
          1000
        ).transactions.length
      : 0;

  const close = () => dialogRef.current?.close();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nameParts = extractTags(name, false);
    const noteParts = extractTags(note, false);
    const allTags = [...tags];
    for (const tag of [...nameParts.tags, ...noteParts.tags]) {
      if (!allTags.includes(tag)) allTags.push(tag);
    }
    const finalName = nameParts.text.trim();
    if (!accountId || !normalizedCurrency || !occurredIso || !finalName) {
      setName(nameParts.text);
      setNote(noteParts.text);
      addTags(allTags);
      return;
    }
    const base = {
      accountId,
      name: finalName,
      kind,
      amount: parsedAmount,
      fee: parsedFee,
      currency: normalizedCurrency,
      note: noteParts.text,
      tags: allTags,
    };
    if (due) {
      confirmRecurringOccurrence(due.rule.id, due.occurrence, {
        ...base,
        occurredAt: occurredIso,
      });
    } else if (rule && isRecurring) {
      updateRecurringRule(rule.id, {
        ...base,
        frequency: repeat,
        interval: parsedInterval,
        startAt: occurredIso,
        endAt,
        autoAdd,
      });
    } else if (transaction) {
      updateTransaction(transaction.id, { ...base, occurredAt: occurredIso });
    } else if (isRecurring) {
      addRecurringRule({
        ...base,
        frequency: repeat,
        interval: parsedInterval,
        startAt: occurredIso,
        endAt,
        autoAdd,
      });
    } else {
      addTransaction({ ...base, occurredAt: occurredIso });
    }
    close();
  };

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    if (rule) deleteRecurringRule(rule.id);
    else if (transaction) deleteTransaction(transaction.id);
    close();
  };

  const title = due
    ? "Confirm recurring transaction"
    : rule
    ? "Edit recurring transaction"
    : transaction
      ? "Edit transaction"
      : "New transaction";

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      {...({ closedby: "any" } as Record<string, string>)}
      onClose={onClose}
      className="settings-dialog m-auto w-[min(92vw,32rem)] max-h-[min(92dvh,48rem)] overflow-hidden rounded-xl border border-border bg-surface p-0 text-foreground shadow-2xl"
    >
      {/* Header and footer stay visible; only the fields scroll. */}
      <form onSubmit={handleSubmit} className="flex max-h-[min(92dvh,48rem)] flex-col">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-3.5">
          <h2 id={titleId} className="flex items-center gap-2 text-base font-semibold">
            {(rule || due) && <Icon name="sync" className="size-4 text-muted" />}
            {title}
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={close}
            className="inline-flex size-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
          >
            <Icon name="x" className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4">
          {(transaction?.recurringId || due) && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-canvas px-3 py-2 text-xs">
              <span className="flex items-center gap-1.5 text-muted">
                <Icon name="sync" className="size-3.5" />
                {due
                  ? `Due ${formatDateTime(due.occurrence)} · ${describeSchedule(due.rule)}. Adjust anything before adding.`
                  : seriesRule
                    ? `Part of a recurring series · ${describeSchedule(seriesRule)}`
                    : "From a recurring series that has been stopped"}
              </span>
              {seriesRule && (
                <button
                  type="button"
                  onClick={() => openTransactionDialog({ mode: "edit-rule", rule: seriesRule })}
                  className="shrink-0 rounded px-1.5 py-0.5 font-medium text-primary hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary"
                >
                  Edit series
                </button>
              )}
            </div>
          )}

          <fieldset>
            <legend className="sr-only">Transaction type</legend>
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-secondary p-1">
              {(["expense", "income"] as const).map((option) => (
                <label
                  key={option}
                  className={`cursor-pointer rounded-md py-1.5 text-center text-sm font-medium capitalize transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary ${
                    kind === option
                      ? "bg-canvas text-foreground shadow-sm"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  <input
                    type="radio"
                    name="kind"
                    value={option}
                    checked={kind === option}
                    onChange={() => setKind(option)}
                    className="sr-only"
                  />
                  {option}
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <label htmlFor={`${baseId}-name`} className={labelClass}>
              Name
            </label>
            <input
              id={`${baseId}-name`}
              type="text"
              required
              autoFocus
              autoComplete="off"
              value={name}
              onChange={(e) => handleTaggedChange(e.target.value, setName)}
              onKeyDown={handleNameKeyDown}
              onFocus={() => setNameFocused(true)}
              onBlur={() => {
                setNameFocused(false);
                // Commit a tag left at the end of the name.
                const { text, tags: found } = extractTags(name, false);
                if (found.length > 0) {
                  addTags(found);
                  setName(text);
                }
              }}
              placeholder={kind === "income" ? "e.g. Salary #work" : "e.g. Groceries #food"}
              aria-describedby={tagHintId}
              className={inputClass}
            />
            {tagSuggestions.length > 0 && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1" aria-label="Tag suggestions">
                {tagSuggestions.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    // Keep focus in the name field so the blur handler doesn't commit the fragment.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => applySuggestion(tag)}
                    className="rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-muted transition-colors hover:border-primary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            )}
            {tags.length > 0 && (
              <ul className="mt-1.5 flex flex-wrap gap-1" aria-label="Tags">
                {tags.map((tag) => (
                  <li
                    key={tag}
                    className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 py-0.5 ps-2 pe-0.5 text-xs font-medium text-primary"
                  >
                    #{tag}
                    <button
                      type="button"
                      aria-label={`Remove tag ${tag}`}
                      onClick={() => setTags((prev) => prev.filter((t) => t !== tag))}
                      className="inline-flex size-4 items-center justify-center rounded-full hover:bg-primary/20 focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      <Icon name="x" className="size-2.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p id={tagHintId} className="mt-1 text-[11px] text-muted">
              Type <span className="font-medium">#tag</span> followed by a space to add a tag.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor={`${baseId}-amount`} className={labelClass}>
                Amount
              </label>
              <input
                id={`${baseId}-amount`}
                type="number"
                inputMode="decimal"
                required
                min="0"
                step="any"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className={`${inputClass} tabular-nums`}
              />
            </div>
            <div>
              <label htmlFor={`${baseId}-fee`} className={labelClass}>
                Fee
              </label>
              <input
                id={`${baseId}-fee`}
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={fee}
                onChange={(e) => setFee(e.target.value)}
                placeholder="0.00"
                className={`${inputClass} tabular-nums`}
              />
            </div>
            <div>
              <label htmlFor={`${baseId}-currency`} className={labelClass}>
                Currency
              </label>
              {customCurrency ? (
                <div className="flex gap-1">
                  <input
                    id={`${baseId}-currency`}
                    type="text"
                    required
                    list={`${baseId}-currencies`}
                    pattern="[A-Za-z]{3}"
                    maxLength={3}
                    autoComplete="off"
                    title="3-letter currency code, e.g. USD"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                    className={`${inputClass} uppercase`}
                  />
                  {usedCurrencies.length > 0 && (
                    <button
                      type="button"
                      aria-label="Choose a previously used currency"
                      title="Back to list"
                      onClick={() => {
                        setCustomCurrency(false);
                        setCurrency(
                          usedCurrencies.includes(lastCurrency) ? lastCurrency : usedCurrencies[0]
                        );
                      }}
                      className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-border text-muted transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      <Icon name="x" className="size-3.5" />
                    </button>
                  )}
                  <datalist id={`${baseId}-currencies`}>
                    {currencySuggestions.map((code) => (
                      <option key={code} value={code} />
                    ))}
                  </datalist>
                </div>
              ) : (
                <select
                  id={`${baseId}-currency`}
                  value={currency}
                  onChange={(e) => {
                    if (e.target.value === OTHER_CURRENCY) {
                      setCustomCurrency(true);
                      setCurrency("");
                      requestAnimationFrame(() =>
                        document.getElementById(`${baseId}-currency`)?.focus()
                      );
                    } else {
                      setCurrency(e.target.value);
                    }
                  }}
                  className={inputClass}
                >
                  {usedCurrencies.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                  <option value={OTHER_CURRENCY}>Other…</option>
                </select>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={`${baseId}-date`} className={labelClass}>
                {rule ? "Next occurrence" : isRecurring ? "First occurrence" : "Date & time"}
              </label>
              <input
                id={`${baseId}-date`}
                type="datetime-local"
                required
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
                className={inputClass}
                aria-describedby={`${baseId}-date-hint`}
              />
              <p id={`${baseId}-date-hint`} className="mt-1 text-[11px] text-muted">
                {isRecurring ? "Later ones keep this time of day." : "When it actually happened."}
              </p>
            </div>
            <div>
              <label htmlFor={`${baseId}-account`} className={labelClass}>
                Account
              </label>
              <select
                id={`${baseId}-account`}
                required
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className={inputClass}
              >
                {accountOptions.map(({ account, depth }) => (
                  <option key={account.id} value={account.id}>
                    {"\u00A0\u00A0".repeat(depth)}
                    {account.icon ? `${account.icon} ` : ""}
                    {accountDisplayName(account)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {!transaction && !due && (
            <fieldset className="space-y-3 rounded-lg border border-border bg-canvas p-3">
              <legend className="px-1 text-xs font-medium text-muted">Repeat</legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label htmlFor={`${baseId}-repeat`} className={labelClass}>
                    Frequency
                  </label>
                  <select
                    id={`${baseId}-repeat`}
                    value={repeat}
                    onChange={(e) => setRepeat(e.target.value as RecurringFrequency | "none")}
                    className={inputClass}
                  >
                    {!rule && <option value="none">Doesn&rsquo;t repeat</option>}
                    {RECURRING_FREQUENCIES.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>
                {isRecurring && (
                  <>
                    <div>
                      <label htmlFor={`${baseId}-interval`} className={labelClass}>
                        Every
                      </label>
                      <div className="flex items-center gap-1.5">
                        <input
                          id={`${baseId}-interval`}
                          type="number"
                          inputMode="numeric"
                          min="1"
                          max="999"
                          step="1"
                          required
                          value={repeatInterval}
                          onChange={(e) => setRepeatInterval(e.target.value)}
                          className={`${inputClass} w-16 tabular-nums`}
                        />
                        <span className="text-xs text-muted">
                          {repeatUnit}
                          {parsedInterval === 1 ? "" : "s"}
                        </span>
                      </div>
                    </div>
                    <div>
                      <label htmlFor={`${baseId}-end`} className={labelClass}>
                        Ends <span className="font-normal">(optional)</span>
                      </label>
                      <input
                        id={`${baseId}-end`}
                        type="date"
                        value={endDate}
                        min={occurredAt.slice(0, 10)}
                        onChange={(e) => setEndDate(e.target.value)}
                        className={inputClass}
                      />
                    </div>
                  </>
                )}
              </div>
              {isRecurring && (
                <>
                  <label className="flex cursor-pointer items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={autoAdd}
                      onChange={(e) => setAutoAdd(e.target.checked)}
                      className="mt-0.5 size-4 shrink-0 rounded border-border"
                    />
                    <span>
                      Add automatically when due
                      <span className="block text-[11px] text-muted">
                        Off: each occurrence shows as due so you can confirm, adjust, or skip it.
                      </span>
                    </span>
                  </label>
                  <p className="text-[11px] text-muted">
                    {autoAdd
                      ? dueNowCount > 0
                        ? `${dueNowCount} past ${dueNowCount === 1 ? "occurrence is" : "occurrences are"} due and will be added now${
                            rule ? " (already-recorded ones are not duplicated)" : ""
                          }.`
                        : "Each occurrence will be added automatically when due."
                      : dueNowCount > 0
                        ? `${dueNowCount} past ${dueNowCount === 1 ? "occurrence" : "occurrences"} will show as due for you to confirm.`
                        : "Each occurrence will show as due for you to confirm."}
                  </p>
                </>
              )}
            </fieldset>
          )}

          <div>
            <label htmlFor={`${baseId}-note`} className={labelClass}>
              Note <span className="font-normal">(optional)</span>
            </label>
            <textarea
              id={`${baseId}-note`}
              rows={2}
              value={note}
              onChange={(e) => handleTaggedChange(e.target.value, setNote)}
              className="w-full resize-y rounded-md border border-border bg-canvas px-3 py-2 text-sm text-foreground placeholder:text-muted focus-visible:outline-2 focus-visible:outline-primary"
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border bg-canvas px-3 py-2 text-sm">
            <span className="text-muted">
              Balance impact{isRecurring ? " each time" : ""}
            </span>
            <span
              className={`font-semibold tabular-nums ${
                net > 0 ? "text-success" : net < 0 ? "text-danger" : "text-foreground"
              }`}
            >
              {normalizedCurrency ? formatMoney(net, normalizedCurrency, { signed: true }) : "—"}
            </span>
          </div>

          {transaction && (
            <p className="text-[11px] text-muted">
              Recorded {formatDateTime(transaction.recordedAt)}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-3">
          <div className="flex items-center gap-1">
            {(transaction || rule) && (
              <button
                type="button"
                onClick={handleDelete}
                onBlur={() => setConfirmDelete(false)}
                className={`inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
                  confirmDelete ? "danger" : "text-danger hover:bg-secondary"
                }`}
              >
                <Icon name="trash" className="size-4" />
                {confirmDelete ? "Confirm" : rule ? "Stop repeating" : "Delete"}
              </button>
            )}
            {due && (
              <button
                type="button"
                onClick={() => {
                  skipRecurringOccurrence(due.rule.id, due.occurrence);
                  close();
                }}
                className="h-9 rounded-md px-3 text-sm font-medium text-muted transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
              >
                Skip this one
              </button>
            )}
            {rule && (
              <button
                type="button"
                onClick={() => {
                  setRecurringPaused(rule.id, !rule.paused);
                  close();
                }}
                className="h-9 rounded-md px-3 text-sm font-medium text-muted transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
              >
                {rule.paused ? "Resume" : "Pause"}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={close}
              className="h-9 rounded-md px-3 text-sm font-medium text-muted transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="primary h-9 rounded-md px-4 text-sm font-medium transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {due
                ? "Add transaction"
                : transaction || rule
                  ? "Save"
                  : isRecurring
                    ? "Add recurring"
                    : "Add transaction"}
            </button>
          </div>
        </div>
      </form>
    </dialog>
  );
}
