import { savedSchedule, linkedDateDifferences } from "./schedule";
import { createHash } from "node:crypto";
import { days, type Trip, type Segment } from "./domain";
import type { Booking, Task } from "./essentials";
export type Finding = {
  fingerprint: string;
  kind: string;
  priority: "info" | "attention";
  title: string;
  observation: string;
  uncertainty: string;
  action_view:
    | "itinerary"
    | "destinations"
    | "stays"
    | "transport"
    | "bookings"
    | "prep"
    | "budget";
};
export function checkTrip(
  trip: Trip,
  segments: Segment[],
  bookings: Booking[],
  tasks: Task[],
): Finding[] {
  const findings: Finding[] = [];
  const add = (
    kind: string,
    evidence: unknown,
    title: string,
    observation: string,
    action_view: Finding["action_view"],
    priority: Finding["priority"] = "info",
    uncertainty = "This describes information saved in Pfew. You may already have arrangements outside the app.",
  ) =>
    findings.push({
      fingerprint: createHash("sha256")
        .update(JSON.stringify([kind, evidence]))
        .digest("hex"),
      kind,
      priority,
      title,
      observation,
      action_view,
      uncertainty,
    });
  const stays = segments.filter(
    (s) => s.kind === "stay" && s.status !== "idea",
  );
  const lodging = bookings.filter(
    (b) =>
      b.category === "accommodation" &&
      !stays.some((s) => s.id === b.segment_id),
  );
  const gaps = days(trip.start_date, trip.end_date)
    .slice(0, -1)
    .filter(
      (day) =>
        ![...stays, ...lodging].some(
          (s) => s.start_date <= day && s.end_date > day,
        ),
    );
  if (gaps.length)
    add(
      "stay_gap",
      gaps,
      "Some nights have no stay information",
      `No stay is saved for ${gaps.slice(0, 8).join(", ")}${gaps.length > 8 ? ` and ${gaps.length - 8} other nights` : ""}. Add information if it would be useful.`,
      "stays",
      "attention",
    );
  const destinations = segments
    .filter((s) => s.kind === "destination" && s.status !== "idea")
    .sort(
      (a, b) =>
        a.start_date.localeCompare(b.start_date) || a.position - b.position,
    );
  for (let i = 1; i < destinations.length; i++) {
    const before = destinations[i - 1],
      after = destinations[i];
    if (before.location_id && before.location_id === after.location_id)
      continue;
    const hasLeg =
      segments.some(
        (s) =>
          s.kind === "transport" &&
          s.status !== "idea" &&
          s.start_date <= after.start_date &&
          s.end_date >= before.end_date,
      ) ||
      bookings.some(
        (b) =>
          ["flight", "ferry", "ground transport", "car rental"].includes(
            b.category,
          ) &&
          b.start_date <= after.start_date &&
          b.end_date >= before.end_date,
      );
    if (!hasLeg)
      add(
        "transport_gap",
        [before.id, after.id, before.end_date, after.start_date],
        "A journey has no transport information",
        `There is no saved transport between ${before.title} and ${after.title} around ${after.start_date}.`,
        "transport",
      );
  }
  for (const booking of bookings) {
    const missing = [
      !booking.provider ? "provider" : "",
      !booking.reference ? "reference" : "",
      !booking.local_time ? "start time" : "",
    ].filter(Boolean);
    if (missing.length)
      add(
        "booking_details",
        [booking.id, missing],
        `${booking.title}: details to keep handy`,
        `Not entered: ${missing.join(", ")}. Missing details do not mean the reservation is invalid.`,
        "bookings",
      );
  }
  const reservations = [
    ...stays.map((s) => ({
      id: s.id,
      title: s.title,
      start_date: s.start_date,
      end_date: s.end_date,
    })),
    ...lodging,
  ];
  for (let i = 0; i < reservations.length; i++)
    for (let j = i + 1; j < reservations.length; j++) {
      const a = reservations[i],
        b = reservations[j];
      if (a.start_date < b.end_date && b.start_date < a.end_date)
        add(
          "stay_overlap",
          [a.id, b.id, a.start_date, a.end_date, b.start_date, b.end_date],
          "Two stays may overlap",
          `${a.title} and ${b.title} share at least one night. This may be intentional for different travelers.`,
          "stays",
          "attention",
        );
    }
  const schedule = savedSchedule(segments, bookings);
  for (const conflict of schedule.conflicts) {
    const records = [conflict.first, conflict.second];
    add(
      "time_overlap",
      records
        .map((item) => [item.source, item.id, item.start, item.end])
        .sort(),
      "Saved times may overlap",
      `${conflict.first.title} (${conflict.first.day} ${conflict.first.time} ${conflict.first.zone}) and ${conflict.second.title} (${conflict.second.day} ${conflict.second.time} ${conflict.second.zone}) overlap by ${conflict.minutes} minutes in your saved schedule.`,
      "itinerary",
      "attention",
      "This may be intentional for different travelers. Only saved times and durations are compared; no travel time or provider availability has been verified.",
    );
  }
  for (const item of schedule.uncertain) {
    add(
      "time_uncertain",
      [item.source, item.id, item.evidence],
      `${item.title}: check the saved time`,
      item.reason,
      item.source === "booking" ? "bookings" : "itinerary",
      "info",
      "Check the local times against your source. No overlap or reservation validity conclusion is possible from this record.",
    );
  }
  for (const pair of linkedDateDifferences(segments, bookings)) {
    add(
      "linked_dates",
      [
        pair.segment.id,
        pair.booking.id,
        pair.segment.start_date,
        pair.segment.end_date,
        pair.booking.start_date,
        pair.booking.end_date,
      ],
      "A plan and its linked booking have different dates",
      `${pair.segment.title} is dated ${pair.segment.start_date} → ${pair.segment.end_date}; ${pair.booking.title} is dated ${pair.booking.start_date} → ${pair.booking.end_date}.`,
      "bookings",
      "attention",
      "The records may cover different parts of the same arrangement. Review the source; moving a plan does not change a reservation.",
    );
  }
  const due = tasks.filter(
    (t) => !t.done && t.due_date && t.due_date <= trip.start_date,
  );
  if (due.length)
    add(
      "prep_open",
      due.map((t) => [t.id, t.due_date]).sort(),
      "Preparation tasks are still open",
      `${due.length} unfinished task${due.length === 1 ? " is" : "s are"} due by departure. Review your checklist when convenient.`,
      "prep",
    );
  return findings.slice(0, 200);
}
export function visibleFinding(
  active: boolean,
  decision?: { decision: string; remind_after?: string | null },
  now = new Date(),
) {
  if (!active) return false;
  if (!decision) return true;
  return (
    decision.decision === "remind_later" &&
    Boolean(decision.remind_after) &&
    new Date(decision.remind_after!) <= now
  );
}
