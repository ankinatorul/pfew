import type { Segment, Trip } from "./domain";
import type { Booking } from "./essentials";
export const journeyBookingColumns =
  "id,segment_id,title,category,start_date,end_date,location_id,end_location_id,local_time,end_local_time,verification";
export type JourneyBooking = Pick<
  Booking,
  | "id"
  | "segment_id"
  | "title"
  | "category"
  | "start_date"
  | "end_date"
  | "location_id"
> &
  Partial<
    Pick<
      Booking,
      "end_location_id" | "local_time" | "end_local_time" | "verification"
    >
  >;
export function calendarNights(start: string, end: string) {
  return Math.max(
    0,
    Math.round(
      (Date.parse(end + "T00:00:00Z") - Date.parse(start + "T00:00:00Z")) /
        86400000,
    ),
  );
}
export function friendlyDate(day: string, year = false) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    ...(year ? { year: "numeric" } : {}),
    timeZone: "UTC",
  }).format(new Date(day + "T12:00:00Z"));
}
export function friendlyDateRange(start: string, end: string) {
  if (start === end) return friendlyDate(start, true);
  if (start.slice(0, 7) === end.slice(0, 7))
    return String(Number(start.slice(8))) + "–" + friendlyDate(end, true);
  return (
    friendlyDate(start, start.slice(0, 4) !== end.slice(0, 4)) +
    " – " +
    friendlyDate(end, true)
  );
}
export type JourneyStop = {
  destination: Segment;
  nights: number;
  dates: string;
  stays: number;
  activities: number;
  ideas: number;
};
export type JourneyLeg = Pick<
  Segment,
  | "id"
  | "title"
  | "start_date"
  | "end_date"
  | "local_time"
  | "arrival_time"
  | "location_id"
  | "arrival_location_id"
  | "destination_id"
  | "transport_mode"
  | "status"
> & { source: "segment" | "booking"; bookingId?: string };
export type JourneyConnection = {
  before: string;
  after: string;
  legs: { segment: JourneyLeg; match: "cities" | "dates" }[];
};
export type Journey = {
  stops: JourneyStop[];
  connections: JourneyConnection[];
  otherTransport: JourneyLeg[];
  ideaCount: number;
  nights: number;
};
export function buildJourney(
  trip: Trip,
  allSegments: Segment[],
  bookings: JourneyBooking[],
): Journey {
  const segments = allSegments.filter((s) => s.trip_id === trip.id);
  const destinations = segments
    .filter((s) => s.kind === "destination" && s.status !== "idea")
    .sort(
      (a, b) =>
        a.start_date.localeCompare(b.start_date) ||
        a.position - b.position ||
        a.id.localeCompare(b.id),
    );
  function belongs(
    record: {
      start_date: string;
      end_date: string;
      location_id?: string | null;
      destination_id?: string | null;
      status?: string;
    },
    destination: Segment,
  ) {
    if (record.destination_id) return record.destination_id === destination.id;
    if (record.status === "idea")
      return (
        !!record.location_id && record.location_id === destination.location_id
      );
    const overlaps = (d: Segment) =>
      record.start_date <= d.end_date && record.end_date >= d.start_date;
    if (record.location_id)
      return (
        record.location_id === destination.location_id && overlaps(destination)
      );
    const candidates = destinations.filter(overlaps);
    return candidates.length === 1 && candidates[0].id === destination.id;
  }
  const stops = destinations.map((destination) => {
    const scoped = segments.filter(
      (s) => s.id !== destination.id && belongs(s, destination),
    );
    const stays = scoped.filter(
      (s) => s.kind === "stay" && s.status !== "idea",
    );
    const lodging = bookings.filter(
      (b) =>
        b.category === "accommodation" &&
        !stays.some((s) => s.id === b.segment_id) &&
        belongs(
          {
            ...b,
            destination_id:
              b.segment_id === destination.id
                ? destination.id
                : segments.find((s) => s.id === b.segment_id)?.destination_id,
          },
          destination,
        ),
    );
    return {
      destination,
      nights: calendarNights(destination.start_date, destination.end_date),
      dates: friendlyDateRange(destination.start_date, destination.end_date),
      stays: stays.length + lodging.length,
      activities:
        scoped.filter((s) => s.kind === "activity" && s.status !== "idea")
          .length +
        bookings.filter(
          (b) =>
            b.category === "activity" &&
            !scoped.some((s) => s.id === b.segment_id && s.status !== "idea") &&
            belongs(
              {
                ...b,
                destination_id:
                  b.segment_id === destination.id
                    ? destination.id
                    : segments.find((s) => s.id === b.segment_id)
                        ?.destination_id,
              },
              destination,
            ),
        ).length,
      ideas: scoped.filter((s) => s.status === "idea").length,
    };
  });
  const savedTransport = segments.filter(
    (s) => s.kind === "transport" && s.status !== "idea",
  );
  const transport: JourneyLeg[] = [
    ...savedTransport.map((s) => ({ ...s, source: "segment" as const })),
    ...bookings
      .filter(
        (b) =>
          ["flight", "ground transport", "ferry", "car rental"].includes(
            b.category,
          ) && !savedTransport.some((s) => s.id === b.segment_id),
      )
      .map((b) => ({
        id: "booking:" + b.id,
        bookingId: b.id,
        source: "booking" as const,
        title: b.title,
        start_date: b.start_date,
        end_date: b.end_date,
        local_time: b.local_time || "",
        arrival_time: b.end_local_time || "",
        location_id: b.location_id,
        arrival_location_id: b.end_location_id,
        destination_id: destinations.some((d) => d.id === b.segment_id)
          ? b.segment_id
          : segments.find((s) => s.id === b.segment_id)?.destination_id || null,
        transport_mode:
          b.category === "flight"
            ? "flight"
            : b.category === "ferry"
              ? "ferry"
              : b.category === "car rental"
                ? "rental car"
                : "other",
        status:
          b.verification === "user confirmed"
            ? "User-confirmed booking"
            : "Unverified booking",
      })),
  ];
  const used = new Set<string>();
  const connections = destinations.slice(1).map((after, index) => {
    const before = destinations[index];
    const legs = transport.flatMap((segment) => {
      if (used.has(segment.id)) return [];
      const cities =
        !!before.location_id &&
        !!after.location_id &&
        segment.location_id === before.location_id &&
        segment.arrival_location_id === after.location_id;
      const dates =
        segment.start_date <= after.start_date &&
        segment.end_date >= before.end_date &&
        segment.start_date >= before.start_date &&
        segment.end_date <= after.end_date;
      if (
        !dates ||
        (!cities &&
          segment.destination_id !== before.id &&
          segment.destination_id !== after.id)
      )
        return [];
      used.add(segment.id);
      return [
        { segment, match: cities ? ("cities" as const) : ("dates" as const) },
      ];
    });
    return { before: before.id, after: after.id, legs };
  });
  return {
    stops,
    connections,
    otherTransport: transport.filter((s) => !used.has(s.id)),
    ideaCount: segments.filter((s) => s.status === "idea").length,
    nights: calendarNights(trip.start_date, trip.end_date),
  };
}
// A destination period is context, not a daily activity repeated on every date.
export function isDailyEntry(segment: Segment, day: string) {
  return (
    segment.kind !== "destination" &&
    segment.status !== "idea" &&
    segment.start_date <= day &&
    segment.end_date >= day
  );
}
