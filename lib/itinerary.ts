import { Temporal } from "@js-temporal/polyfill";
import { z } from "zod";
import type { Trip, Segment } from "./domain";
import type { Booking } from "./essentials";
import { savedTripDestinations } from "./trip-destinations";
import { savedSchedule, linkedDateDifferences, localInstant } from "./schedule";
import { travelStyleLabel } from "./trip-style";
export const activityCategories = [
  "Sightseeing",
  "Food & Drink",
  "Adventure",
  "Relaxation",
  "Shopping",
  "Transportation",
  "Other",
] as const;
export type ItineraryActivity = Segment & {
  itinerary_revision?: number;
  activity_category?: string | null;
  completed_at?: string | null;
  destination_location_id?: string | null;
};
export type ItineraryIdea = {
  id: string;
  title: string;
  note: string;
  category: string;
  source: "ai" | "mock";
  dismissed: boolean;
  accepted_segment_id: string | null;
  context?: {
    day?: string;
    destination?: string;
    destination_id?: string;
    request_id?: string;
  };
};
export const activityInput = z
  .object({
    id: z.uuid(),
    revision: z.number().int().nonnegative(),
    title: z.string().trim().min(1, "Give your activity a name.").max(200),
    day: z.iso.date(),
    start: z.union([
      z.literal(""),
      z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    ]),
    end: z.union([
      z.literal(""),
      z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    ]),
    location: z.string().trim().max(500),
    notes: z.string().max(4000),
    category: z.union([z.literal(""), z.enum(activityCategories)]),
    destination: z.string().max(2048),
  })
  .refine((v) => !v.end || (!!v.start && v.end > v.start), {
    message: "Choose an end time after the start time, on the same day.",
    path: ["end"],
  });
export type ActivityInput = z.infer<typeof activityInput>;
export type ItineraryCommand =
  | { op: "save"; input: ActivityInput }
  | { op: "delete" | "complete"; id: string; revision: number }
  | { op: "reorder"; day: string; order: { id: string; revision: number }[] }
  | {
      op: "add-idea" | "dismiss-idea";
      id: string;
      day: string;
      destination: string;
    }
  | { op: "unlink"; id: string; segment: string };
