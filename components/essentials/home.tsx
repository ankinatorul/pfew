import Link from "next/link";
import { access } from "../../lib/access";
import type { Trip, Segment } from "../../lib/domain";
import { lifecycle } from "../../lib/domain";
import { localToday, type Booking, type Task } from "../../lib/essentials";
export async function HomeEssentials({ trip }: { trip: Trip }) {
  const { db } = await access();
  const today = localToday(trip.timezone);
  const traveling =
    lifecycle(trip.start_date, trip.end_date, trip.timezone) === "traveling";
  const [
    { data: tasks, error: tasksError },
    { data: bookings, error: bookingsError },
    { data: segments, error: segmentsError },
  ] = await Promise.all([
    db
      .from("prep_tasks")
      .select("*")
      .eq("trip_id", trip.id)
      .eq("done", false)
      .order("due_date"),
    db
      .from("bookings")
      .select("*")
      .eq("trip_id", trip.id)
      .gte("end_date", today)
      .order("start_date")
      .order("local_time")
      .limit(5),
    db
      .from("trip_segments")
      .select("*")
      .eq("trip_id", trip.id)
      .neq("status", "idea")
      .lte("start_date", today)
      .gte("end_date", today)
      .order("local_time")
      .order("position"),
  ]);
  if (tasksError?.code === "PGRST205" || bookingsError?.code === "PGRST205")
    return (
      <p className="muted">
        Apply Phase 2 migrations to enable your travel essentials.
      </p>
    );
  if (tasksError || bookingsError || segmentsError)
    throw new Error("Could not load trip overview");
  const due = (tasks as Task[]).filter(
    (t) => t.due_date && t.due_date <= today,
  );
  const next = (bookings as Booking[])[0];
  const base = "/trips/" + trip.id;
  return (
    <>
      <div className="section-top">
        <h2>
          {traveling
            ? "Today, a little more together."
            : "A little preparation goes a long way."}
        </h2>
        <Link href={base + "?view=budget"}>Open budget ↗</Link>
      </div>
      <div className="grid">
        <section className="card lime">
          <span className="eyebrow">
            {traveling ? "Today’s itinerary" : "Preparation"}
          </span>
          <h3>{traveling ? today : `${tasks?.length || 0} open tasks`}</h3>
          {traveling ? (
            (segments as Segment[]).slice(0, 5).map((s) => (
              <p key={s.id}>
                {s.local_time || "Flexible"} · {s.title}
              </p>
            ))
          ) : (
            <p>Give your future self a little less to think about.</p>
          )}
          <Link
            className="button secondary"
            href={
              base + (traveling ? "?view=itinerary&day=" + today : "?view=prep")
            }
          >
            {traveling ? "Open today" : "Open Prep"}
          </Link>
        </section>
        <section className="card">
          <span className="eyebrow">Saved travel wallet</span>
          <h3>{next ? next.title : "No upcoming booking saved"}</h3>
          <p>
            {next
              ? `${next.start_date} ${next.local_time} · ${next.timezone}`
              : "Add only the reservations you actually have."}
          </p>
          <Link href={base + "?view=bookings"}>Open bookings ↗</Link>
        </section>
        <section className="card">
          <span className="eyebrow">In-app reminders</span>
          <h3>
            {due.length
              ? `${due.length} ready for your attention`
              : "A little breathing room."}
          </h3>
          {due.slice(0, 3).map((t) => (
            <p key={t.id}>
              {t.title} · due {t.due_date}
            </p>
          ))}
          {!due.length && <p>No incomplete tasks are due today.</p>}
          <Link href={base + "?view=prep"}>Review preparations ↗</Link>
        </section>
      </div>
      {traveling && (
        <Link className="button secondary" href={base + "?view=budget#expense"}>
          ＋ Record an expense
        </Link>
      )}
    </>
  );
}
