import Link from "next/link";
import { access } from "../lib/access";
import type { Segment } from "../lib/domain";
import type { Booking } from "../lib/essentials";
import { savedSchedule } from "../lib/schedule";
export async function DayOverview({
  tripId,
  segments,
  day,
}: {
  tripId: string;
  segments: Segment[];
  day: string;
}) {
  const { db } = await access(),
    { data, error } = await db
      .from("bookings")
      .select("*")
      .eq("trip_id", tripId);
  if (error) throw new Error("Could not load saved schedule");
  const today = segments.filter(
    (item) =>
      item.status !== "idea" &&
      item.start_date === day &&
      ["activity", "note"].includes(item.kind),
  );
  const schedule = savedSchedule(segments, (data || []) as Booking[]),
    conflicts = schedule.conflicts.filter(
      (conflict) => conflict.first.day === day || conflict.second.day === day,
    ),
    uncertain = schedule.uncertain.filter(
      (item) =>
        segments.some(
          (segment) => segment.id === item.id && segment.start_date === day,
        ) ||
        (data || []).some(
          (booking) => booking.id === item.id && booking.start_date === day,
        ),
    );
  const duration = today
    .filter((item) => item.kind === "activity")
    .reduce((sum, item) => sum + (item.duration_minutes || 0), 0);
  return (
    <section className="card">
      <h3>Your day at a glance.</h3>
      <p>
        {today.filter((item) => item.local_time).length} timed activities or
        notes · {today.filter((item) => !item.local_time).length} flexible
        activities or notes · {duration} minutes of saved activity durations
      </p>
      <p className="muted">
        Durations may overlap. Travel time and unsaved plans are not estimated.
      </p>
      {conflicts.length > 0 && (
        <>
          <h3>Saved times may overlap</h3>
          {conflicts.slice(0, 8).map((conflict) => (
            <p
              key={
                conflict.first.source + conflict.first.id + conflict.second.id
              }
            >
              {conflict.first.title} and {conflict.second.title}:{" "}
              {conflict.minutes} minutes of overlap after converting their saved
              time zones. This may be intentional for different travelers.
            </p>
          ))}
        </>
      )}
      {uncertain.length > 0 && (
        <p className="muted">
          {uncertain.length} saved time
          {uncertain.length === 1 ? " needs" : "s need"} checking before
          reliable overlap calculations are possible.
        </p>
      )}
      {(conflicts.length > 0 || uncertain.length > 0) && (
        <Link href={"/trips/" + tripId + "?view=check"}>
          Run Trip Check for details ↗
        </Link>
      )}
    </section>
  );
}
