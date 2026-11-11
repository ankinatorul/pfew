import { days, type Trip, type Segment } from "./domain";
import type { Booking, Task } from "./essentials";
import {
  dashboardDestination,
  dashboardTaskWindow,
  nextDashboardEvents,
} from "./travel-dashboard";

export type HomeSummaryData = {
  tasks: Task[];
  bookings: Booking[];
  segments: Segment[];
  packing: { packed: boolean }[] | null;
  documents: { state: string }[] | null;
};

// Present saved records using the existing local-day and chronological event rules.
export function homeSummary(trip: Trip, data: HomeSummaryData, now: Date) {
  const destination = dashboardDestination(trip, data.segments, now);
  return {
    tripId: trip.id,
    destination,
    day: days(trip.start_date, trip.end_date).includes(destination.today)
      ? destination.today
      : trip.start_date,
    prep: dashboardTaskWindow(data.tasks, destination.timezone, now),
    todayItems: data.segments
      .filter(
        (item) =>
          item.status !== "idea" &&
          item.start_date <= destination.today &&
          item.end_date >= destination.today &&
          ["activity", "note", "transport"].includes(item.kind),
      )
      .sort(
        (a, b) =>
          (a.local_time || "99:99").localeCompare(b.local_time || "99:99") ||
          a.position - b.position ||
          a.id.localeCompare(b.id),
      )
      .slice(0, 3),
    next: nextDashboardEvents(data.segments, data.bookings, now)[0] || null,
    nextBooking: nextDashboardEvents([], data.bookings, now)[0] || null,
    packing: data.packing
      ? {
          total: data.packing.length,
          packed: data.packing.filter((item) => item.packed).length,
        }
      : null,
    documents: data.documents
      ? {
          ready: data.documents.filter((file) => file.state === "ready").length,
          pending: data.documents.filter((file) => file.state === "pending")
            .length,
        }
      : null,
  };
}
export type HomeSummary = ReturnType<typeof homeSummary>;
