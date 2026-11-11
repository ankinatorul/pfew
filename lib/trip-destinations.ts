import { resolvedLocationSchema } from "./location-types";
import type { Trip } from "./domain";
// Ordered, saved destinations are not fabricated dated itinerary segments.
export function savedTripDestinations(trip: Trip) {
  const parsed = resolvedLocationSchema
    .array()
    .safeParse(trip.draft_data?.destinations);
  return parsed.success ? parsed.data : [];
}
