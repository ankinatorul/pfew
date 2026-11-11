import Link from "next/link";
import { access } from "../../lib/access";
import { lifecycle, type Trip, type Segment } from "../../lib/domain";
import type { Booking, Task } from "../../lib/essentials";
import { homeSummary } from "../../lib/home-summary";
import { HomeEssentialsView } from "../home-view";

export async function HomeEssentials({ trip }: { trip: Trip }) {
  const now = new Date();
  const stage = lifecycle(trip.start_date, trip.end_date, trip.timezone, now);
  if (trip.creation_state === "draft" || stage === "past" || stage === "unknown") return null;

  const { db, user } = await access();
  const tables = ["prep_tasks", "bookings", "trip_segments"] as const;
  const [results, packing, documents] = await Promise.all([
    Promise.all(
      tables.map((table) => db.from(table).select("*").eq("trip_id", trip.id)),
    ),
    db.from("packing_items").select("packed").eq("trip_id", trip.id),
    // Count only the current uploader's states; no filenames, paths or file data.
    db
      .from("booking_attachments")
      .select("state")
      .eq("trip_id", trip.id)
      .eq("owner_id", user.id),
  ]);
  if (results.some((result) => result.error))
    return (
      <p className="muted home-notice">
        Your trip summary is unavailable right now.{" "}
        <Link href={"/trips/" + trip.id}>Open your trip</Link> to continue
        planning.
      </p>
    );

  const summary = homeSummary(
    trip,
    {
      tasks: (results[0].data || []) as Task[],
      bookings: (results[1].data || []) as Booking[],
      segments: (results[2].data || []) as Segment[],
      packing: packing.error ? null : packing.data || [],
      documents: documents.error ? null : documents.data || [],
    },
    now,
  );
  return (
    <HomeEssentialsView
      summary={summary}
      traveling={stage === "traveling"}
      LinkComponent={Link}
    />
  );
}
