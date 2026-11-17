import type { Trip, Segment } from "./domain";
import { tripMapData, orderedDestinationSegments } from "./trip-map";
export type DestinationEntry = {
  id: string;
  key: string;
  source: "saved" | "segment";
  title: string;
  context: string;
  locationId: string;
  locationLabel: string;
  start: string;
  end: string;
  notes: string;
  revision: number;
  order: number;
};
export function destinationEntries(
  trip: Trip,
  segments: Segment[],
): DestinationEntry[] {
  const raw = Array.isArray(trip.draft_data?.destinations)
    ? trip.draft_data.destinations
    : [];
  return tripMapData(trip, segments, [], []).destinations.map((p, i) => {
    const segment = segments.find((s) => s.id === p.id),
      index = segment
        ? -1
        : Number(p.id.startsWith("unplaced:") ? p.id.slice(9) : p.orderKey);
    const saved =
      index >= 0 ? raw[index] : raw.find((d) => d?.id === segment?.location_id);
    return {
      id: p.id,
      key: segment ? segment.id : String(index),
      source: segment ? "segment" : "saved",
      title: p.title,
      context: typeof saved?.country === "string" ? saved.country : "",
      locationId: segment?.location_id || saved?.id || "",
      locationLabel: segment?.location_label || saved?.label || "",
      start: segment?.start_date || saved?.start_date || "",
      end: segment?.end_date || saved?.end_date || "",
      notes: segment?.notes || saved?.notes || "",
      revision: segment?.itinerary_revision || 0,
      order: i + 1,
    };
  });
}
export function destinationOrder(
  trip: Trip,
  segments: Segment[],
  mixed = false,
) {
  const data = tripMapData(trip, segments, [], []),
    stops = orderedDestinationSegments(segments);
  if (typeof trip.trip_revision !== "number" || (data.orderAmbiguous && !mixed))
    return undefined;
  return {
    revision: trip.trip_revision,
    ids: data.destinations.map((p) =>
      stops.some((s) => s.id === p.id)
        ? p.id
        : stops.length
          ? `saved:${p.id.startsWith("unplaced:") ? p.id.slice(9) : p.orderKey}`
          : p.orderKey || "",
    ),
    segments: stops.map((s) => ({
      id: s.id,
      revision: s.itinerary_revision || 0,
    })),
  };
}
