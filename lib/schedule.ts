import { Temporal } from "@js-temporal/polyfill";
import type { Segment } from "./domain";
import type { Booking } from "./essentials";
export type TimedRecord = {
  id: string;
  source: "segment" | "booking";
  linkedId: string | null;
  title: string;
  day: string;
  time: string;
  zone: string;
  start: number;
  end: number;
};
export type ScheduleConflict = {
  first: TimedRecord;
  second: TimedRecord;
  minutes: number;
};
export function localInstant(day: string, time: string, zone: string) {
  return Temporal.ZonedDateTime.from(`${day}T${time}[${zone}]`, {
    disambiguation: "reject",
  }).epochMilliseconds;
}
export function savedSchedule(segments: Segment[], bookings: Booking[]) {
  const records: TimedRecord[] = [],
    uncertain: {
      id: string;
      title: string;
      source: "segment" | "booking";
      reason: string;
      evidence: (string | number | null | undefined)[];
    }[] = [];
  for (const segment of segments) {
    if (
      segment.status === "idea" ||
      !["activity", "transport"].includes(segment.kind) ||
      !segment.local_time
    )
      continue;
    const hasEnd =
      segment.kind === "transport" &&
      segment.arrival_time &&
      segment.arrival_timezone;
    if (!segment.duration_minutes && !hasEnd) continue;
    try {
      const start = localInstant(
        segment.start_date,
        segment.local_time,
        segment.timezone,
      );
      const end = hasEnd
        ? localInstant(
            segment.end_date,
            segment.arrival_time,
            segment.arrival_timezone,
          )
        : start + Number(segment.duration_minutes) * 60000;
      if (end <= start) {
        uncertain.push({
          id: segment.id,
          title: segment.title,
          source: "segment",
          evidence: [
            segment.start_date,
            segment.end_date,
            segment.local_time,
            segment.timezone,
            segment.arrival_time,
            segment.arrival_timezone,
            segment.duration_minutes,
          ],
          reason:
            "The saved arrival is not later than departure after converting the saved local time zones.",
        });
        continue;
      }
      records.push({
        id: segment.id,
        source: "segment",
        linkedId: null,
        title: segment.title,
        day: segment.start_date,
        time: segment.local_time,
        zone: segment.timezone,
        start,
        end,
      });
    } catch {
      uncertain.push({
        id: segment.id,
        title: segment.title,
        source: "segment",
        evidence: [
          segment.start_date,
          segment.end_date,
          segment.local_time,
          segment.timezone,
          segment.arrival_time,
          segment.arrival_timezone,
          segment.duration_minutes,
        ],
        reason:
          "A saved local time is ambiguous or unavailable, for example during a daylight-saving clock change.",
      });
    }
  }
  for (const booking of bookings) {
    if (
      !["flight", "ferry", "ground transport", "activity"].includes(
        booking.category,
      ) ||
      !booking.local_time ||
      !booking.end_local_time ||
      !booking.end_timezone
    )
      continue;
    try {
      const start = localInstant(
          booking.start_date,
          booking.local_time,
          booking.timezone,
        ),
        end = localInstant(
          booking.end_date,
          booking.end_local_time,
          booking.end_timezone,
        );
      if (end <= start) {
        uncertain.push({
          id: booking.id,
          title: booking.title,
          source: "booking",
          evidence: [
            booking.start_date,
            booking.end_date,
            booking.local_time,
            booking.timezone,
            booking.end_local_time,
            booking.end_timezone,
          ],
          reason:
            "The saved end time is not later than the start after converting the saved local time zones.",
        });
        continue;
      }
      records.push({
        id: booking.id,
        source: "booking",
        linkedId: booking.segment_id,
        title: booking.title,
        day: booking.start_date,
        time: booking.local_time,
        zone: booking.timezone,
        start,
        end,
      });
    } catch {
      uncertain.push({
        id: booking.id,
        title: booking.title,
        source: "booking",
        evidence: [
          booking.start_date,
          booking.end_date,
          booking.local_time,
          booking.timezone,
          booking.end_local_time,
          booking.end_timezone,
        ],
        reason:
          "A saved local time is ambiguous or unavailable, for example during a daylight-saving clock change.",
      });
    }
  }
  // A wallet record and its exact itinerary copy represent the same interval.
  const unique = records.filter(
    (record) =>
      record.source !== "segment" ||
      !records.some(
        (other) =>
          other.source === "booking" &&
          other.linkedId === record.id &&
          other.start === record.start &&
          other.end === record.end,
      ),
  );
  unique.sort(
    (a, b) =>
      a.start - b.start ||
      a.source.localeCompare(b.source) ||
      a.id.localeCompare(b.id),
  );
  const conflicts: ScheduleConflict[] = [];
  for (let i = 0; i < unique.length; i++)
    for (
      let j = i + 1;
      j < unique.length && unique[j].start < unique[i].end;
      j++
    ) {
      const first = unique[i],
        second = unique[j];
      if (first.linkedId === second.id || second.linkedId === first.id)
        continue;
      const minutes = Math.ceil(
        (Math.min(first.end, second.end) -
          Math.max(first.start, second.start)) /
          60000,
      );
      if (minutes > 0) conflicts.push({ first, second, minutes });
      if (conflicts.length >= 100)
        return { records: unique, conflicts, uncertain };
    }
  return { records: unique, conflicts, uncertain };
}
export function linkedDateDifferences(
  segments: Segment[],
  bookings: Booking[],
) {
  return bookings.flatMap((booking) => {
    const item = segments.find(
      (segment) =>
        segment.id === booking.segment_id && segment.status !== "idea",
    );
    return item &&
      (item.start_date !== booking.start_date ||
        item.end_date !== booking.end_date)
      ? [{ segment: item, booking }]
      : [];
  });
}
