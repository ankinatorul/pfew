import type { Trip, Segment } from "./domain";
import type { Booking } from "./essentials";
export type MapPoint = {
  id: string;
  title: string;
  category:
    "destination" | "stay" | "activity" | "food" | "transport" | "other";
  coordinates: [number, number] | null;
  order?: number;
  orderKey?: string;
  destinationId?: string | null;
  locationId?: string | null;
  start?: string;
  end?: string;
  href: string;
};
export type SavedMapPlace = {
  id: string;
  title: string;
  category: string;
  latitude: number | null;
  longitude: number | null;
  location_id?: string | null;
};
export type MapSegment = Segment & {
  arrival_latitude?: number | null;
  arrival_longitude?: number | null;
  destination_location_id?: string | null;
};
export type TripMapData = {
  tripId: string;
  tripName: string;
  destinations: MapPoint[];
  places: MapPoint[];
  unavailable: string[];
  orderAmbiguous?: boolean;
};
export function coordinates(
  latitude: unknown,
  longitude: unknown,
): [number, number] | null {
  return typeof latitude === "number" &&
    typeof longitude === "number" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
    ? [longitude, latitude]
    : null;
}
export function orderedDestinationSegments(segments: Segment[]) {
  const stops = segments.filter(
    (s) => s.kind === "destination" && s.status !== "idea",
  );
  // Explicit positions win; legacy equal/default positions fall back to dates.
  return [...stops].sort(
    (a, b) =>
      a.position - b.position ||
      a.start_date.localeCompare(b.start_date) ||
      a.id.localeCompare(b.id),
  );
}
export function mapSavedDestinations(trip: Trip) {
  const raw = trip.draft_data?.destinations;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((value, index) => {
    if (
      !value ||
      typeof value !== "object" ||
      typeof value.label !== "string" ||
      !value.label.trim()
    )
      return [];
    return [
      {
        id: typeof value.id === "string" ? value.id : null,
        label:
          typeof value.title === "string" && value.title.trim()
            ? value.title
            : value.label,
        start:
          typeof value.start_date === "string" ? value.start_date : undefined,
        end: typeof value.end_date === "string" ? value.end_date : undefined,
        position:
          typeof value.position === "number" && Number.isInteger(value.position)
            ? value.position
            : undefined,
        index,
        coordinates: coordinates(value.latitude, value.longitude),
      },
    ];
  });
}
export function tripMapData(
  trip: Trip,
  segments: MapSegment[],
  bookings: Booking[],
  saved: SavedMapPlace[],
  unavailable: string[] = [],
): TripMapData {
  const base = `/trips/${trip.id}`,
    dated = orderedDestinationSegments(segments),
    locations = mapSavedDestinations(trip);
  const destinations: MapPoint[] = dated.length
    ? dated.map((s, i) => ({
        id: s.id,
        title: s.title,
        category: "destination",
        coordinates:
          coordinates(s.latitude, s.longitude) ||
          locations.find((l) => l.id === s.location_id)?.coordinates ||
          null,
        orderKey: s.id,
        order: i + 1,
        locationId: s.location_id,
        start: s.start_date,
        end: s.end_date,
        href: base + "?view=destinations&edit=" + s.id,
      }))
    : locations.map((l, i) => ({
        id: `saved:${l.id}:${i}`,
        title: l.label,
        category: "destination",
        coordinates: l.coordinates,
        orderKey: String(l.index),
        start: l.start,
        end: l.end,
        order: i + 1,
        locationId: l.id,
        href: base + "?view=destinations&edit=saved:" + l.index,
      }));
  const unplaced = dated.length
    ? locations.filter((l) => !dated.some((s) => s.location_id === l.id))
    : [];
  for (const l of unplaced)
    destinations.push({
      id: `unplaced:${l.index}`,
      title: l.label,
      category: "destination",
      coordinates: l.coordinates,
      locationId: l.id,
      href: base + "?view=destinations&edit=saved:" + l.index,
    });
  const rankedMixed =
    unplaced.length > 0 && unplaced.every((l) => l.position !== undefined);
  if (rankedMixed) {
    const positions = new Map([
      ...dated.map((s) => [s.id, s.position] as const),
      ...unplaced.map((l) => [`unplaced:${l.index}`, l.position!] as const),
    ]);
    destinations.sort(
      (a, b) => (positions.get(a.id) || 0) - (positions.get(b.id) || 0),
    );
    destinations.forEach((d, i) => {
      d.order = i + 1;
    });
  }
  const category = (c: string): MapPoint["category"] =>
    c === "accommodation" || c === "stay"
      ? "stay"
      : c === "activity"
        ? "activity"
        : c === "food"
          ? "food"
          : [
                "flight",
                "ground transport",
                "ferry",
                "car rental",
                "transport",
              ].includes(c)
            ? "transport"
            : "other";
  const places: MapPoint[] = [];
  const bookingsBySegment = new Map(
    bookings.filter((b) => b.segment_id).map((b) => [b.segment_id, b]),
  );
  const segmentsById = new Map(segments.map((s) => [s.id, s]));
  for (const s of segments.filter((s) => s.kind !== "destination")) {
    const linked = bookingsBySegment.get(s.id),
      point = coordinates(s.latitude, s.longitude);
    if (
      linked &&
      (!point ||
        (s.location_id && s.location_id === linked.location_id) ||
        (point[0] === linked.longitude && point[1] === linked.latitude))
    )
      continue;
    places.push({
      id: `segment:${s.id}`,
      title: s.title,
      category: category(s.kind),
      coordinates: coordinates(s.latitude, s.longitude),
      destinationId: s.destination_id,
      locationId: s.destination_location_id,
      start: s.start_date,
      end: s.end_date,
      href: base + "?view=itinerary&day=" + s.start_date,
    });
    if (
      s.kind === "transport" &&
      coordinates(s.arrival_latitude, s.arrival_longitude)
    )
      places.push({
        id: `arrival:${s.id}`,
        title: s.arrival_location || s.title + " · arrival",
        category: "transport",
        coordinates: coordinates(s.arrival_latitude, s.arrival_longitude),
        destinationId: s.destination_id,
        start: s.end_date,
        href: base + "?view=transport",
      });
  }
  for (const b of bookings) {
    const linkedSegment = b.segment_id
      ? segmentsById.get(b.segment_id)
      : undefined;
    places.push({
      id: `booking:${b.id}`,
      title: b.title,
      category: category(b.category),
      coordinates: coordinates(b.latitude, b.longitude),
      destinationId: linkedSegment?.destination_id,
      locationId: linkedSegment?.destination_location_id,
      start: b.start_date,
      end: b.end_date,
      href: base + "?view=bookings&edit=" + b.id,
    });
    if (
      category(b.category) === "transport" &&
      coordinates(b.end_latitude, b.end_longitude)
    )
      places.push({
        id: `end:${b.id}`,
        title: b.destination || b.title + " · arrival",
        category: "transport",
        coordinates: coordinates(b.end_latitude, b.end_longitude),
        start: b.end_date,
        href: base + "?view=bookings&edit=" + b.id,
      });
  }
  for (const p of saved)
    places.push({
      id: `place:${p.id}`,
      title: p.title,
      category: category(p.category),
      coordinates: coordinates(p.latitude, p.longitude),
      locationId: p.location_id,
      href: base + "?view=places",
    });
  return {
    tripId: trip.id,
    tripName: trip.name,
    destinations,
    places,
    unavailable,
    orderAmbiguous: unplaced.length > 0 && !rankedMixed,
  };
}
// Only explicit stored links establish destination membership. Never assign a
// hotel to a destination just because it is nearby or shares a travel date.
export function associatedPlaces(destination: MapPoint, places: MapPoint[]) {
  return places.filter(
    (p) =>
      p.destinationId === destination.id ||
      (!!destination.locationId && p.locationId === destination.locationId),
  );
}
// Unwrap consecutive longitudes to take the short connection at the date line.
export function unwrap(points: [number, number][]) {
  let previous: number | undefined,
    offset = 0;
  return points.map(([lng, lat]) => {
    if (previous !== undefined) {
      const delta = lng - previous;
      if (delta > 180) offset -= 360;
      else if (delta < -180) offset += 360;
    }
    previous = lng;
    return [lng + offset, lat] as [number, number];
  });
}
export function mapBounds(
  points: [number, number][],
): [[number, number], [number, number]] | null {
  if (!points.length) return null;
  const lngs = points.map((p) => (p[0] + 360) % 360).sort((a, b) => a - b);
  let gap = -1,
    start = lngs[0];
  for (let i = 0; i < lngs.length; i++) {
    const next =
      lngs[(i + 1) % lngs.length] + (i === lngs.length - 1 ? 360 : 0);
    if (next - lngs[i] > gap) {
      gap = next - lngs[i];
      start = next % 360;
    }
  }
  const lats = points.map((p) => p[1]);
  return [
    [start, Math.min(...lats)],
    [start + 360 - gap, Math.max(...lats)],
  ];
}
export function mapGeoJSON(
  destinations: MapPoint[],
  places: MapPoint[],
  connect = true,
) {
  const pointFeatures = (points: MapPoint[]) =>
    points
      .filter((p) => p.coordinates)
      .map((p) => ({
        type: "Feature" as const,
        id: p.id,
        properties: {
          id: p.id,
          title: p.title,
          category: p.category,
          order: p.order || "",
        },
        geometry: { type: "Point" as const, coordinates: p.coordinates! },
      }));
  // Missing intermediate locations break a line rather than imply a direct leg.
  const lines: {
    type: "Feature";
    properties: Record<string, never>;
    geometry: { type: "LineString"; coordinates: [number, number][] };
  }[] = [];
  if (connect)
    for (let i = 1; i < destinations.length; i++) {
      const a = destinations[i - 1].coordinates,
        b = destinations[i].coordinates;
      if (
        a &&
        b &&
        destinations[i - 1].order !== undefined &&
        destinations[i].order !== undefined
      )
        lines.push({
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: unwrap([a, b]) },
        });
    }
  return {
    destinations: {
      type: "FeatureCollection" as const,
      features: pointFeatures(destinations),
    },
    places: {
      type: "FeatureCollection" as const,
      features: pointFeatures(places),
    },
    route: { type: "FeatureCollection" as const, features: lines },
  };
}
