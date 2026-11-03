import { resolveLocation } from "./locations";
import type { Segment, Trip } from "./domain";
export function dayPlanValues(
  item: Segment,
  trip: Pick<Trip, "start_date" | "end_date" | "timezone">,
  destinations: Segment[],
  input: { day: string; local_time: string; duration_minutes: number | null },
) {
  if (
    !["activity", "note"].includes(item.kind) ||
    item.start_date !== item.end_date ||
    item.status === "idea"
  )
    throw new Error(
      "Use the detailed form for journeys, stays, multi-day items or unscheduled ideas.",
    );
  if (input.day < trip.start_date || input.day > trip.end_date)
    throw new Error("Choose a day within this trip.");
  const destination = destinationOnDay(
    destinations,
    input.day,
    item.destination_id,
  );
  const location = item.location_id ? resolveLocation(item.location_id) : null;
  if (item.location_id && !location)
    throw new Error(
      "This item’s city is unavailable. Choose its city again in the detailed form.",
    );
  return {
    start_date: input.day,
    end_date: input.day,
    local_time: input.local_time,
    duration_minutes: item.kind === "note" ? null : input.duration_minutes,
    destination_id: destination?.id || null,
    timezone:
      location?.timezone ||
      destination?.timezone ||
      item.timezone ||
      trip.timezone,
    status:
      item.status === "confirmed" &&
      (item.start_date !== input.day || item.local_time !== input.local_time)
        ? "planned"
        : item.status,
  };
}

export function destinationOnDay(
  destinations: Segment[],
  day: string,
  preferredId: string | null,
) {
  const covering = destinations.filter(
    (destination) =>
      destination.kind === "destination" &&
      destination.status !== "idea" &&
      destination.start_date <= day &&
      destination.end_date >= day,
  );
  return (
    covering.find((destination) => destination.id === preferredId) ||
    [...covering].sort(
      (a, b) =>
        b.start_date.localeCompare(a.start_date) ||
        a.position - b.position ||
        a.id.localeCompare(b.id),
    )[0]
  );
}
