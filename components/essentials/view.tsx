import Link from "next/link";
import { access } from "../../lib/access";
import type { Trip, Segment } from "../../lib/domain";
import {
  budgetSummary,
  localToday,
  type Booking,
  type Task,
  type PackingList,
  type PackingItem,
  type Allocation,
  type Expense,
} from "../../lib/essentials";
import {
  BookingForm,
  TaskForm,
  PackingListForm,
  PackingItemForm,
  AllocationForm,
  ExpenseForm,
  Remove,
  Toggle,
} from "./forms";
import { Submit } from "../forms";
import {
  saveBudgetRules,
  saveBudgetTarget,
  savePackingTemplate,
  applyPackingTemplate,
} from "../../app/essentials-actions";
import { Attachments } from "./attachments";
export function MigrationNotice() {
  return (
    <section className="card">
      <h2>A little setup before takeoff.</h2>
      <p>
        Phase 2 needs migrations 003 and 004 from supabase/migrations, run in
        order in Supabase SQL Editor. Your Phase 1 trips remain available.
      </p>
    </section>
  );
}
export async function EssentialsView({
  trip,
  segments,
  view,
  edit,
  group,
}: {
  trip: Trip;
  segments: Segment[];
  view: string;
  edit?: string;
  group?: string;
}) {
  const { db } = await access();
  const base = "/trips/" + trip.id + "?view=" + view;
  const tables =
    view === "bookings"
      ? ["bookings"]
      : view === "prep"
        ? ["prep_tasks"]
        : view === "packing"
          ? ["packing_lists", "packing_items", "packing_templates"]
          : ["bookings", "budget_allocations", "expenses", "budget_settings"];
  const result = await Promise.all(
    tables.map((table) => {
      let q = db.from(table).select("*");
      if (table !== "packing_templates") q = q.eq("trip_id", trip.id);
      return q;
    }),
  );
  if (
    result.some(
      (r) => r.error?.code === "PGRST205" || r.error?.code === "42P01",
    )
  )
    return <MigrationNotice />;
  if (result.some((r) => r.error))
    throw new Error("Could not load travel essentials");
  const rows = Object.fromEntries(
    tables.map((t, i) => [t, result[i].data || []]),
  );
  if (view === "bookings") {
    const bookings = (rows.bookings as Booking[]).sort(
      (a, b) =>
        a.start_date.localeCompare(b.start_date) ||
        a.local_time.localeCompare(b.local_time),
    );
    const selected = bookings.find((b) => b.id === edit);
    const groups =
      group === "category"
        ? [...new Set(bookings.map((b) => b.category))]
        : ["timeline"];
    return (
      <>
        <div className="row">
          <div>
            <span className="eyebrow">Smart Travel Wallet</span>
            <h2>Your reservations, all together.</h2>
          </div>
          <Link
            className="button secondary"
            href={
              base +
              "&group=" +
              (group === "category" ? "timeline" : "category")
            }
          >
            {group === "category" ? "Timeline view" : "Group by category"}
          </Link>
        </div>
        {groups.map((g) => (
          <section key={g}>
            {g !== "timeline" && <h3>{g}</h3>}
            <div className="timeline">
              {bookings
                .filter((b) => g === "timeline" || b.category === g)
                .map((b) => (
                  <article key={b.id} className="card">
                    <div className="row">
                      <span className="eyebrow">{b.category}</span>
                      <span className="pill">{b.verification}</span>
                    </div>
                    <h3>{b.title}</h3>
                    {b.import_method && b.import_method !== "manual" && (
                      <p className="muted">
                        {b.import_method === "ai"
                          ? "AI-extracted"
                          : "Text-imported"}{" "}
                        · reviewed before saving
                      </p>
                    )}
                    <p>
                      {b.start_date} {b.local_time} {b.timezone} → {b.end_date}{" "}
                      {b.end_local_time}{" "}
                      {b.end_timezone || "(end location not specified)"}
                    </p>
                    <p>
                      {b.provider || "Provider not entered"} · Reference:{" "}
                      {b.reference || "Not entered"}
                    </p>
                    <p>
                      {b.origin}
                      {b.destination ? " → " + b.destination : ""}
                    </p>
                    {b.travelers && <p>Travelers: {b.travelers}</p>}
                    <p>
                      Price:{" "}
                      {b.price === null
                        ? "Unknown"
                        : `${b.currency} ${b.price}`}{" "}
                      · Paid:{" "}
                      {b.paid_amount === null
                        ? "Unknown"
                        : `${b.currency} ${b.paid_amount}`}{" "}
                      · {b.payment_status}
                    </p>
                    {b.notes && <p className="notes">{b.notes}</p>}
                    <Attachments trip={trip.id} booking={b.id} />
                    <div className="actions">
                      <Link
                        data-edit-action
                        className="button secondary"
                        href={base + "&edit=" + b.id}
                      >
                        Edit booking
                      </Link>
                      <Remove table="bookings" trip={trip.id} id={b.id} />
                    </div>
                  </article>
                ))}
            </div>
          </section>
        ))}
        {!bookings.length && (
          <div className="empty">
            No reservations saved yet. Add one you already have.
          </div>
        )}
        <p>
          <Link
            data-edit-action
            className="button secondary"
            href={"/trips/" + trip.id + "?view=import"}
          >
            Import a booking confirmation ↗
          </Link>
        </p>
        <BookingForm
          key={selected?.id || "new"}
          trip={trip}
          item={selected}
          segments={segments}
        />
      </>
    );
  }
  if (view === "prep") {
    const tasks = rows.prep_tasks as Task[];
    const completed = tasks.filter((t) => t.done).length;
    const today = localToday(trip.timezone);
    return (
      <>
        <span className="eyebrow">Smart Prep</span>
        <h2>A calmer kind of countdown.</h2>
        <section className="card lime">
          <h3>
            {completed} of {tasks.length} tasks complete
          </h3>
          <progress
            aria-label="Preparation progress"
            value={completed}
            max={tasks.length || 1}
          />
          <p className="muted">
            Custom reminders and tasks you approved from source notes. No entry
            requirement is determined automatically.{" "}
            <Link href={"/trips/" + trip.id + "?view=research"}>
              Open official-source research ↗
            </Link>
          </p>
        </section>
        {[...new Set(tasks.map((t) => t.category))].map((category) => (
          <section key={category}>
            <h3>{category}</h3>
            <div className="grid">
              {tasks
                .filter((t) => t.category === category)
                .sort((a, b) =>
                  (a.due_date || "9999").localeCompare(b.due_date || "9999"),
                )
                .map((t) => (
                  <article className="card" key={t.id}>
                    <span className="pill">
                      {t.priority} priority · {t.done ? "Complete" : "Open"}
                    </span>
                    <h3>{t.title}</h3>
                    <p>
                      {t.due_date ? "Due " + t.due_date : "No due date"}
                      {!t.done && t.due_date && t.due_date < today
                        ? " · Ready for your attention"
                        : ""}
                    </p>
                    <Toggle
                      table="prep_tasks"
                      trip={trip.id}
                      id={t.id}
                      value={t.done}
                    />
                    <div className="actions">
                      <Link data-edit-action href={base + "&edit=" + t.id}>
                        Edit task
                      </Link>
                      <Remove table="prep_tasks" trip={trip.id} id={t.id} />
                    </div>
                  </article>
                ))}
            </div>
          </section>
        ))}
        {!tasks.length && (
          <div className="empty">
            A fresh checklist. Add what matters for your trip.
          </div>
        )}
        <TaskForm trip={trip} item={tasks.find((t) => t.id === edit)} />
      </>
    );
  }
  if (view === "packing") {
    const lists = rows.packing_lists as PackingList[];
    const items = rows.packing_items as PackingItem[];
    const templates = rows.packing_templates as { id: string; name: string }[];
    return (
      <>
        <span className="eyebrow">Smart Packing</span>
        <h2>A little less “did I forget…?”</h2>
        {lists.map((list) => (
          <section className="packing-section" key={list.id}>
            <div className="row">
              <h2>{list.traveler}</h2>
              <Remove table="packing_lists" trip={trip.id} id={list.id} />
            </div>
            <p>
              {items.filter((i) => i.list_id === list.id && i.packed).length} of{" "}
              {items.filter((i) => i.list_id === list.id).length} packed
            </p>
            <div className="grid">
              {items
                .filter((i) => i.list_id === list.id)
                .map((i) => (
                  <article className="card" key={i.id}>
                    <span className="eyebrow">
                      {i.category} · {i.packed ? "Packed" : "To pack"}
                    </span>
                    <h3>
                      {i.quantity} × {i.title}
                    </h3>
                    <Toggle
                      table="packing_items"
                      trip={trip.id}
                      id={i.id}
                      value={i.packed}
                    />
                    <div className="actions">
                      <Link data-edit-action href={base + "&edit=" + i.id}>
                        Edit
                      </Link>
                      <Remove table="packing_items" trip={trip.id} id={i.id} />
                    </div>
                  </article>
                ))}
            </div>
            <PackingItemForm
              trip={trip}
              list={list.id}
              item={items.find((i) => i.id === edit && i.list_id === list.id)}
            />
            <details>
              <summary>Reusable templates</summary>
              <form action={savePackingTemplate} className="form">
                <input type="hidden" name="trip_id" value={trip.id} />
                <input type="hidden" name="list_id" value={list.id} />
                <label>
                  Save this list as a template
                  <input name="name" required maxLength={100} />
                </label>
                <Submit>Save template</Submit>
              </form>
              {templates.length > 0 && (
                <form action={applyPackingTemplate} className="form">
                  <input type="hidden" name="trip_id" value={trip.id} />
                  <input type="hidden" name="list_id" value={list.id} />
                  <label>
                    Template
                    <select name="template_id">
                      {templates.map((t) => (
                        <option value={t.id} key={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="muted">
                    Adds an unpacked copy of every template item. Existing items
                    are kept.
                  </p>
                  <Submit>Add template items</Submit>
                </form>
              )}
            </details>
          </section>
        ))}
        <PackingListForm trip={trip} />
      </>
    );
  }
  const bookings = rows.bookings as Booking[];
  const allocations = rows.budget_allocations as Allocation[];
  const expenses = rows.expenses as Expense[];
  const include =
    (rows.budget_settings[0]?.include_prepaid as boolean | undefined) ?? true;
  const summary = budgetSummary(
    trip.currency,
    trip.budget,
    include,
    allocations,
    bookings,
    expenses,
  );
  const money = (n: number | null) =>
    n === null ? "Not set" : `${trip.currency} ${Number(n).toFixed(2)}`;
  return (
    <>
      <span className="eyebrow">Smart Budget Planner</span>
      <h2>Make room for the good stuff.</h2>
      <div className="grid">
        <article className="card lime">
          <h3>Trip target</h3>
          <h2>{money(trip.budget)}</h2>
          <p>
            {trip.style} · {trip.travelers} travelers
          </p>
        </article>
        <article className="card">
          <h3>Planned remaining costs</h3>
          <h2>{money(summary.planned)}</h2>
          <p>
            Prepaid recorded: {money(summary.prepaid)}
            {include ? " · included in target" : " · outside target"}
          </p>
        </article>
        <article className="card">
          <h3>Unallocated target</h3>
          <h2>{money(summary.unallocated)}</h2>
          <p>
            {summary.unallocated !== null && summary.unallocated < 0
              ? "Your planned costs exceed your target."
              : "Target minus planned costs and included prepaid amounts."}
          </p>
        </article>
      </div>
      <section className="card">
        <h3>
          Actual spending:{" "}
          {summary.actual === null ? "Not tracked." : "Manually recorded only"}
        </h3>
        {summary.actual &&
          Object.entries(summary.actual).map(([c, n]) => (
            <p key={c}>
              {c} {n.toFixed(2)}
            </p>
          ))}
        <p className="muted">
          Actual expenses are shown separately. They are not added again to your
          planned or prepaid totals. Currencies are never converted
          automatically. Only allocations in the current trip currency count
          toward the planned total.
        </p>
        {bookings.some((b) => b.currency !== trip.currency) && (
          <p className="muted">
            Bookings in other currencies are excluded from the prepaid total
            above; see the Wallet for their amounts.
          </p>
        )}
      </section>
      <div className="two">
        <form action={saveBudgetTarget} className="form">
          <input type="hidden" name="trip_id" value={trip.id} />
          <label>
            Total target · {trip.currency}
            <input
              type="number"
              name="budget"
              min="0"
              step="0.01"
              defaultValue={trip.budget ?? ""}
            />
          </label>
          <label>
            Travel style
            <select name="style" defaultValue={trip.style}>
              {["Budget", "Comfort", "Luxury"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <Submit>Save target</Submit>
          <p className="muted">
            Change currency in Trip Settings. Allocations use the trip currency.
          </p>
        </form>
        <form action={saveBudgetRules} className="form">
          <input type="hidden" name="trip_id" value={trip.id} />
          <label>
            <input
              type="checkbox"
              name="include_prepaid"
              defaultChecked={include}
            />
            Include prepaid bookings in the total target
          </label>
          <p>
            Allocations describe remaining spending. Keep prepaid costs out of
            those allocations to avoid counting them twice.
          </p>
          <Submit>Save inclusion rule</Submit>
        </form>
      </div>
      <h2>Day & destination allocations</h2>
      <div className="grid">
        {allocations.map((a) => (
          <article className="card" key={a.id}>
            <h3>{a.category}</h3>
            <p>
              {a.day || "Whole trip"} ·{" "}
              {segments.find((s) => s.id === a.destination_id)?.title ||
                "All destinations"}
            </p>
            <p>
              Planned: {a.currency} {Number(a.planned).toFixed(2)}
            </p>
            <p>
              Estimated:{" "}
              {a.estimate_low === null
                ? "Not entered"
                : a.currency + " " + a.estimate_low + " – " + a.estimate_high}
            </p>
            <p>{a.notes}</p>
            <div className="actions">
              <Link data-edit-action href={base + "&edit=" + a.id}>
                Edit
              </Link>
              <Remove table="budget_allocations" trip={trip.id} id={a.id} />
            </div>
          </article>
        ))}
      </div>
      <AllocationForm
        trip={trip}
        item={allocations.find((a) => a.id === edit)}
        destinations={segments.filter((s) => s.kind === "destination")}
      />
      <h2>Recorded expenses</h2>
      <div className="grid">
        {expenses
          .sort((a, b) => b.day.localeCompare(a.day))
          .map((e) => (
            <article className="card" key={e.id}>
              <h3>
                {e.currency} {e.amount} · {e.category}
              </h3>
              <p>
                {e.day} · {e.payment_method}
              </p>
              <p>{e.notes}</p>
              <div className="actions">
                <Link data-edit-action href={base + "&edit=" + e.id}>
                  Edit
                </Link>
                <Remove table="expenses" trip={trip.id} id={e.id} />
              </div>
            </article>
          ))}
      </div>
      <ExpenseForm trip={trip} item={expenses.find((e) => e.id === edit)} />
    </>
  );
}
