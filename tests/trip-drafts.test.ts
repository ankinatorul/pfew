import { it, expect, vi, afterEach } from "vitest";
import { tripBasicsSchema } from "../lib/trip-drafts";
import {
  lifecycle,
  nextTrip,
  tripDateLabel,
  departureCountdown,
} from "../lib/domain";
import { resolveActiveTrip, defaultActiveTrip } from "../lib/app-navigation";
import { organizeTrips } from "../lib/trip-collection";
import { finalizedTrips } from "../lib/finalized-trips";
import { geographicLocation } from "../lib/geographic-location";
import { overviewTrip } from "./fixtures/trip-overview";

const location = geographicLocation("Kyoto", "Japan", 35.01, 135.77);
afterEach(() => vi.clearAllMocks());
it("requires name, destinations and both dates, permitting same-day trips", () => {
  const input = {
    name: "My trip",
    destinations: [location],
    start_date: "2027-03-01",
    end_date: "2027-03-01",
  };
  expect(tripBasicsSchema.parse(input)).toEqual(input);
  for (const fields of [
    { name: "  " },
    { destinations: [] },
    { start_date: null },
    { end_date: null },
    { start_date: undefined },
    { end_date: undefined },
    { start_date: "" },
    { end_date: "" },
    { start_date: "2027-03-04" },
    { start_date: "2027-02-30" },
  ])
    expect(tripBasicsSchema.safeParse({ ...input, ...fields }).success).toBe(
      false,
    );
});
it("keeps undated and partial finalized dates neutral everywhere and drafts out of active choices", () => {
  const now = new Date("2027-04-01");
  for (const dates of [
    { start_date: "", end_date: "" },
    { start_date: "2027-05-01", end_date: "" },
    { start_date: "", end_date: "2027-05-01" },
  ]) {
    const trip = { ...overviewTrip, ...dates };
    expect(lifecycle(trip.start_date, trip.end_date, trip.timezone, now)).toBe(
      "unknown",
    );
    expect(departureCountdown(trip, now)).toBe(0);
    expect(tripDateLabel(trip.start_date, trip.end_date)).not.toMatch(
      /Invalid|NaN/,
    );
  }
  const draft = {
    ...overviewTrip,
    creation_state: "draft" as const,
    shared: false,
    lifecycle: "upcoming" as const,
  };
  expect(nextTrip([draft], now)).toBeNull();
  expect(defaultActiveTrip([draft], now)).toBeNull();
  expect(
    resolveActiveTrip([draft], "/", draft.id, draft.id, draft.id),
  ).toBeNull();
  expect(organizeTrips([draft], "", "all", "all")).toEqual([]);
});
it("filters finalized server queries, tolerates only a specifically missing legacy column, and normalizes NULL for presentation", async () => {
  const order = vi.fn().mockResolvedValue({
    data: [
      { ...overviewTrip, start_date: null, end_date: null },
      { ...overviewTrip, id: "draft", creation_state: "draft" },
    ],
    error: null,
  });
  const eq = vi.fn(() => ({ order }));
  const select = vi.fn(() => ({ eq, order }));
  const db = { from: vi.fn(() => ({ select })) } as unknown as Parameters<
    typeof finalizedTrips
  >[0];
  expect((await finalizedTrips(db)).data).toEqual([
    { ...overviewTrip, start_date: "", end_date: "" },
  ]);
  expect(eq).toHaveBeenCalledWith("creation_state", "finalized");
  order
    .mockResolvedValueOnce({
      data: null,
      error: {
        code: "42703",
        message: "column trips.creation_state does not exist",
      },
    })
    .mockResolvedValueOnce({ data: [overviewTrip], error: null });
  expect((await finalizedTrips(db)).data).toEqual([overviewTrip]);
  order.mockResolvedValueOnce({
    data: null,
    error: { code: "42501", message: "permission denied" },
  });
  const calls = select.mock.calls.length;
  expect((await finalizedTrips(db)).error).toBeTruthy();
  expect(select.mock.calls.length).toBe(calls + 1);
});
