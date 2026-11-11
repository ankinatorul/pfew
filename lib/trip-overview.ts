import { savedTripDestinations } from "./trip-destinations";
import { z } from "zod";
import {
  lifecycle,
  days,
  departureCountdown,
  type Trip,
  type Segment,
} from "./domain";
import {
  budgetSummary,
  type Booking,
  type Task,
  type Allocation,
  type Expense,
} from "./essentials";
import { normalizedTitle, prepStarter } from "./readiness";
import { checkTrip, visibleFinding } from "./trip-check";
import { duringTripPlan } from "./during-trip";

type SavedFinding = { id: string; fingerprint: string };
type Decision = {
  finding_id: string;
  decision: string;
  remind_after: string | null;
};
export type TripOverviewData = {
  bookings: Booking[] | null;
  tasks: Task[] | null;
  packingLists: { id: string }[] | null;
  packingItems: { packed: boolean }[] | null;
  documents: { state: string }[] | null;
  allocations: Allocation[] | null;
  expenses: Expense[] | null;
  includePrepaid: boolean | null;
  findings: SavedFinding[] | null;
  decisions: Decision[] | null;
};
export type OverviewSuggestion = {
  key: string;
  title: string;
  detail: string;
  uncertainty: string;
  view: string;
  findingId?: string;
};
const validDate = (value: string) => z.iso.date().safeParse(value).success;

export function tripOverviewPhase(
  trip: Trip,
  now: Date,
): "upcoming" | "traveling" | "past" | "unknown" {
  return trip.creation_state === "draft"
    ? "unknown"
    : lifecycle(trip.start_date, trip.end_date, trip.timezone, now);
}

function datesFor(trip: Trip, now: Date) {
  const start = validDate(trip.start_date) ? trip.start_date : null;
  const end = validDate(trip.end_date) ? trip.end_date : null;
  const ordered = Boolean(start && end && end >= start);
  const format = new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeZone: "UTC",
  });
  const label = ordered
    ? format.formatRange(
        new Date(start! + "T12:00:00Z"),
        new Date(end! + "T12:00:00Z"),
      )
    : start && end
      ? "Review the saved date range"
      : start
        ? `From ${format.format(new Date(start + "T12:00:00Z"))} · return date not saved`
        : end
          ? `Until ${format.format(new Date(end + "T12:00:00Z"))} · departure date not saved`
          : "Travel dates not saved";
  return {
    label,
    day: start || undefined,
    duration: ordered
      ? Math.round((Date.parse(end!) - Date.parse(start!)) / 86400000) + 1
      : null,
    countdown:
      start && tripOverviewPhase(trip, now) === "upcoming"
        ? departureCountdown(trip, now)
        : null,
  };
}

