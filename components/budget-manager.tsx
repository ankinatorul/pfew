"use client";
import {
  useState,
  useRef,
  useEffect,
  type ReactNode,
  type ElementType,
  type FormEvent,
} from "react";
import { Plus, Wallet, Receipt, ArrowUpRight } from "lucide-react";
import type { Trip } from "../lib/domain";
import type { Allocation } from "../lib/essentials";
import {
  tripMoney,
  displayMoney,
  expenseName,
  expenseCategories,
  namedExpenseSchema,
  type ManagedExpense,
  type ManagedBooking,
  type ExpenseInput,
  type MoneyResult,
} from "../lib/booking-budget";
import { MoneyHeader } from "./booking-manager";
import { tripSectionUrl } from "../lib/trip-navigation";
export type BudgetProps = {
  trip: Trip;
  bookings: ManagedBooking[];
  expenses: ManagedExpense[];
  allocations: Allocation[];
  canEdit: boolean;
  ready: boolean;
  today: string;
  loadError?: string;
  planning?: ReactNode;
  initialExpense?: string;
};
export function BudgetManager({
  trip,
  bookings,
  expenses,
  allocations,
  canEdit,
  ready,
  today,
  loadError,
  planning,
  initialExpense,
  saveExpense,
  removeExpense,
  saveBudget,
  LinkComponent = "a",
}: BudgetProps & {
  saveExpense: (input: ExpenseInput) => Promise<MoneyResult>;
  removeExpense: (expense: ManagedExpense) => Promise<MoneyResult>;
  saveBudget: (input: {
    amount: string;
    currency: string;
    expectedAmount: number | null;
    expectedCurrency: string;
  }) => Promise<MoneyResult>;
  LinkComponent?: ElementType;
}) {
  const [filter, setFilter] = useState("all"),
    [currencyFilter, setCurrencyFilter] = useState("all"),
    [editor, setEditor] = useState<ExpenseInput | null>(() => {
      const e = expenses.find((e) => e.id === initialExpense);
      return e ? toInput(e) : null;
    }),
    [target, setTarget] = useState<{
      amount: string;
      currency: string;
      expectedAmount: number | null;
      expectedCurrency: string;
    } | null>(null),
    [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const guard = useRef(false),
    editorRef = useRef<HTMLFormElement>(null),
    targetRef = useRef<HTMLFormElement>(null),
    feedback = useRef<HTMLParagraphElement>(null),
    addRef = useRef<HTMLButtonElement>(null);
  const editorId = editor?.id,
    targetOpen = !!target;
  useEffect(() => {
    if (editorId) {
      editorRef.current
        ?.querySelector<HTMLInputElement>("[name=title]")
        ?.focus();
      editorRef.current?.scrollIntoView({ block: "start" });
    }
  }, [editorId]);
  useEffect(() => {
    if (targetOpen)
      targetRef.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, [targetOpen]);
  function toInput(e: ManagedExpense): ExpenseInput {
    return {
      id: e.id,
      revision: e.finance_revision || 0,
      title: e.title || "",
      amount: String(e.amount),
      currency: e.currency,
      category: e.category,
      day: e.day,
      notes: e.notes,
      payment_method: e.payment_method,
      booking_id: e.booking_id || "",
    };
  }
  if (loadError)
    return (
      <div className="trip-budget money-page">
        <MoneyHeader trip={trip} view="budget" LinkComponent={LinkComponent} />
        <p role="alert" className="money-notice">
          {loadError} Saved totals are unavailable, rather than zero.
        </p>
      </div>
    );
  const allowed = canEdit && ready && !loadError,
    summary = tripMoney(trip, bookings, expenses, allocations),
    money = (n: number | string) => displayMoney(trip.currency, n);
  const allCategories = [
      ...new Set([...expenseCategories, ...expenses.map((e) => e.category)]),
    ],
    filtered = expenses
      .filter(
        (e) =>
          (filter === "all" || e.category === filter) &&
          (currencyFilter === "all" || e.currency === currencyFilter),
      )
      .sort((a, b) => b.day.localeCompare(a.day) || b.id.localeCompare(a.id));
  async function run(action: () => Promise<MoneyResult>, close = false) {
    if (guard.current) return;
    guard.current = true;
    setPending(true);
    setError("");
    setMessage("");
    try {
      const result = await action();
      if (result.error) {
        setError(result.error);
        requestAnimationFrame(() => feedback.current?.focus());
        return;
      }
      setMessage(result.message || "Saved.");
      if (close) {
        setEditor(null);
        setTarget(null);
        requestAnimationFrame(() => addRef.current?.focus());
      }
    } catch {
      setError(
        "The request was interrupted. Your input is still here. Check your connection and retry.",
      );
    } finally {
      setPending(false);
      guard.current = false;
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!editor) return;
    const parsed = namedExpenseSchema.safeParse(editor);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      feedback.current?.focus();
      return;
    }
    await run(() => saveExpense(parsed.data), true);
  }
  const percent =
      trip.budget === null
        ? 0
        : trip.budget === 0
          ? summary.recorded
            ? 100
            : 0
          : Math.min(100, (summary.recorded / trip.budget) * 100),
    selectedBooking = bookings.find((b) => b.id === editor?.booking_id);
  return (
    <div className="trip-budget money-page">
      <MoneyHeader trip={trip} view="budget" LinkComponent={LinkComponent} />
      {loadError && (
        <p className="money-notice" role="alert">
          {loadError}
        </p>
      )}
      {!ready && (
        <p className="money-notice">
          Your saved budget stays readable. Named expenses, booking links and
          new edit controls need reviewed database update 015.
        </p>
      )}
      {!canEdit && (
        <p className="money-notice">You have view-only access to this trip.</p>
      )}
      <div className="money-summary">
        <article className="money-card money-lavender">
          <span className="money-icon">
            <Wallet size={20} />
          </span>
          <h2>Trip budget</h2>
          <strong className="money-total">
            {trip.budget === null ? "Not set yet" : money(trip.budget)}
          </strong>
          <p>Your monetary target · {trip.currency}</p>
          {canEdit && (
            <button
              disabled={!allowed || pending}
              onClick={() => {
                setTarget({
                  amount: trip.budget === null ? "" : String(trip.budget),
                  currency: trip.currency,
                  expectedAmount: trip.budget,
                  expectedCurrency: trip.currency,
                });
                setEditor(null);
                setError("");
              }}
            >
              {trip.budget === null ? "Set a budget" : "Edit budget"}
            </button>
          )}
        </article>
        <article className="money-card">
          <span className="money-icon lime">
            <Receipt size={20} />
          </span>
          <h2>Actual recorded spending</h2>
          <strong className="money-total">{money(summary.recorded)}</strong>
          <p>
            {expenses.filter((e) => e.currency === trip.currency).length}{" "}
            recorded expenses in {trip.currency}. Booking prices are not added.
          </p>
        </article>
        <article className="money-card">
          <h2>
            {summary.remaining !== null && summary.remaining < 0
              ? "Over budget"
              : "Remaining budget"}
          </h2>
          <strong className="money-total">
            {summary.remaining === null
              ? "Set a target first"
              : money(
                  summary.remaining < 0
                    ? -summary.remaining
                    : summary.remaining,
                )}
          </strong>
          <p>
            {summary.remaining === null
              ? "No default amount has been invented."
              : "Target minus recorded expenses in " +
                trip.currency +
                ". Other currencies stay separate."}
          </p>
        </article>
      </div>
      {trip.budget !== null && (
        <div className="money-card money-progress">
          <div>
            <strong>{money(summary.recorded)} recorded</strong>
            <span>of {money(trip.budget)}</span>
          </div>
          <progress
            aria-label="Recorded spending against trip budget"
            value={percent}
            max={100}
          />
          <p className="money-muted">
            Based on the expenses you have recorded, not an estimate of all trip
            costs.
          </p>
        </div>
      )}
      <div className="money-toolbar">
        {canEdit && (
          <button
            ref={addRef}
            className="button primary"
            disabled={!allowed || pending}
            onClick={() => {
              setEditor({
                id: crypto.randomUUID(),
                revision: 0,
                title: "",
                amount: "",
                currency: trip.currency,
                category: "Other",
                day: today,
                notes: "",
                payment_method: "other",
                booking_id: "",
              });
              setTarget(null);
              setError("");
            }}
          >
            <Plus size={17} /> Add expense
          </button>
        )}
        <LinkComponent href={tripSectionUrl(trip.id, "bookings")}>
          Review booking costs <ArrowUpRight size={16} />
        </LinkComponent>
      </div>
      <p
        ref={feedback}
        tabIndex={-1}
        role={error ? "alert" : "status"}
        className={error ? "money-notice money-error" : "money-feedback"}
      >
        {error || message}
      </p>
      {target && allowed && (
        <form
          ref={targetRef}
          className="money-card money-editor"
          aria-label="Monetary budget editor"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => saveBudget(target!), true);
          }}
        >
          <div className="money-section-heading">
            <h2>A budget that works for you</h2>
            <button
              type="button"
              disabled={pending}
              onClick={() => setTarget(null)}
            >
              Cancel
            </button>
          </div>
          <fieldset disabled={pending}>
            <div className="money-form-grid">
              <label>
                Trip budget amount
                <input
                  aria-label="Trip budget amount"
                  type="number"
                  min="0"
                  max="9999999999"
                  step="0.01"
                  value={target.amount}
                  onChange={(e) =>
                    setTarget({ ...target, amount: e.target.value })
                  }
                />
              </label>
              <label>
                Budget currency
                <input
                  aria-label="Budget currency"
                  required
                  pattern="[A-Z]{3}"
                  maxLength={3}
                  value={target.currency}
                  onChange={(e) =>
                    setTarget({
                      ...target,
                      currency: e.target.value.toUpperCase(),
                    })
                  }
                />
              </label>
            </div>
            <p className="money-muted">
              Leave the amount blank to remove the monetary target. Travel style
              stays unchanged. Changing the currency changes this target’s unit;
              existing expenses, allocations and bookings keep their original
              amounts and currencies. No conversion is performed.
            </p>
            <button className="button primary" disabled={pending}>
              {pending ? "Saving…" : "Save budget"}
            </button>
          </fieldset>
        </form>
      )}
      {editor && allowed && (
        <form
          ref={editorRef}
          onSubmit={submit}
          className="money-card money-editor"
          aria-label="Expense editor"
        >
          <div className="money-section-heading">
            <h2>
              {expenses.some((e) => e.id === editor.id)
                ? "Edit expense"
                : "A little spent along the way"}
            </h2>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setEditor(null);
                addRef.current?.focus();
              }}
            >
              Cancel
            </button>
          </div>
          <fieldset disabled={pending}>
            <div className="money-form-grid">
              <label className="money-wide">
                Expense name
                <input
                  name="title"
                  required
                  maxLength={200}
                  value={editor.title}
                  onChange={(e) =>
                    setEditor({ ...editor, title: e.target.value })
                  }
                />
              </label>
              <label>
                Amount
                <input
                  type="number"
                  required
                  min="0.01"
                  max="9999999999"
                  step="0.01"
                  value={editor.amount}
                  onChange={(e) =>
                    setEditor({ ...editor, amount: e.target.value })
                  }
                />
              </label>
              <label>
                Expense currency
                <input
                  required
                  pattern="[A-Z]{3}"
                  maxLength={3}
                  value={editor.currency}
                  onChange={(e) =>
                    setEditor({
                      ...editor,
                      currency: e.target.value.toUpperCase(),
                    })
                  }
                />
              </label>
              <label>
                Expense category
                <input
                  required
                  list="expense-categories"
                  maxLength={100}
                  value={editor.category}
                  onChange={(e) =>
                    setEditor({ ...editor, category: e.target.value })
                  }
                />
                <datalist id="expense-categories">
                  {allCategories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </label>
              <label>
                Expense date
                <input
                  required
                  type="date"
                  value={editor.day}
                  onChange={(e) =>
                    setEditor({ ...editor, day: e.target.value })
                  }
                />
              </label>
              <label>
                Payment method
                <select
                  aria-label="Payment method"
                  value={editor.payment_method}
                  onChange={(e) =>
                    setEditor({
                      ...editor,
                      payment_method: e.target
                        .value as ExpenseInput["payment_method"],
                    })
                  }
                >
                  {["cash", "card", "other"].map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </label>
              <label>
                Related booking (optional)
                <select
                  aria-label="Related booking (optional)"
                  value={editor.booking_id}
                  onChange={(e) =>
                    setEditor({ ...editor, booking_id: e.target.value })
                  }
                >
                  <option value="">No related booking</option>
                  {bookings.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.title} · {b.currency}
                    </option>
                  ))}
                </select>
              </label>
              <label className="money-wide">
                Expense notes (optional)
                <textarea
                  rows={3}
                  maxLength={1000}
                  value={editor.notes}
                  onChange={(e) =>
                    setEditor({ ...editor, notes: e.target.value })
                  }
                />
              </label>
            </div>
            {selectedBooking && (
              <p className="money-notice">
                Linked to {selectedBooking.title}.{" "}
                {
                  expenses.filter(
                    (e) =>
                      e.booking_id === selectedBooking.id && e.id !== editor.id,
                  ).length
                }{" "}
                other recorded expenses are linked. This reference does not
                change its price or payment status, and no extra expense is
                created.
              </p>
            )}
            <p className="money-muted">
              A date is required by the existing expense model. Nothing is added
              to a booking automatically. Manual entry only; no bank account is
              connected.
            </p>
            <button className="button primary" disabled={pending}>
              {pending ? "Saving…" : "Save expense"}
            </button>
          </fieldset>
        </form>
      )}
      <div className="money-budget-grid">
        <section className="money-card">
          <h2>Spending by category · {trip.currency}</h2>
          {summary.categoryTotals.length ? (
            <ul className="money-category-chart">
              {summary.categoryTotals.map((c) => (
                <li key={c.category}>
                  <div>
                    <span>{c.category}</span>
                    <strong>{money(c.amount)}</strong>
                  </div>
                  <div className="money-chart-track" aria-hidden="true">
                    <span
                      style={{
                        width:
                          (summary.recorded
                            ? (c.amount / summary.recorded) * 100
                            : 0) + "%",
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p>No expenses recorded in {trip.currency} yet.</p>
          )}
          <p className="money-muted">
            Recorded expenses only. Other currencies are not included in these
            bars.
          </p>
        </section>
        <section className="money-card">
          <h2>Planned costs</h2>
          {summary.planned.length ? (
            summary.planned.map((p) => (
              <p key={p.currency}>
                <strong>{displayMoney(p.currency, p.amount)}</strong> allocated
              </p>
            ))
          ) : (
            <p>No planned allocations saved.</p>
          )}
          <h3>Saved booking prices</h3>
          {summary.bookingPrices.length ? (
            summary.bookingPrices.map((p) => (
              <p key={p.currency}>{displayMoney(p.currency, p.amount)}</p>
            ))
          ) : (
            <p>No booking prices supplied.</p>
          )}
          <p className="money-muted">
            These are saved price references, which may still need review, not
            recorded expenses. A confirmed reservation still does not prove
            payment. {summary.missingPrices} bookings have no price supplied.
          </p>
          <h3>Amounts noted as paid on bookings</h3>
          {summary.bookingPaid.length ? (
            summary.bookingPaid.map((p) => (
              <p key={p.currency}>{displayMoney(p.currency, p.amount)}</p>
            ))
          ) : (
            <p>No paid amounts supplied.</p>
          )}
          <p className="money-muted">
            Shown separately. Never added to actual spending or deducted again
            from your remaining budget.
          </p>
        </section>
      </div>
      {summary.actual.some((t) => t.currency !== trip.currency) && (
        <section className="money-card">
          <h2>Other currencies · recorded separately</h2>
          {summary.actual
            .filter((t) => t.currency !== trip.currency)
            .map((t) => (
              <p key={t.currency}>
                <strong>{displayMoney(t.currency, t.amount)}</strong>
              </p>
            ))}
          <p className="money-muted">
            No exchange-rate service is configured. These amounts are not
            converted or deducted from the {trip.currency} target.
          </p>
        </section>
      )}
      <div className="money-section-heading">
        <h2>Recorded expenses</h2>
        <span className="money-muted">{expenses.length} saved</span>
      </div>
      <div className="money-filters expense-filters">
        <label>
          Filter expenses by category
          <select
            aria-label="Filter expenses by category"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">All categories</option>
            {allCategories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Filter expense currency
          <select
            aria-label="Filter expense currency"
            value={currencyFilter}
            onChange={(e) => setCurrencyFilter(e.target.value)}
          >
            <option value="all">All currencies</option>
            {[...new Set(expenses.map((e) => e.currency))].sort().map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>
      {!expenses.length ? (
        <section className="money-empty">
          <Receipt size={30} />
          <h2>Keep the memories. Track the little costs.</h2>
          <p>
            Add your first expense when you spend something. Booking prices
            won’t be turned into expenses automatically.
          </p>
        </section>
      ) : !filtered.length ? (
        <p className="money-notice">No expenses match these filters.</p>
      ) : (
        <div className="money-expenses">
          {filtered.map((e) => (
            <article
              key={e.id}
              className="money-card money-expense"
              aria-label={expenseName(e)}
            >
              <div>
                <h3>{expenseName(e)}</h3>
                <p>
                  {e.category} · {e.day} · {e.payment_method}
                </p>
                {e.booking_id && (
                  <p className="money-muted">
                    Related booking:{" "}
                    {bookings.find((b) => b.id === e.booking_id)?.title ||
                      "Unavailable"}
                  </p>
                )}
                {e.notes && (
                  <details>
                    <summary>Expense details</summary>
                    <p className="money-notes">{e.notes}</p>
                  </details>
                )}
              </div>
              <div>
                <strong>{displayMoney(e.currency, e.amount)}</strong>
                {allowed && (
                  <div className="money-card-actions">
                    <button
                      disabled={pending}
                      onClick={() => {
                        setEditor(toInput(e));
                        setTarget(null);
                        setError("");
                      }}
                    >
                      Edit expense
                    </button>
                    <button
                      disabled={pending}
                      onClick={() => {
                        if (
                          window.confirm(
                            "Delete “" +
                              expenseName(e) +
                              "”? This removes only this recorded expense. Its booking and confirmation files stay saved.",
                          )
                        )
                          void run(() => removeExpense(e));
                      }}
                    >
                      Delete expense
                    </button>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {planning && (
        <details className="money-card money-planning">
          <summary>Advanced planning & saved allocations</summary>
          <p className="money-muted">
            Existing planned/prepaid allocation tools. Their unallocated target
            is a planning figure; it is separate from the actual-expense
            remaining budget above.
          </p>
          {planning}
        </details>
      )}
    </div>
  );
}
