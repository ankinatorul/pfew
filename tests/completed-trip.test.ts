import { it, expect } from "vitest";
import { tripOverview, tripOverviewPhase } from "../lib/trip-overview";
import {
  completedTrip as trip,
  completedNow as now,
  completedSegments as segments,
  completedData,
} from "./fixtures/completed-trip";
import { overviewData } from "./fixtures/trip-overview";

it("uses the existing saved end-date/timezone boundary, including inclusive last-day and date edits", () => {
  const boundary = new Date("2027-05-11T00:30:00Z");
  expect(
    tripOverviewPhase({ ...trip, timezone: "America/Los_Angeles" }, boundary),
  ).toBe("traveling");
  expect(tripOverviewPhase({ ...trip, timezone: "Asia/Tokyo" }, boundary)).toBe(
    "past",
  );
  expect(tripOverviewPhase({ ...trip, end_date: "2027-05-25" }, now)).toBe(
    "traveling",
  );
  expect(
    tripOverviewPhase(
      { ...trip, start_date: "2027-06-01", end_date: "2027-06-05" },
      now,
    ),
  ).toBe("upcoming");
  expect(
    tripOverviewPhase(
      { ...trip, start_date: "2027-05-10", end_date: "2027-05-10" },
      new Date("2027-05-10T23:59:00Z"),
    ),
  ).toBe("traveling");
  expect(
    tripOverviewPhase(
      { ...trip, start_date: "2027-05-10", end_date: "2027-05-10" },
      now,
    ),
  ).toBe("past");
});
it("does not infer completion from empty schedules or incomplete/ambiguous dates", () => {
  const noPlans = tripOverview(
    trip,
    [],
    overviewData(),
    new Date("2027-05-05"),
  );
  expect(noPlans.phase).toBe("traveling");
  for (const change of [
    { start_date: "" },
    { end_date: "" },
    { start_date: "2027-02-30" },
    { end_date: "2027-04-30" },
    { timezone: "Invalid/Zone" },
  ]) {
    expect(
      tripOverview({ ...trip, ...change }, [], overviewData(), now).phase,
    ).toBe("unknown");
  }
});
it("reuses real historical summaries without completing, verifying or rewriting any record", () => {
  const data = completedData();
  const original = structuredClone({ trip, segments, data });
  const model = tripOverview(trip, segments, data, now, "2027-05-03");
  expect(model.phase).toBe("past");
  expect(model.dates).toMatchObject({
    duration: 10,
    countdown: null,
    day: "2027-05-03",
  });
  expect(model.during).toBeNull();
  expect(model.suggestions).toEqual([]);
  expect(model.destinations.map((item) => item.title)).toEqual([
    "First saved stop",
    "Second saved stop",
  ]);
  expect(model.itinerary.total).toBe(1);
  expect(model.bookings).toEqual({ total: 1, confirmed: 0 });
  expect(model.packing).toMatchObject({ packed: 1, total: 2 });
  expect(model.tasks?.open).toHaveLength(1);
  expect(model.budget).toMatchObject({
    planned: 300,
    prepaid: 100,
    actual: { EUR: 75 },
  });
  expect({ trip, segments, data }).toEqual(original);
});
it("distinguishes no budget records from zero-valued saved allocations and preserves per-currency spending", () => {
  expect(tripOverview(trip, [], overviewData(), now).hasBudgetRecords).toBe(
    false,
  );
  const data = completedData();
  data.bookings = [];
  data.expenses = [];
  data.allocations![0].planned = 0;
  expect(tripOverview(trip, [], data, now).hasBudgetRecords).toBe(true);
  data.expenses = [{ ...completedData().expenses![0], currency: "USD" }];
  expect(tripOverview(trip, [], data, now).budget?.actual).toEqual({ USD: 75 });
  data.expenses = null;
  const model = tripOverview(trip, [], data, now);
  expect(model.hasBudgetRecords).toBeNull();
  expect(model.budget).toBeNull();
});
