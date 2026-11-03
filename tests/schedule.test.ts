import { it, expect } from "vitest";
import { localInstant, savedSchedule } from "../lib/schedule";
import { checkTrip } from "../lib/trip-check";
import type { Segment, Trip } from "../lib/domain";
import type { Booking } from "../lib/essentials";
const trip: Trip = {
  id: "trip",
  name: "Trip",
  start_date: "2027-03-01",
  end_date: "2027-03-31",
  timezone: "Europe/Bucharest",
  travelers: 2,
  style: "Comfort",
  currency: "EUR",
  budget: null,
};
const segment = (id: string, values: Partial<Segment> = {}): Segment => ({
  id,
  trip_id: "trip",
  kind: "activity",
  title: id,
  start_date: "2027-03-05",
  end_date: "2027-03-05",
  local_time: "10:00",
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
  ...values,
});
const booking = (id: string, values: Partial<Booking> = {}): Booking => ({
  id,
  trip_id: "trip",
  segment_id: null,
  title: id,
  category: "activity",
  provider: "",
  reference: "",
  start_date: "2027-03-05",
  end_date: "2027-03-05",
  local_time: "10:00",
  timezone: "UTC",
  end_local_time: "11:00",
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
  ...values,
});
it("compares actual instants across zones and catches overlaps across midnight", () => {
  const a = segment("Tokyo", { local_time: "20:00", timezone: "Asia/Tokyo" }),
    b = segment("London", { local_time: "11:30", timezone: "Europe/London" });
  expect(savedSchedule([a, b], []).conflicts[0].minutes).toBe(30);
  const late = segment("Late", { local_time: "23:45", duration_minutes: 60 }),
    next = segment("Next", {
      start_date: "2027-03-06",
      end_date: "2027-03-06",
      local_time: "00:00",
    });
  expect(savedSchedule([late, next], []).conflicts[0].minutes).toBe(45);
});
it("does not invent durations, occupy entire stays, include ideas, or count touching endpoints as overlaps", () => {
  expect(
    savedSchedule(
      [
        segment("Untimed", { local_time: "" }),
        segment("Unknown duration", { duration_minutes: null }),
        segment("Stay", { kind: "stay" }),
        segment("Idea", { status: "idea" }),
      ],
      [],
    ).records,
  ).toHaveLength(0);
  expect(
    savedSchedule(
      [segment("First"), segment("Next", { local_time: "11:00" })],
      [],
    ).conflicts,
  ).toHaveLength(0);
});
it("handles real transport arrival zones and suppresses exact linked wallet duplicates", () => {
  const transport = segment("Flight", {
    kind: "transport",
    local_time: "20:00",
    timezone: "Asia/Tokyo",
    arrival_time: "14:00",
    arrival_timezone: "Europe/London",
    duration_minutes: null,
  });
  expect(
    savedSchedule([transport], []).records[0].end -
      savedSchedule([transport], []).records[0].start,
  ).toBe(3 * 3600000);
  const records = savedSchedule(
    [segment("Plan"), segment("Other", { local_time: "10:30" })],
    [booking("Wallet", { segment_id: "Plan" })],
  );
  expect(records.records).toHaveLength(2);
  expect(records.conflicts).toHaveLength(1);
});
it("leaves ambiguous and nonexistent DST times uncertain rather than picking an offset", () => {
  expect(() =>
    localInstant("2027-03-14", "02:30", "America/New_York"),
  ).toThrow();
  expect(() =>
    localInstant("2027-11-07", "01:30", "America/New_York"),
  ).toThrow();
  const invalid = segment("Clock change", {
    start_date: "2027-03-14",
    end_date: "2027-03-14",
    local_time: "02:30",
    timezone: "America/New_York",
  });
  expect(savedSchedule([invalid], []).uncertain).toHaveLength(1);
  expect(savedSchedule([invalid], []).conflicts).toHaveLength(0);
  const impossible = booking("Arrival", {
    local_time: "12:00",
    end_local_time: "11:00",
  });
  expect(savedSchedule([], [impossible]).uncertain[0].reason).toContain(
    "not later",
  );
});
it("keeps conflict decisions tied to stable saved evidence and flags linked booking dates separately", () => {
  const a = segment("A"),
    b = segment("B", { local_time: "10:30" });
  const finding = (items: Segment[]) =>
    checkTrip(trip, items, [], []).find((item) => item.kind === "time_overlap");
  expect(finding([a, b])?.fingerprint).toBe(finding([b, a])?.fingerprint);
  expect(finding([a, { ...b, local_time: "10:45" }])?.fingerprint).not.toBe(
    finding([a, b])?.fingerprint,
  );
  expect(
    checkTrip(
      trip,
      [a],
      [
        booking("Wallet", {
          segment_id: "A",
          start_date: "2027-03-06",
          end_date: "2027-03-06",
        }),
      ],
      [],
    ).some((item) => item.kind === "linked_dates"),
  ).toBe(true);
});