export function tripOverview(
  trip: Trip,
  segments: Segment[],
  data: TripOverviewData,
  now: Date,
  selectedDay?: string,
) {
  const phase = tripOverviewPhase(trip, now);
  const dates = datesFor(trip, now);
  if (selectedDay && days(trip.start_date, trip.end_date).includes(selectedDay))
    dates.day = selectedDay;
  const destinations = segments
    .filter((item) => item.kind === "destination" && item.status !== "idea")
    .sort(
      (a, b) =>
        a.start_date.localeCompare(b.start_date) ||
        a.position - b.position ||
        a.id.localeCompare(b.id),
    );
  const during =
    phase === "traveling"
      ? duringTripPlan(trip, segments, data.bookings, now)
      : null;
  if (during)
    dates.day = days(trip.start_date, trip.end_date).includes(during.day)
      ? during.day
      : undefined;
  const openTasks = data.tasks
    ?.filter((task) => !task.done)
    .sort((a, b) => {
      const priority = { high: 0, normal: 1, low: 2 };
      return (
        priority[a.priority] - priority[b.priority] ||
        (a.due_date || "9999").localeCompare(b.due_date || "9999") ||
        a.title.localeCompare(b.title)
      );
    });
  const packing =
    data.packingItems && data.packingLists
      ? {
          total: data.packingItems.length,
          packed: data.packingItems.filter((item) => item.packed).length,
          lists: data.packingLists.length,
        }
      : null;
  const documents = data.documents
    ? {
        ready: data.documents.filter((item) => item.state === "ready").length,
        pending: data.documents.filter((item) => item.state === "pending")
          .length,
      }
    : null;
  const budget =
    data.bookings &&
    data.allocations &&
    data.expenses &&
    data.includePrepaid !== null
      ? budgetSummary(
          trip.currency,
          trip.budget,
          data.includePrepaid,
          data.allocations,
          data.bookings,
          data.expenses,
        )
      : null;
  const suggestions: OverviewSuggestion[] = [];
  const seen = new Set<string>();
  const taskTopics = {
    stays: (task: Task) => task.category === "Accommodation",
    transport: (task: Task) => task.category === "Transportation",
    documents: (task: Task) =>
      task.category === "Documents" || /\bdocuments?\b/i.test(task.title),
    packing: (task: Task) => /\b(pack|packing|luggage)\b/i.test(task.title),
    bookings: (task: Task) => /\b(bookings?|reservations?)\b/i.test(task.title),
  };
  function suggest(item: OverviewSuggestion, topic: keyof typeof taskTopics) {
    if (
      !data.tasks ||
      seen.has(topic) ||
      data.tasks.some(
        (task) =>
          normalizedTitle(task.title) === normalizedTitle(item.title) ||
          taskTopics[topic](task),
      )
    )
      return;
    seen.add(topic);
    suggestions.push(item);
  }
  // A read-only comparison, not an automatic saved Trip Check run. Honor any
  // persisted decisions with the same evidence before surfacing a finding.
  if (
    phase === "upcoming" &&
    data.bookings &&
    data.tasks &&
    data.findings &&
    data.decisions
  ) {
    const current = checkTrip(trip, segments, data.bookings, data.tasks);
    for (const finding of current) {
      if (
        !["stay_gap", "transport_gap", "booking_details"].includes(finding.kind)
      )
        continue;
      const saved = data.findings.find(
        (item) => item.fingerprint === finding.fingerprint,
      );
      const decision = saved
        ? data.decisions.find((item) => item.finding_id === saved.id)
        : undefined;
      if (!visibleFinding(true, decision, now)) continue;
      suggest(
        {
          key: finding.fingerprint,
          title:
            finding.kind === "stay_gap"
              ? "Check your accommodation details"
              : finding.kind === "transport_gap"
                ? "Review transport between destinations"
                : finding.title,
          detail: finding.observation,
          uncertainty: finding.uncertainty,
          view: finding.action_view,
          findingId: saved?.id,
        },
        finding.action_view as "stays" | "transport" | "bookings",
      );
    }
  }
  if (
    phase === "upcoming" &&
    packing &&
    (!packing.total || packing.packed < packing.total)
  )
    suggest(
      {
        key: "packing",
        title: packing.total
          ? "Review your packing list"
          : "Build a packing checklist",
        detail: packing.total
          ? `${packing.total - packing.packed} of ${packing.total} saved items are not marked packed.`
          : "No packing items are saved yet. Review a checklist starter if it would help.",
        uncertainty:
          "Choose what fits your plans; nothing is added or marked packed automatically.",
        view: "packing",
      },
      "packing",
    );
  if (
    phase === "upcoming" &&
    documents &&
    (!documents.ready || documents.pending)
  ) {
    const starter = prepStarter({
      days: dates.duration || 0,
      destinations: destinations.map((item) => item.title),
      transportModes: segments
        .filter((item) => item.kind === "transport" && item.status !== "idea")
        .map((item) => item.transport_mode),
      hasBookings: Boolean(data.bookings?.length),
    })[0];
    suggest(
      {
        key: "documents",
        title: documents.pending
          ? "Check your incomplete uploads"
          : starter.title,
        detail: documents.pending
          ? `${documents.pending} of your private uploads are incomplete.`
          : "No ready private uploads are visible in your account for this trip. Your documents may already be kept elsewhere.",
        uncertainty: documents.pending
          ? "Review or remove incomplete uploads in Documents. Document review status is not tracked."
          : starter.reason,
        view: documents.pending ? "documents" : "prep",
      },
      "documents",
    );
  }
  return {
    phase,
    during,
    tripId: trip.id,
    name: trip.name,
    dates,
    destination:
      during?.destination ||
      destinations[0]?.title ||
      savedTripDestinations(trip)[0]?.label ||
      null,
    destinations: destinations.length
      ? destinations.map((item) => ({
          id: item.id,
          title: item.title,
        }))
      : savedTripDestinations(trip).map((item, index) => ({
          id: `saved-${index}`,
          title: item.label,
        })),
    travelers:
      Number.isInteger(trip.travelers) && trip.travelers > 0
        ? trip.travelers
        : null,
    tasks: data.tasks
      ? {
          open: openTasks || [],
          total: data.tasks.length,
          completed: data.tasks.filter((task) => task.done).length,
        }
      : null,
    suggestions: suggestions.slice(0, 4),
    checkAvailable: data.findings !== null && data.decisions !== null,
    bookings: data.bookings
      ? {
          total: data.bookings.length,
          confirmed: data.bookings.filter(
            (item) => item.reservation_status === "confirmed",
          ).length,
        }
      : null,
    itinerary: {
      total: segments.filter(
        (item) =>
          item.status !== "idea" &&
          ["activity", "note", "transport"].includes(item.kind),
      ).length,
      ideas: segments.filter((item) => item.status === "idea").length,
    },
    packing,
    documents,
    budget,
    hasBudgetRecords:
      data.allocations && data.expenses && data.bookings
        ? Boolean(
            data.allocations.length ||
            data.expenses.length ||
            data.bookings.some((item) => item.paid_amount !== null),
          )
        : null,
    target: trip.budget,
    currency: trip.currency,
    includePrepaid: data.includePrepaid,
  };
}
export type TripOverview = ReturnType<typeof tripOverview>;
