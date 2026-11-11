import type { Trip, Segment } from "../lib/domain";
import { access } from "../lib/access";
import { loadBookingCollection } from "../lib/booking-collection-server";
import { BookingCollectionClient } from "./booking-collection-client";
export async function PendingBookingCollection({
  trip,
  segments,
}: {
  trip: Trip;
  segments: Segment[];
}) {
  const { db, user } = await access();
  if (trip.owner_id !== user.id) return null;
  const collection = await loadBookingCollection(db, trip.id);
  // Older projects retain the original Bookings screen before migration 012.
  if (!collection.ready || !collection.entries.length) return null;
  return (
    <BookingCollectionClient
      key={trip.id}
      trip={trip}
      segments={segments}
      initialEntries={collection.entries}
      initialAttachments={collection.attachments}
      stepMode={false}
      live={process.env.AI_MODE === "live" && Boolean(process.env.AI_API_KEY)}
    />
  );
}