export type ItineraryResult = { error?: string; id?: string; message?: string };
export function dateRange(
  trip: Pick<Trip, "start_date" | "end_date">,
  selected?: string,
) {
  try {
    if (
      !/^\d{4}-\d\d-\d\d$/.test(trip.start_date) ||
      !/^\d{4}-\d\d-\d\d$/.test(trip.end_date)
    )
      return null;
    const first = Temporal.PlainDate.from(trip.start_date),
      last = Temporal.PlainDate.from(trip.end_date);
    const count = first.until(last).days + 1;
    if (count < 1) return null;
    let day = first;
    try {
      const requested = Temporal.PlainDate.from(selected || trip.start_date);
      if (
        Temporal.PlainDate.compare(requested, first) >= 0 &&
        Temporal.PlainDate.compare(requested, last) <= 0
      )
        day = requested;
    } catch {}
    const index = first.until(day).days,
      offset = Math.max(0, Math.min(index - 3, count - 7));
    return {
      day: day.toString(),
      index,
      count,
      days: Array.from({ length: Math.min(7, count) }, (_, n) => ({
        day: first.add({ days: offset + n }).toString(),
        number: offset + n + 1,
      })),
      previous: index ? day.subtract({ days: 1 }).toString() : null,
      next: index < count - 1 ? day.add({ days: 1 }).toString() : null,
    };
  } catch {
    return null;
  }
}
export function itineraryDestinations(trip: Trip, segments: Segment[]) {
  const saved = savedTripDestinations(trip).map((d) => ({
    id: d.id,
    label: d.label,
    timezone: d.timezone,
    start: "",
    end: "",
  }));
  const dated = segments
    .filter((s) => s.kind === "destination" && s.status !== "idea")
    .map((s) => ({
      id: s.id,
      label: s.title,
      timezone: s.timezone,
      start: s.start_date,
      end: s.end_date,
    }));
  return [
    ...saved,
    ...dated.filter(
      (d) =>
        !saved.some((s) => s.label.toLowerCase() === d.label.toLowerCase()),
    ),
  ];
}
export function destinationForDay(
  trip: Trip,
  segments: Segment[],
  day: string,
) {
  const dated = segments.filter(
    (s) =>
      s.kind === "destination" &&
      s.status !== "idea" &&
      s.start_date <= day &&
      s.end_date >= day,
  );
  return dated.length === 1
    ? { id: dated[0].id, label: dated[0].title, timezone: dated[0].timezone }
    : null;
}
export function activityValues(
  input: ActivityInput,
  trip: Trip,
  segments: Segment[],
) {
  const v = activityInput.parse(input);
  if (!dateRange(trip) || v.day < trip.start_date || v.day > trip.end_date)
    throw new Error("Choose a day within your trip dates.");
  const destination = v.destination
    ? itineraryDestinations(trip, segments).find((d) => d.id === v.destination)
    : null;
  if (v.destination && !destination)
    throw new Error("Choose a saved destination from this trip.");
  // A blank association stays unallocated; never assume the first destination.
  const zone = destination?.timezone || trip.timezone;
  if (v.start) localInstant(v.day, v.start, zone);
  if (v.end) localInstant(v.day, v.end, zone);
  return {
    ...v,
    timezone: zone,
    duration_minutes: v.end
      ? (localInstant(v.day, v.end, zone) -
          localInstant(v.day, v.start, zone)) /
        60000
      : null,
  };
}
export function activityEnd(item: ItineraryActivity) {
  if (!item.local_time || !item.duration_minutes) return "";
  try {
    const start = Temporal.ZonedDateTime.from(
      `${item.start_date}T${item.local_time}[${item.timezone}]`,
      { disambiguation: "reject" },
    );
    const end = start.add({ minutes: item.duration_minutes });
    return end.toPlainDate().equals(start.toPlainDate())
      ? end.toPlainTime().toString({ smallestUnit: "minute" })
      : "";
  } catch {
    return "";
  }
}
export function dailyItinerary(
  trip: Trip,
  segments: ItineraryActivity[],
  bookings: Booking[],
  day: string,
) {
  const activities = segments.filter(
    (s) =>
      s.kind !== "destination" &&
      s.status !== "idea" &&
      s.start_date <= day &&
      s.end_date >= day,
  );
  const timed = activities
    .filter((s) => s.local_time && s.start_date === day)
    .sort(
      (a, b) =>
        a.local_time.localeCompare(b.local_time) ||
        a.position - b.position ||
        a.id.localeCompare(b.id),
    );
  const untimed = activities
    .filter((s) => !s.local_time || s.start_date !== day)
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  const relevant = bookings.filter(
    (b) =>
      /^\d{4}-\d\d-\d\d$/.test(b.start_date) &&
      b.start_date <= day &&
      b.end_date >= day,
  );
  const standalone = relevant.filter(
    (b) => !activities.some((s) => s.id === b.segment_id),
  );
  const schedule = savedSchedule(
    segments,
    bookings.filter((b) => b.reservation_status !== "cancelled"),
  );
  const warnings = schedule.conflicts
    .filter((c) => c.first.day === day || c.second.day === day)
    .map(
      (c) =>
        `${c.first.title} and ${c.second.title} overlap by ${c.minutes} minutes.`,
    );
  for (const difference of linkedDateDifferences(segments, relevant))
    warnings.push(
      `${difference.booking.title}: the booking and linked plan have different saved dates. Check Bookings.`,
    );
  if (activities.length >= 6)
    warnings.push(
      `${activities.length} planned items today. You may want to leave some breathing room.`,
    );
  if (
    segments.some(
      (s) =>
        s.status !== "idea" &&
        (s.start_date < trip.start_date || s.end_date > trip.end_date),
    )
  )
    warnings.push(
      "Some saved plans are outside the current trip dates. Review all plans before moving them.",
    );
  const gaps: { minutes: number; after: string; before: string }[] = [];
  const records = schedule.records.filter((r) => r.day === day);
  let end = records[0];
  for (const next of records.slice(1)) {
    if (end && next.start > end.end)
      gaps.push({
        minutes: Math.floor((next.start - end.end) / 60000),
        after: end.title,
        before: next.title,
      });
    if (!end || next.end > end.end) end = next;
  }
  return {
    timed,
    untimed,
    standalone,
    relevant,
    warnings,
    gaps,
    uncertain: schedule.uncertain.filter(
      (u) =>
        activities.some((a) => a.id === u.id) ||
        relevant.some((b) => b.id === u.id),
    ),
    undatedBookings: bookings.filter(
      (b) => !/^\d{4}-\d\d-\d\d$/.test(b.start_date),
    ).length,
  };
}
export function itineraryAIContext(
  trip: Trip,
  segments: Segment[],
  bookings: Booking[],
  day: string,
  destination: string,
  request: string,
) {
  const choices = itineraryDestinations(trip, segments),
    choice = choices.find((d) => d.id === destination);
  if (destination && !choice)
    throw new Error("Choose a destination from this trip.");
  if (!dateRange(trip) || day < trip.start_date || day > trip.end_date)
    throw new Error("Choose a day within your trip dates.");
  return {
    tripName: trip.name,
    destination:
      choice?.label ||
      choices.map((d) => d.label).join(" → ") ||
      "Destination not supplied",
    style: travelStyleLabel(trip.style),
    currency: trip.currency,
    budget: trip.budget,
    travelers: trip.travelers,
    days: dateRange(trip)!.count,
    request,
    selectedDay: day,
    travelDates: { start: trip.start_date, end: trip.end_date },
    destinationAllocation: choice
      ? "User-selected context; not a dated stop allocation"
      : "No stop allocation supplied",
    activities: segments
      .filter(
        (s) => s.status !== "idea" && s.start_date <= day && s.end_date >= day,
      )
      .slice(0, 30)
      .map((s) => ({
        title: s.title,
        time: s.local_time || null,
        notes: s.notes.slice(0, 150),
      })),
    bookings: bookings
      .filter((b) => b.start_date <= day && b.end_date >= day)
      .slice(0, 20)
      .map((b) => ({
        title: b.title,
        category: b.category,
        time: b.local_time || null,
        review: b.verification,
        reservation: b.reservation_status || "unknown",
      })),
  };
}
