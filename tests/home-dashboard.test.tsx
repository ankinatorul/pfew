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
beforeEach(() => {
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
    db: {
      from: (table: string) => {
        const query = {
          select: () => query,
          eq: () => query,
          then: (resolve: (value: unknown) => unknown) =>
            Promise.resolve({ data: tables[table] || [], error: null }).then(
              resolve,
            ),
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
it("shows genuine preparation progress, saved findings and separate budget numbers before departure", async () => {
  render(await HomeEssentials({ trip }));
  expect(screen.getByText("1 of 2 tasks complete")).toBeTruthy();
  expect(screen.getByText(/1 of 2 packing items/)).toBeTruthy();
  expect(screen.getByText("Planned remaining costs: EUR 200.00")).toBeTruthy();
  expect(screen.getByText("Unallocated target: EUR 700.00")).toBeTruthy();
  expect(screen.getByText("Actual spending: Not tracked.")).toBeTruthy();
  expect(screen.getByText("Visible finding ↗")).toBeTruthy();
  expect(screen.queryByText(/Dismissed finding/)).toBeNull();
  expect(
    screen.getByRole("button", { name: "Refresh dashboard" }),
  ).toBeTruthy();
});
it("retains past-trip access without showing stale next-event or reminder panels", async () => {
  vi.setSystemTime(new Date("2027-06-01T12:00:00Z"));
  render(await HomeEssentials({ trip }));
  expect(screen.getByText("A chapter worth keeping.")).toBeTruthy();
  expect(
    screen.getByRole("link", { name: "Revisit the itinerary ↗" }),
  ).toBeTruthy();
  expect(screen.queryByText("Next saved timed event")).toBeNull();
  expect(screen.queryByText("In-app reminders")).toBeNull();
  expect(screen.getByText("Actual spending: Not tracked.")).toBeTruthy();
});
