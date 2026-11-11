import { z } from "zod";

// Ideas still require a dated segment in the existing model. Never substitute
// an end date, today's date, or a fabricated start for a legacy missing start.
export function savedIdeaDate(trip: {
  start_date: string | null;
  end_date: string | null;
}) {
  if (!z.iso.date().safeParse(trip.start_date).success) return null;
  if (
    !z.iso.date().safeParse(trip.end_date).success ||
    trip.end_date! < trip.start_date!
  )
    return null;
  return trip.start_date;
}
export const missingIdeaDateMessage =
  "Add valid departure and return dates in Edit trip before saving this idea. Your suggestion or saved place is still saved; return after updating your trip.";
