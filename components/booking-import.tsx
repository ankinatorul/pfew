import type { Trip, Segment } from "../lib/domain";
/** Compatibility entry point; all user-facing editing lives on Bookings. */
export function BookingImport({
  trip,
}: {
  trip: Trip;
  segments: Segment[];
  live: boolean;
}) {
  return (
    <a className="button primary" href={`/trips/${trip.id}?view=bookings`}>
      Open your bookings
    </a>
  );
}
