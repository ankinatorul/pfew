import { it, expect } from "vitest";
import {
  dashboardDestination,
  nextDashboardEvents,
  dashboardTaskWindow,
} from "../lib/travel-dashboard";
import { organizeTrips, type TripCard } from "../lib/trip-collection";
import type { Trip, Segment } from "../lib/domain";
import type { Booking, Task } from "../lib/essentials";
const trip: Trip = {
  id: "trip",
  name: "Trip",
  start_date: "2027-05-01",
  end_date: "2027-05-10",
  timezone: "UTC",
  travelers: 2,
  style: "Comfort",
  currency: "EUR",
  budget: 1000,
};
const segment = (id: string, extra: Partial<Segment> = {}): Segment => ({
  id,
  trip_id: trip.id,
  title: id,
  kind: "activity",
  start_date: "2027-05-01",
  end_date: "2027-05-01",
  local_time: "13:00",
  timezone: "UTC",
  status: "planned",
  notes: "",
  address: "",
  provider: "",
  reference: "",
  origin: "",
  arrival_location: "",
  arrival_time: "",
  arrival_timezone: "",
  transport_mode: "",
  position: 0,
  destination_id: null,
  duration_minutes: 60,
  ...extra,
});
const booking = (id: string, extra: Partial<Booking> = {}): Booking => ({
  id,
  trip_id: trip.id,
  segment_id: null,
  title: id,
  category: "activity",
  provider: "",
  reference: "",
  start_date: "2027-05-01",
  end_date: "2027-05-01",
  local_time: "13:00",
  timezone: "UTC",
  end_local_time: "14:00",
  end_timezone: "UTC",
  origin: "",
  destination: "",
  travelers: "",
  notes: "",
  price: null,
  paid_amount: null,
  currency: "EUR",
  payment_status: "unknown",
  verification: "unverified",
  ...extra,
});
it("picks the next real saved instant rather than an already departed booking", () => {
  const now = new Date("2027-05-01T12:00:00Z");
  const events = nextDashboardEvents(
    [],
    [
      booking("Departed", { local_time: "10:00", end_local_time: "11:00" }),
      booking("Tokyo", {
        local_time: "22:30",
        timezone: "Asia/Tokyo",
        end_local_time: "23:30",
        end_timezone: "Asia/Tokyo",
      }),
      booking("New York", {
        local_time: "09:00",
        timezone: "America/New_York",
        end_local_time: "10:00",
        end_timezone: "America/New_York",
      }),
    ],
    now,
  );
  expect(events.map((event) => event.title)).toEqual(["New York", "Tokyo"]);
  expect(events[0].start).toBe(Date.parse("2027-05-01T13:00:00Z"));
});
it("keeps known underway windows, labels unknown times and deduplicates linked instants across aliases", () => {
  const now = new Date("2027-05-01T12:00:00Z");
  const items = nextDashboardEvents(
    [
      segment("Plan", {
        timezone: "Etc/UTC",
        local_time: "11:00",
        duration_minutes: 180,
      }),
      segment("Idea", { status: "idea" }),
    ],
    [
      booking("Wallet", {
        segment_id: "Plan",
        local_time: "11:00",
        end_local_time: "14:00",
      }),
      booking("Time missing", {
        start_date: "2027-05-02",
        end_date: "2027-05-02",
        local_time: "",
        end_local_time: "",
      }),
    ],
    now,
  );
  expect(items.map((item) => item.id)).toEqual(["Wallet", "Time missing"]);
  expect(items[0].state).toBe("underway");
  expect(items[1]).toMatchObject({ state: "time needed", start: null });
});
it("retains ambiguous DST starts for review without inventing an instant", () => {
  const result = nextDashboardEvents(
    [
      segment("Clock change", {
        start_date: "2027-03-14",
        end_date: "2027-03-14",
        local_time: "02:30",
        timezone: "America/New_York",
      }),
    ],
    [],
    new Date("2027-03-14T05:00:00Z"),
  );
  expect(result[0]).toMatchObject({
    time: "02:30",
    start: null,
    state: "time needed",
  });
});
it("chooses a saved destination local date and excludes unscheduled destination ideas", () => {
  const items = [
    segment("Earlier", {
      kind: "destination",
      start_date: "2027-05-01",
      end_date: "2027-05-02",
      timezone: "America/Los_Angeles",
    }),
    segment("Tokyo", {
      kind: "destination",
      start_date: "2027-05-02",
      end_date: "2027-05-05",
      timezone: "Asia/Tokyo",
    }),
    segment("Idea", {
      kind: "destination",
      status: "idea",
      start_date: "2027-05-03",
      end_date: "2027-05-10",
    }),
  ];
  expect(
    dashboardDestination(trip, items, new Date("2027-05-01T23:00:00Z")),
  ).toMatchObject({
    today: "2027-05-02",
    timezone: "Asia/Tokyo",
    dayNumber: 2,
    destination: { id: "Tokyo" },
  });
  expect(
    dashboardDestination(trip, [], new Date("2027-05-01T23:00:00Z")).timezone,
  ).toBe("UTC");
});
it("uses seven local calendar days for reminders across a DST transition", () => {
  const base = {
    trip_id: "trip",
    category: "Other",
    priority: "normal",
  } as const;
  const tasks: Task[] = [
    {
      ...base,
      id: "due",
      title: "Due next week",
      due_date: "2027-11-14",
      done: false,
    },
    {
      ...base,
      id: "past",
      title: "Past due",
      due_date: "2027-11-05",
      done: false,
    },
    { ...base, id: "done", title: "Done", due_date: "2027-11-01", done: true },
    { ...base, id: "none", title: "No deadline", due_date: null, done: false },
  ];
  const result = dashboardTaskWindow(
    tasks,
    "America/New_York",
    new Date("2027-11-07T04:30:00Z"),
  );
  expect(result).toMatchObject({
    today: "2027-11-07",
    horizon: "2027-11-14",
    total: 4,
    completed: 1,
    open: 3,
    overdue: 1,
  });
  expect(result.due.map((item) => item.id)).toEqual(["past", "due"]);
});
it("orders current/upcoming/past trips and searches within the user-scoped collection", () => {
  const card = (
    id: string,
    lifecycle: TripCard["lifecycle"],
    start_date: string,
    shared = false,
  ): TripCard => ({ ...trip, id, name: id, lifecycle, start_date, shared });
  const items = [
    card("Old", "past", "2020-01-01"),
    card("Later", "upcoming", "2028-01-01"),
    card("Now", "traveling", "2027-05-01"),
    card("Recent", "past", "2026-01-01", true),
    card("Next", "upcoming", "2027-06-01", true),
  ];
  expect(organizeTrips(items, "", "all", "all").map((item) => item.id)).toEqual(
    ["Now", "Next", "Later", "Recent", "Old"],
  );
  expect(
    organizeTrips(items, "NE", "upcoming", "shared").map((item) => item.id),
  ).toEqual(["Next"]);
  expect(
    organizeTrips(items, "", "past", "owned").map((item) => item.id),
  ).toEqual(["Old"]);
});
