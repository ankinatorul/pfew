import { it, expect } from "vitest";
import { checkTrip, visibleFinding } from "../lib/trip-check";
import type { Trip, Segment } from "../lib/domain";
import type { Booking } from "../lib/essentials";
const trip: Trip = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Escape",
  start_date: "2027-05-01",
  end_date: "2027-05-04",
  timezone: "UTC",
  travelers: 1,
  style: "Comfort",
  currency: "EUR",
  budget: null,
};
function segment(part: Partial<Segment>): Segment {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    trip_id: trip.id,
    kind: "stay",
    title: "Stay",
    start_date: trip.start_date,
    end_date: trip.end_date,
    local_time: "",
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
    ...part,
  };
}
it("checks nights using checkout-exclusive stay ranges", () => {
  const stays = [
    segment({ end_date: "2027-05-02" }),
    segment({
      id: "33333333-3333-4333-8333-333333333333",
      start_date: "2027-05-02",
    }),
  ];
  expect(checkTrip(trip, stays, [], [])).toEqual([]);
});
it("describes gaps as missing saved information rather than missing reservations", () => {
  const findings = checkTrip(trip, [], [], []);
  expect(findings[0].kind).toBe("stay_gap");
  expect(findings[0].uncertainty).toContain("outside the app");
  expect(findings[0].observation).toContain("2027-05-01");
  expect(findings[0].observation).not.toContain("2027-05-04");
});
it("does not count linked wallet stays twice", () => {
  const stay = segment({});
  const booking = {
    id: "b",
    segment_id: stay.id,
    category: "accommodation",
    start_date: stay.start_date,
    end_date: stay.end_date,
    title: stay.title,
    provider: "Hotel",
    reference: "known",
    local_time: "15:00",
  } as Booking;
  expect(checkTrip(trip, [stay], [booking], [])).toEqual([]);
});
it("flags possible overlapping stays with explicit uncertainty", () => {
  const result = checkTrip(
    trip,
    [segment({}), segment({ id: "other", title: "Another stay" })],
    [],
    [],
  );
  expect(result.find((f) => f.kind === "stay_overlap")?.observation).toContain(
    "different travelers",
  );
});
it("keeps dismissal keys stable and changes them when evidence changes", () => {
  const a = checkTrip(trip, [], [], [])[0];
  const b = checkTrip({ ...trip, name: "Renamed" }, [], [], [])[0];
  const c = checkTrip({ ...trip, end_date: "2027-05-05" }, [], [], [])[0];
  expect(a.fingerprint).toBe(b.fingerprint);
  expect(a.fingerprint).not.toBe(c.fingerprint);
  expect(visibleFinding(true, { decision: "dismissed" })).toBe(false);
  expect(
    visibleFinding(
      true,
      { decision: "remind_later", remind_after: "2027-01-01T00:00:00Z" },
      new Date("2027-01-02"),
    ),
  ).toBe(true);
});
