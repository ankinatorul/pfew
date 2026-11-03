import Link from "next/link";
import { access } from "../../lib/access";
import type { Trip, Segment } from "../../lib/domain";
import { lifecycle, days } from "../../lib/domain";
import {
  budgetSummary,
  type Booking,
  type Task,
  type Allocation,
  type Expense,
} from "../../lib/essentials";
import {
  dashboardDestination,
  nextDashboardEvents,
  dashboardTaskWindow,
} from "../../lib/travel-dashboard";
import { visibleFinding } from "../../lib/trip-check";
import { DashboardRefresh } from "../dashboard-refresh";
type StoredFinding = {
  id: string;
  title: string;
  observation: string;
  uncertainty: string;
  action_view: string;
  priority: string;
  active: boolean;
};
export async function HomeEssentials({ trip }: { trip: Trip }) {
  const { db } = await access(),
    now = new Date(),
    stage = lifecycle(trip.start_date, trip.end_date, trip.timezone, now),
    base = "/trips/" + trip.id;
  const tables = [
    "prep_tasks",
    "bookings",
    "trip_segments",
    "packing_items",
    "budget_allocations",
    "expenses",
    "budget_settings",
    "trip_check_findings",
    "finding_decisions",
    "trip_check_runs",
  ];
  const results = await Promise.all(
    tables.map((table) => {
      if (table === "packing_items")
        return db.from(table).select("id,packed").eq("trip_id", trip.id);
      return db.from(table).select("*").eq("trip_id", trip.id);
    }),
  );
  if (
    results.some(
      (result) =>
        result.error?.code === "42P01" || result.error?.code === "PGRST205",
    )
  )
    return (
      <section className="card">
        <p>
          Some dashboard details need the existing database upgrade. Your trip
          is still available.
        </p>
        <Link href={base}>Open trip ↗</Link>
      </section>
    );
  if (results.some((result) => result.error))
    throw new Error("Could not load the travel dashboard");
  const rows = Object.fromEntries(
    tables.map((table, index) => [table, results[index].data || []]),
  );
  const segments = rows.trip_segments as Segment[],
    bookings = rows.bookings as Booking[],
    tasks = rows.prep_tasks as Task[];
  const destination = dashboardDestination(trip, segments, now),
    taskWindow = dashboardTaskWindow(tasks, destination.timezone, now),
    events = nextDashboardEvents(segments, bookings, now),
    next = events[0],
    unspecified = events.find((event) => event.start === null);
  const todayItems = segments
    .filter(
      (item) =>
        item.status !== "idea" &&
        item.start_date <= destination.today &&
        item.end_date >= destination.today &&
        ["activity", "note", "transport"].includes(item.kind),
    )
    .sort(
      (a, b) =>
        (a.local_time || "99:99").localeCompare(b.local_time || "99:99") ||
        a.position - b.position ||
        a.id.localeCompare(b.id),
    );
  const matchingBookings = bookings.filter(
    (booking) =>
      booking.start_date <= destination.today &&
      booking.end_date >= destination.today,
  );
  const summary = budgetSummary(
    trip.currency,
    trip.budget,
    rows.budget_settings[0]?.include_prepaid ?? true,
    rows.budget_allocations as Allocation[],
    bookings,
    rows.expenses as Expense[],
  );
  const decisions = rows.finding_decisions as {
    finding_id: string;
    decision: string;
    remind_after: string | null;
  }[];
  const findings = (rows.trip_check_findings as StoredFinding[]).filter(
    (finding) =>
      visibleFinding(
        finding.active,
        decisions.find((decision) => decision.finding_id === finding.id),
        now,
      ),
  );
  const run = rows.trip_check_runs[0] as
    { checked_at: string; finding_count: number } | undefined;
  const money = (amount: number) => trip.currency + " " + amount.toFixed(2);
  return (
    <section className="travel-dashboard">
      <div className="section-top">
        <div>
          <h2>
            {stage === "traveling"
              ? "Today, a little more together."
              : stage === "past"
                ? "A chapter worth keeping."
                : "A calmer kind of countdown."}
          </h2>
          <p className="muted">
            Saved-plan snapshot ·{" "}
            {now.toLocaleString("en", { timeZone: destination.timezone })} ·{" "}
            {destination.timezone}
          </p>
        </div>
        <DashboardRefresh />
      </div>
      <div className="grid">
        {stage === "traveling" ? (
          <section className="card lime">
            <span className="eyebrow">Destination local day</span>
            <h3>
              {destination.today}
              {destination.dayNumber > 0
                ? " · Day " + destination.dayNumber
                : ""}
            </h3>
            <p>
              {destination.destination
                ? "For your saved " +
                  destination.destination.title +
                  " destination."
                : "Using your trip’s reference time zone."}
            </p>
            {todayItems.slice(0, 4).map((item) => (
              <p key={item.id}>
                {item.local_time || "Flexible"} · {item.title}
                {item.local_time ? " · " + item.timezone : ""}
              </p>
            ))}
            {!todayItems.length && (
              <p>No activity, note or journey is saved for this local day.</p>
            )}
            {matchingBookings.length > 0 && (
              <p className="muted">
                {matchingBookings.length} saved wallet records cover this date.
              </p>
            )}
            <Link
              className="button secondary"
              href={
                base +
                "?view=itinerary&day=" +
                (days(trip.start_date, trip.end_date).includes(
                  destination.today,
                )
                  ? destination.today
                  : trip.start_date)
              }
            >
              Open this day ↗
            </Link>
          </section>
        ) : stage === "past" ? (
          <section className="card lime">
            <span className="eyebrow">Past trip</span>
            <h3>Your plans and memories stay close.</h3>
            <p>
              The saved itinerary, places, documents and recorded expenses
              remain accessible.
            </p>
            <Link className="button secondary" href={base + "?view=itinerary"}>
              Revisit the itinerary ↗
            </Link>
          </section>
        ) : (
          <section className="card lime">
            <span className="eyebrow">Preparation</span>
            <h3>
              {taskWindow.completed} of {taskWindow.total} tasks complete
            </h3>
            <progress
              aria-label="Preparation progress"
              value={taskWindow.completed}
              max={taskWindow.total || 1}
            />
            <p>
              {taskWindow.open} open tasks.{" "}
              {rows.packing_items.filter((item) => item.packed).length} of{" "}
              {rows.packing_items.length} packing items marked packed.
            </p>
            <div className="actions">
              <Link className="button secondary" href={base + "?view=prep"}>
                Open Prep ↗
              </Link>
              <Link href={base + "?view=packing"}>Open Packing ↗</Link>
            </div>
          </section>
        )}
        {stage !== "past" && (
          <section className="card">
            <span className="eyebrow">
              {next?.start !== null
                ? "Next saved timed event"
                : "Next saved date"}
            </span>
            <h3>{next ? next.title : "Your schedule has a little space."}</h3>
            {next ? (
              <>
                <p>
                  {next.state === "underway"
                    ? "Saved time window underway"
                    : next.state === "time needed"
                      ? next.time
                        ? "Saved time needs checking"
                        : "Time not entered"
                      : "Upcoming saved start"}
                </p>
                <p>
                  {next.day} {next.time} · {next.timezone}
                </p>
                <span className="pill">{next.status}</span>
                <p>
                  <Link
                    href={
                      base +
                      (next.source === "booking"
                        ? "?view=bookings"
                        : "?view=itinerary&day=" + next.day)
                    }
                  >
                    Open saved details ↗
                  </Link>
                </p>
              </>
            ) : (
              <p>
                No future timed event or date-only booking is saved. Existing
                plans remain in the itinerary and wallet.
              </p>
            )}
            {unspecified && unspecified.id !== next?.id && (
              <p className="muted">
                Also saved with a time to check: {unspecified.title} ·{" "}
                {unspecified.day} · {unspecified.timezone}.{" "}
                <Link
                  href={
                    base +
                    (unspecified.source === "booking"
                      ? "?view=bookings"
                      : "?view=itinerary&day=" + unspecified.day)
                  }
                >
                  Review details ↗
                </Link>
              </p>
            )}
            <p className="muted">
              Based on your saved local times. No provider status is checked.
            </p>
          </section>
        )}
        <section className="card">
          <span className="eyebrow">Budget overview · {trip.currency}</span>
          <h3>
            {trip.budget === null
              ? "No total target set"
              : money(trip.budget) + " target"}
          </h3>
          <p>Planned remaining costs: {money(summary.planned)}</p>
          <p>
            Recorded prepaid: {money(summary.prepaid)} ·{" "}
            {(rows.budget_settings[0]?.include_prepaid ?? true)
              ? "included in target"
              : "outside target"}
          </p>
          <p>
            Unallocated target:{" "}
            {summary.unallocated === null
              ? "Not set"
              : money(summary.unallocated)}
          </p>
          <p>
            {summary.actual === null
              ? "Actual spending: Not tracked."
              : "Actual spending: manually recorded only."}
          </p>
          {summary.actual &&
            Object.entries(summary.actual).map(([currency, amount]) => (
              <p key={currency}>
                {currency} {amount.toFixed(2)}
              </p>
            ))}
          <Link href={base + "?view=budget"}>Open Budget ↗</Link>
        </section>
      </div>
      {stage !== "past" && (
        <div className="grid">
          <section className="card">
            <span className="eyebrow">In-app reminders</span>
            <h3>
              {taskWindow.due.length
                ? taskWindow.due.length +
                  " open tasks due by " +
                  taskWindow.horizon
                : "No dated tasks due in the next week."}
            </h3>
            {taskWindow.due.slice(0, 4).map((task) => (
              <p key={task.id}>
                {task.title} · due {task.due_date}
                {String(task.due_date) < taskWindow.today
                  ? " · review when convenient"
                  : ""}
              </p>
            ))}
            <Link href={base + "?view=prep"}>Review Prep ↗</Link>
          </section>
          <section className="card">
            <span className="eyebrow">Saved Trip Check</span>
            <h3>
              {run
                ? findings.length + " saved findings to review"
                : "A second look, when you’re ready."}
            </h3>
            {findings.slice(0, 3).map((finding) => (
              <p key={finding.id}>
                <Link href={base + "?view=" + finding.action_view}>
                  {finding.title} ↗
                </Link>
              </p>
            ))}
            <p className="muted">
              {run
                ? "Last run " +
                  new Date(run.checked_at).toLocaleString("en", {
                    timeZone: destination.timezone,
                  }) +
                  ". Rerun after changing plans."
                : "No Trip Check has been run for this trip."}
            </p>
            <Link href={base + "?view=check"}>
              {run ? "Open Trip Check ↗" : "Check my trip ↗"}
            </Link>
          </section>
        </div>
      )}
      {stage === "traveling" && (
        <div className="actions">
          <Link
            className="button secondary"
            href={
              base +
              "?view=map&day=" +
              destination.today +
              "&search=" +
              encodeURIComponent(
                destination.destination
                  ? "Things to do in " + destination.destination.title
                  : "",
              )
            }
          >
            {destination.destination
              ? "Explore " + destination.destination.title
              : "Open Map"}{" "}
            ↗
          </Link>
          <Link
            className="button secondary"
            href={base + "?view=budget#expense"}
          >
            ＋ Record an expense
          </Link>
          <Link href={base + "?view=offline"}>Manage offline copy ↗</Link>
        </div>
      )}
    </section>
  );
}
