import { describe, it, expect } from "vitest";
import {
  days,
  lifecycle,
  tripSchema,
  segmentSchema,
  nextTrip,
  departureCountdown,
} from "../lib/domain";
const trip = {
  name: "Escape",
  start_date: "2027-01-01",
  end_date: "2027-01-05",
  timezone: "Europe/Bucharest",
  travelers: 2,
  style: "Comfort",
  currency: "EUR",
  budget: "",
};
describe("travel date boundaries", () => {
  it("includes both endpoints across month and leap boundaries", () =>
    expect(days("2028-02-28", "2028-03-01")).toEqual([
      "2028-02-28",
      "2028-02-29",
      "2028-03-01",
    ]));
  it("uses destination local date for lifecycle", () =>
    expect(
      lifecycle(
        "2027-01-02",
        "2027-01-03",
        "Asia/Tokyo",
        new Date("2027-01-01T16:00:00Z"),
      ),
    ).toBe("traveling"));
  it("rejects reversed dates", () =>
    expect(
      tripSchema.safeParse({ ...trip, end_date: "2026-12-31" }).success,
    ).toBe(false));
  it("rejects unknown time zones", () =>
    expect(tripSchema.safeParse({ ...trip, timezone: "Made/Up" }).success).toBe(
      false,
    ));
  it("keeps an omitted budget unknown", () =>
    expect(tripSchema.parse(trip).budget).toBeNull());
  it("rejects invalid segment times and states", () =>
    expect(
      segmentSchema.safeParse({
        trip_id: "f3fa8310-3f66-4c03-8b90-57362ab6eabd",
        kind: "transport",
        title: "Train",
        start_date: "2027-01-01",
        end_date: "2027-01-01",
        local_time: "25:00",
        timezone: "UTC",
        status: "booked",
        notes: "",
      }).success,
    ).toBe(false));
});

it("prioritizes active trips over later upcoming trips regardless of input order", () => {
  const base = { ...trip, id: "active", budget: null };
  const future = {
    ...base,
    id: "future",
    start_date: "2028-01-01",
    end_date: "2028-01-05",
  };
  expect(nextTrip([future, base], new Date("2027-01-02T12:00:00Z"))?.id).toBe(
    "active",
  );
  expect(nextTrip([base], new Date("2029-01-02T12:00:00Z"))).toBeNull();
});
it("counts calendar days in the trip time zone rather than elapsed 24-hour periods", () => {
  expect(
    departureCountdown(
      {
        ...trip,
        id: "trip",
        budget: null,
        start_date: "2027-01-03",
        timezone: "Asia/Tokyo",
      },
      new Date("2027-01-01T16:00:00Z"),
    ),
  ).toBe(1);
});
