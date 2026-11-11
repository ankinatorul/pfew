// @vitest-environment jsdom
import { afterEach, beforeEach, it, expect, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
const mocks = vi.hoisted(() => ({ access: vi.fn(), refresh: vi.fn() }));
vi.mock("../lib/access", () => ({ access: mocks.access }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
import { HomeEssentials } from "../components/essentials/home";
const trip = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Trip",
  start_date: "2027-05-01",
  end_date: "2027-05-10",
  timezone: "UTC",
  travelers: 2,
  style: "Comfort",
  currency: "EUR",
  budget: 1000,
};
let tables: Record<string, Record<string, unknown>[]>;
let reads: [string, string, unknown][];
let failingTables: Set<string>;
beforeEach(() => {
  reads = [];
  failingTables = new Set();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2027-04-25T12:00:00Z"));
  tables = {
    prep_tasks: [
      { id: "t1", title: "Complete task", done: true, due_date: null },
      {
        id: "t2",
        title: "Review documents",
        done: false,
        due_date: "2027-04-26",
      },
    ],
    bookings: [
      {
        id: "b",
        paid_amount: 100,
        currency: "EUR",
        title: "Future booking",
        category: "activity",
        start_date: "2027-05-02",
        end_date: "2027-05-02",
        local_time: "13:00",
        end_local_time: "14:00",
        timezone: "UTC",
        end_timezone: "UTC",
        verification: "unverified",
      },
    ],
    trip_segments: [],
    packing_items: [
      { id: "p1", packed: true },
      { id: "p2", packed: false },
    ],
    booking_attachments: [{ state: "ready" }, { state: "pending" }],
    budget_allocations: [{ planned: 200, currency: "EUR" }],
    expenses: [],
    budget_settings: [],
    trip_check_findings: [
      {
        id: "f1",
        title: "Visible finding",
        active: true,
        action_view: "stays",
      },
      {
        id: "f2",
        title: "Dismissed finding",
        active: true,
        action_view: "transport",
      },
    ],
    finding_decisions: [
      { finding_id: "f2", decision: "dismissed", remind_after: null },
    ],
    trip_check_runs: [{ checked_at: "2027-04-24T12:00:00Z", finding_count: 2 }],
  };
  mocks.access.mockResolvedValue({
    user: { id: "signed-in-user" },
    db: {
      from: (table: string) => {
        const query = {
          select: (fields: string) => {
            reads.push([table, "select", fields]);
            return query;
          },
          eq: (column: string, value: unknown) => {
            reads.push([table, column, value]);
            return query;
          },
          then: (resolve: (value: unknown) => unknown) =>
            Promise.resolve({
              data: tables[table] || [],
              error: failingTables.has(table) ? { code: "PGRST205" } : null,
            }).then(resolve),
        };
        return query;
      },
    },
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});
it("shows due prep and the next saved event without the detailed dashboard", async () => {
  render(await HomeEssentials({ trip }));
  expect(screen.getByText("1 of 2 prep tasks done")).toBeTruthy();
  expect(screen.getByText("Review documents")).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Future booking" })).toBeTruthy();
  expect(
    screen.getByRole("link", { name: "Review prep" }).getAttribute("href"),
  ).toBe(`/trips/${trip.id}?view=prep`);
  expect(
    screen.getByRole("link", { name: "View details" }).getAttribute("href"),
  ).toBe(`/trips/${trip.id}?view=bookings`);
  expect(screen.queryByText(/Actual spending/)).toBeNull();
  expect(screen.queryByText(/Visible finding/)).toBeNull();
});
it("leaves past trips to the trip collection without stale reminders", async () => {
  vi.setSystemTime(new Date("2027-06-01T12:00:00Z"));
  expect(await HomeEssentials({ trip })).toBeNull();
  expect(mocks.access).not.toHaveBeenCalled();
});
it("uses honest empty summaries for an upcoming trip without saved plans", async () => {
  tables.prep_tasks = [];
  tables.bookings = [];
  tables.packing_items = [];
  tables.booking_attachments = [];
  render(await HomeEssentials({ trip }));
  expect(screen.getByRole("region", { name: "Before you go" })).toBeTruthy();
  expect(screen.getByText("Start your prep checklist")).toBeTruthy();
  expect(screen.getByText("No upcoming bookings")).toBeTruthy();
  expect(screen.getByText("No items yet")).toBeTruthy();
  expect(screen.getByText("0 private files")).toBeTruthy();
});
it("shows today's local plans and excludes ideas while traveling", async () => {
  vi.setSystemTime(new Date("2027-05-02T08:00:00Z"));
  tables.trip_segments = [
    {
      id: "a",
      kind: "activity",
      title: "Morning walk",
      start_date: "2027-05-02",
      end_date: "2027-05-02",
      local_time: "09:00",
      timezone: "UTC",
      position: 0,
      status: "planned",
    },
    {
      id: "b",
      kind: "activity",
      title: "Maybe a museum",
      start_date: "2027-05-02",
      end_date: "2027-05-02",
      local_time: "",
      timezone: "UTC",
      position: 1,
      status: "idea",
    },
  ];
  render(await HomeEssentials({ trip }));
  expect(screen.getByText("Today · Day 2")).toBeTruthy();
  expect(screen.getAllByText("Morning walk").length).toBeGreaterThan(0);
  expect(screen.queryByText("Maybe a museum")).toBeNull();
  expect(
    screen.getByRole("link", { name: "View today" }).getAttribute("href"),
  ).toBe(`/trips/${trip.id}?view=itinerary&day=2027-05-02`);
});
it("keeps trip access when summary data cannot be loaded", async () => {
  failingTables.add("prep_tasks");
  render(await HomeEssentials({ trip }));
  expect(
    screen.getByRole("link", { name: "Open your trip" }).getAttribute("href"),
  ).toBe(`/trips/${trip.id}`);
});
it("shows real packing progress and only reads the current user's private document states", async () => {
  render(await HomeEssentials({ trip }));
  expect(screen.getByText("50% packed")).toBeTruthy();
  expect(screen.getByText("1 of 2 items packed")).toBeTruthy();
  expect(screen.getByText("1 private file")).toBeTruthy();
  expect(screen.getByText("1 incomplete upload")).toBeTruthy();
  expect(reads).toContainEqual(["booking_attachments", "select", "state"]);
  expect(reads).toContainEqual([
    "booking_attachments",
    "owner_id",
    "signed-in-user",
  ]);
  expect(
    reads
      .filter((read) => read[1] === "trip_id")
      .every((read) => read[2] === trip.id),
  ).toBe(true);
  expect(
    screen.getByRole("link", { name: /Documents/ }).getAttribute("href"),
  ).toBe(`/trips/${trip.id}?view=documents`);
});
it("does not report missing optional summaries as zero saved items", async () => {
  failingTables.add("packing_items");
  failingTables.add("booking_attachments");
  render(await HomeEssentials({ trip }));
  expect(screen.getAllByText("Summary unavailable")).toHaveLength(2);
  expect(screen.queryByText("0 private files")).toBeNull();
  expect(screen.getByText("1 of 2 prep tasks done")).toBeTruthy();
});
