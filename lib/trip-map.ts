import type { Segment } from "./domain";
import type { Booking } from "./essentials";
import type { PlaceResult } from "./discovery-types";
export type SavedPlace = {
  id: string;
  title: string;
  notes: string;
  category: string;
  source: "city" | "google";
  location_id: string | null;
  latitude: number | null;
  longitude: number | null;
  google_place_id: string | null;
};
// Only shared location/display fields cross the server-to-browser boundary.
export const mapBookingColumns =
  "id,title,category,start_date,end_date,verification,location_id,location_label,latitude,longitude,end_location_id,end_location_label,end_latitude,end_longitude";
export type MapBooking = Pick<
  Booking,
  | "id"
  | "title"
  | "category"
  | "start_date"
  | "end_date"
  | "verification"
  | "location_id"
  | "location_label"
  | "latitude"
  | "longitude"
  | "end_location_id"
  | "end_location_label"
  | "end_latitude"
  | "end_longitude"
>;
export const mapKinds = [
  "destination",
  "stay",
  "transport",
  "activity",
  "note",
  "idea",
  "saved",
] as const;
export type MapKind = (typeof mapKinds)[number];
export const mapKindLabels: Record<MapKind, string> = {
  destination: "Destinations",
  stay: "Stays",
  transport: "Transportation",
  activity: "Activities",
  note: "Notes",
  idea: "Unscheduled ideas",
  saved: "Saved places",
};
export type MapPoint = { latitude: number; longitude: number };
export type TripMapEntry = {
  id: string;
  source: "segment" | "booking" | "saved";
  recordId: string;
  kind: MapKind;
  title: string;
  state: string;
  role: "location" | "departure" | "arrival";
  start: string | null;
  end: string | null;
  locationLabel: string;
  point: MapPoint | null;
  precision: "city" | "place" | "unknown";
  placeId: string | null;
  mapsUrl: string | null;
  href: string | null;
  category?: string;
};
function point(latitude: unknown, longitude: unknown): MapPoint | null {
  return typeof latitude === "number" &&
    Number.isFinite(latitude) &&
    Math.abs(latitude) <= 90 &&
    typeof longitude === "number" &&
    Number.isFinite(longitude) &&
    Math.abs(longitude) <= 180
    ? { latitude, longitude }
    : null;
}
function location(
  input: {
    cityId?: string | null;
    label?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    placeId?: string | null;
    query?: string;
  },
  details: Record<string, PlaceResult>,
) {
  const fresh = input.placeId ? details[input.placeId] : null;
  const currentPoint =
    fresh && fresh.id === input.placeId
      ? point(fresh.latitude, fresh.longitude)
      : null;
  const cityPoint = input.cityId
    ? point(input.latitude, input.longitude)
    : null;
  const coordinates = currentPoint || cityPoint;
  const mapsUrl = input.placeId
    ? "https://www.google.com/maps/search/?api=1&query=" +
      encodeURIComponent(input.query || "Place") +
      "&query_place_id=" +
      encodeURIComponent(input.placeId)
    : coordinates
      ? `https://www.google.com/maps/search/?api=1&query=${coordinates.latitude},${coordinates.longitude}`
      : input.query
        ? "https://www.google.com/maps/search/?api=1&query=" +
          encodeURIComponent(input.query)
        : null;
  return {
    point: coordinates,
    precision: currentPoint
      ? ("place" as const)
      : cityPoint
        ? ("city" as const)
        : ("unknown" as const),
    placeId: input.placeId || null,
    mapsUrl,
    locationLabel: currentPoint
      ? fresh!.name
      : input.label || "Location not entered",
  };
}
export function tripMapEntries(
  tripId: string,
  segments: Segment[],
  bookings: MapBooking[],
  places: SavedPlace[],
  details: Record<string, PlaceResult> = {},
): TripMapEntry[] {
  const base = "/trips/" + encodeURIComponent(tripId);
  const entries: TripMapEntry[] = [];
  for (const s of segments) {
    // Explicit scope also protects callers that accidentally pass mixed-trip input.
    if (s.trip_id !== tripId) continue;
    const kind: MapKind =
      s.status === "idea"
        ? "idea"
        : mapKinds.includes(s.kind as MapKind)
          ? (s.kind as MapKind)
          : "note";
    const journey = s.kind === "transport";
    const common = {
      source: "segment" as const,
      recordId: s.id,
      kind,
      title: s.title,
      state: s.status,
      start: s.status === "idea" ? null : s.start_date,
      end: s.status === "idea" ? null : journey ? s.start_date : s.end_date,
      href:
        base +
        (s.status === "idea"
          ? "?view=ideas"
          : "?view=itinerary&day=" + encodeURIComponent(s.start_date)),
    };
    entries.push({
      ...common,
      id: "segment:" + s.id + ":start",
      role: journey ? "departure" : "location",
      ...location(
        {
          cityId: s.location_id,
          label: s.location_label,
          latitude: s.latitude,
          longitude: s.longitude,
          placeId: s.google_place_id,
          query: s.address || s.origin || (s.google_place_id ? s.title : ""),
        },
        details,
      ),
    });
    if (
      journey &&
      (s.arrival_location_id || s.arrival_location_label || s.arrival_location)
    )
      entries.push({
        ...common,
        id: "segment:" + s.id + ":end",
        role: "arrival",
        start: s.status === "idea" ? null : s.end_date,
        end: s.status === "idea" ? null : s.end_date,
        href:
          s.status === "idea"
            ? common.href
            : base + "?view=itinerary&day=" + encodeURIComponent(s.end_date),
        ...location(
          {
            cityId: s.arrival_location_id,
            label: s.arrival_location_label,
            latitude: s.arrival_latitude,
            longitude: s.arrival_longitude,
            query: s.arrival_location,
          },
          details,
        ),
      });
  }
  for (const b of bookings) {
    const journey = [
      "flight",
      "ground transport",
      "ferry",
      "car rental",
    ].includes(b.category);
    const common = {
      source: "booking" as const,
      recordId: b.id,
      kind:
        b.category === "accommodation"
          ? ("stay" as const)
          : journey
            ? ("transport" as const)
            : ("activity" as const),
      title: b.title,
      state: "Booking · " + b.verification,
      href: base + "?view=bookings&edit=" + encodeURIComponent(b.id),
    };
    entries.push({
      ...common,
      id: "booking:" + b.id + ":start",
      role: journey ? "departure" : "location",
      start: b.start_date,
      end: journey ? b.start_date : b.end_date,
      ...location(
        {
          cityId: b.location_id,
          label: b.location_label,
          latitude: b.latitude,
          longitude: b.longitude,
        },
        details,
      ),
    });
    if (journey && (b.end_location_id || b.end_location_label))
      entries.push({
        ...common,
        id: "booking:" + b.id + ":end",
        role: "arrival",
        start: b.end_date,
        end: b.end_date,
        ...location(
          {
            cityId: b.end_location_id,
            label: b.end_location_label,
            latitude: b.end_latitude,
            longitude: b.end_longitude,
          },
          details,
        ),
      });
  }
  for (const p of places)
    entries.push({
      id: "saved:" + p.id,
      source: "saved",
      recordId: p.id,
      kind: "saved",
      title: p.title,
      state: "Saved place",
      role: "location",
      start: null,
      end: null,
      href: null,
      category: p.category,
      ...location(
        {
          cityId: p.source === "city" ? p.location_id : null,
          label: p.source === "city" ? p.title : null,
          latitude: p.latitude,
          longitude: p.longitude,
          placeId: p.google_place_id,
          query: p.google_place_id ? p.title : "",
        },
        details,
      ),
    });
  return entries;
}
export function filterMapEntries(
  entries: TripMapEntry[],
  filter: {
    kind: string;
    day: string;
    includeUndated: boolean;
    category: string;
  },
) {
  return entries.filter(
    (e) =>
      (filter.kind === "all" || e.kind === filter.kind) &&
      (e.source !== "saved" ||
        filter.category === "all" ||
        e.category === filter.category) &&
      (!filter.day ||
        (!e.start || !e.end
          ? filter.includeUndated
          : e.start <= filter.day && e.end >= filter.day)),
  );
}
