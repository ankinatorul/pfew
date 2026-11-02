import Link from "next/link";
import { access } from "../../lib/access";
import type { Booking } from "../../lib/essentials";
export async function DayBookings({
  trip,
  day,
}: {
  trip: string;
  day: string;
}) {
  const { db } = await access();
  const { data, error } = await db
    .from("bookings")
    .select("*")
    .eq("trip_id", trip)
    .lte("start_date", day)
    .gte("end_date", day)
    .order("local_time");
  if (error?.code === "PGRST205" || error?.code === "42P01") return null;
  if (error) throw new Error("Could not load day bookings");
  if (!data?.length) return null;
  return (
    <section className="card">
      <span className="eyebrow">Saved bookings for this day</span>
      {(data as Booking[]).map((b) => (
        <p key={b.id}>
          <Link href={"/trips/" + trip + "?view=bookings&edit=" + b.id}>
            {b.local_time || "Time not entered"} · {b.title} · {b.verification}{" "}
            ↗
          </Link>
        </p>
      ))}
      <p className="muted">
        Saved booking information is shown as entered; linked itinerary plans
        keep their own confirmation state.
      </p>
    </section>
  );
}
