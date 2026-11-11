import type { Trip, Segment } from "./domain";
import type { Booking } from "./essentials";
import { dashboardDestination } from "./travel-dashboard";
import { localInstant, savedSchedule } from "./schedule";
import { Temporal } from "@js-temporal/polyfill";

export type TodayPlanItem = {
  id: string;
  source: "booking" | "segment";
  title: string;
  status: string;
  confirmed: boolean;
  time: string;
  savedTime: string;
  arrival: string;
  timeUncertain: boolean;
  start: number | null;
  day: string;
  location: string;
  provider: string;
  reference: string;
  spansToday: boolean;
  linkedDay?: string;
  linkedStatus?: string;
  linkedMismatch: boolean;
};

// Today's list includes earlier plans as well as future ones, unlike the
// existing "next event" helper. Reuse saved instants/intervals for chronology.
export function duringTripPlan(
  trip: Trip,
  segments: Segment[],
  bookings: Booking[] | null,
  now: Date,
) {
  const context = dashboardDestination(
    trip,
    segments.filter((item) => {
      if (item.kind !== "destination") return true;
      try {
        new Intl.DateTimeFormat("en", { timeZone: item.timezone });
        return true;
      } catch {
        return false;
      }
    }),
    now,
  );
  const calendarDay = Temporal.PlainDate.from(context.today);
  // Calendar day boundaries also handle 23/25-hour days and skipped midnight.
  const windowStart = calendarDay.toZonedDateTime(
    context.timezone,
  ).epochMilliseconds;
  const windowEnd = calendarDay
    .add({ days: 1 })
    .toZonedDateTime(context.timezone).epochMilliseconds;
  const schedule = savedSchedule(segments, bookings || []);
  const clock = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: context.timezone,
  });
  const records: TodayPlanItem[] = [];
  function collect(item: Booking | Segment, source: "booking" | "segment") {
    const booking = source === "booking" ? (item as Booking) : null;
    const segment = source === "segment" ? (item as Segment) : null;
    const linked = booking?.segment_id
      ? segments.find(
          (record) =>
            record.id === booking.segment_id && record.status !== "idea",
        )
      : undefined;
    let start: number | null = null;
    if (item.local_time) {
      try {
        start = localInstant(item.start_date, item.local_time, item.timezone);
      } catch {
        /* A clock change or invalid saved zone/time needs review. */
      }
    }
    const interval =
      schedule.records.find(
        (record) => record.source === source && record.id === item.id,
      ) ||
      (segment
        ? schedule.records.find(
            (record) =>
              record.source === "booking" &&
              record.linkedId === segment.id &&
              record.start === start,
          )
        : undefined);
    const spansDates =
      item.start_date < item.end_date &&
      item.start_date <= context.today &&
      item.end_date >= context.today;
    const inWindow =
      start !== null && start >= windowStart && start < windowEnd;
    const overlapsWindow =
      !!interval && interval.start < windowEnd && interval.end > windowStart;
    // Multi-day records without a reliable interval are date context, not a
    // claim about opening hours, occupancy, or whether an activity is underway.
    if (!(
      inWindow ||
      overlapsWindow ||
      (!interval && spansDates) ||
      (start === null &&
        item.start_date <= context.today &&
        item.end_date >= context.today)
    ))
      return;
    const sameTime =
      linked &&
      start !== null &&
      (() => {
        try {
          return (
            localInstant(
              linked.start_date,
              linked.local_time,
              linked.timezone,
            ) === start
          );
        } catch {
          return false;
        }
      })();
    const linkedMismatch =
      !!linked &&
      (linked.start_date !== item.start_date ||
        linked.end_date !== item.end_date ||
        (linked.local_time || item.local_time
          ? !sameTime
          : linked.timezone !== item.timezone));
    const location = booking
      ? [booking.origin, booking.destination].filter(Boolean).join(" → ") ||
        booking.location_label ||
        linked?.location_label ||
        linked?.address ||
        ""
      : segment!.kind === "transport"
        ? [segment!.origin, segment!.arrival_location]
            .filter(Boolean)
            .join(" → ") ||
          segment!.location_label ||
          segment!.address
        : segment!.location_label || segment!.address;
    records.push({
      id: item.id,
      source,
      title: item.title,
      status: booking
        ? booking.reservation_status === "confirmed"
          ? "Confirmed reservation"
          : `Booking · status ${booking.reservation_status || "unknown"}`
        : segment!.status === "confirmed"
          ? "Confirmed plan"
          : `Planned ${segment!.kind}`,
      confirmed: booking
        ? booking.reservation_status === "confirmed"
        : segment!.status === "confirmed",
      time: inWindow
        ? clock.format(new Date(start!))
        : start !== null
          ? "Spans today"
          : item.local_time
            ? "Time needs checking"
            : "Time not set",
      savedTime: item.local_time
        ? `${item.start_date} · ${item.local_time} ${item.timezone}`
        : "",
      arrival: booking?.end_local_time
        ? `${booking.end_date} · ${booking.end_local_time} ${booking.end_timezone || "timezone not saved"}`
        : segment?.arrival_time
          ? `${segment.end_date} · ${segment.arrival_time} ${segment.arrival_timezone || "timezone not saved"}`
          : "",
      timeUncertain: !!item.local_time && start === null,
      start,
      day: item.start_date,
      location: location || "",
      provider: item.provider,
      reference: item.reference,
      spansToday: spansDates || (overlapsWindow && !inWindow),
      linkedDay: linked?.start_date,
      linkedStatus: linked?.status,
      linkedMismatch,
    });
  }
  for (const item of bookings || []) collect(item, "booking");
  for (const item of segments) {
    if (
      item.status !== "idea" &&
      ["activity", "note", "transport", "stay"].includes(item.kind)
    )
      collect(item, "segment");
  }
  const linkedIds = new Set(
    (bookings || [])
      .filter((booking) =>
        records.some(
          (record) => record.source === "booking" && record.id === booking.id,
        ),
      )
      .map((booking) => booking.segment_id),
  );
  const items = records
    .filter((item) => item.source !== "segment" || !linkedIds.has(item.id))
    .sort(
      (a, b) =>
        (a.start ?? Infinity) - (b.start ?? Infinity) ||
        a.title.localeCompare(b.title) ||
        a.id.localeCompare(b.id),
    );
  const ideas = context.destination
    ? segments
        .filter(
          (item) =>
            item.status === "idea" &&
            item.kind !== "destination" &&
            item.destination_id === context.destination!.id,
        )
        .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
        .slice(0, 2)
        .map((item) => ({ id: item.id, title: item.title }))
    : [];
  return {
    day: context.today,
    dateLabel: new Intl.DateTimeFormat("en", {
      dateStyle: "full",
      timeZone: "UTC",
    }).format(new Date(context.today + "T12:00:00Z")),
    timezone: context.timezone,
    destination: context.destination?.title || null,
    dayNumber: context.dayNumber > 0 ? context.dayNumber : null,
    items,
    bookingsAvailable: bookings !== null,
    ideas,
  };
}
export type DuringTripPlan = ReturnType<typeof duringTripPlan>;
