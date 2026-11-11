import { it, expect } from "vitest";
import { tripOverviewPhase, tripOverview } from "../lib/trip-overview";
import { checkTrip } from "../lib/trip-check";
import {
  overviewTrip as trip,
  overviewNow as now,
  overviewData,
  overviewSegment,
  overviewBooking,
  overviewTask,
} from "./fixtures/trip-overview";

it("classifies trip phases from saved dates without guessing an ongoing open-ended trip", () => {
  expect(tripOverviewPhase(trip, now)).toBe("upcoming");
  expect(tripOverviewPhase(trip, new Date("2027-05-02"))).toBe("traveling");
  expect(tripOverviewPhase(trip, new Date("2027-06-01"))).toBe("past");
  expect(tripOverviewPhase({ ...trip, start_date: "", end_date: "" }, now)).toBe("unknown");
  expect(tripOverviewPhase({ ...trip, end_date: "" }, now)).toBe("unknown");
  expect(tripOverviewPhase({ ...trip, end_date: "" }, new Date("2027-05-02"))).toBe("unknown");
});
it("uses real bookings for stay coverage and does not infer missing reservations", () => {
  const booked = tripOverview(
    trip,
    [overviewSegment()],
    overviewData({ bookings: [overviewBooking()] }),
    now,
  );
  expect(booked.bookings).toEqual({ total: 1, confirmed: 0 });
  expect(booked.suggestions.some((item) => item.view === "stays")).toBe(false);
  const empty = tripOverview(trip, [overviewSegment()], overviewData(), now);
  const stay = empty.suggestions.find((item) => item.view === "stays")!;
  expect(stay.title).toBe("Check your accommodation details");
  expect(stay.detail).toContain("No stay is saved");
  expect(stay.uncertainty).toContain("outside the app");
  expect(empty.bookings).toEqual({ total: 0, confirmed: 0 });
});
it("honors persistent Trip Check decisions and never manufactures a finding ID", () => {
  const finding = checkTrip(trip, [], [], []).find(
    (item) => item.kind === "stay_gap",
  )!;
  const data = overviewData({
    findings: [{ id: "saved-finding", fingerprint: finding.fingerprint }],
    decisions: [
      {
        finding_id: "saved-finding",
        decision: "dismissed",
        remind_after: null,
      },
    ],
  });
  expect(
    tripOverview(trip, [], data, now).suggestions.some(
      (item) => item.view === "stays",
    ),
  ).toBe(false);
  const fresh = tripOverview(trip, [], overviewData(), now).suggestions.find(
    (item) => item.view === "stays",
  )!;
  expect(fresh.findingId).toBeUndefined();
  data.decisions = [
    {
      finding_id: "saved-finding",
      decision: "remind_later",
      remind_after: "2027-04-26T12:00:00Z",
    },
  ];
  expect(
    tripOverview(trip, [], data, now).suggestions.some(
      (item) => item.view === "stays",
    ),
  ).toBe(false);
  expect(
    tripOverview(trip, [], data, new Date("2027-04-27")).suggestions.find(
      (item) => item.view === "stays",
    )?.findingId,
  ).toBe("saved-finding");
});
it("keeps saved tasks separate and avoids duplicate topic/title suggestions, including completed tasks", () => {
  const tasks = [
    overviewTask({
      category: "Accommodation",
      title: "Review our hotel arrangements",
      done: true,
    }),
    overviewTask({ id: "packing-task", title: "Build a packing checklist" }),
    overviewTask({
      id: "documents-task",
      category: "Documents",
      title: "Review your travel documents",
    }),
  ];
  const model = tripOverview(trip, [], overviewData({ tasks }), now);
  expect(model.tasks?.completed).toBe(1);
  expect(model.tasks?.open).toHaveLength(2);
  expect(model.suggestions).toEqual([]);
});
it("derives intercity transport suggestions only from saved destination transitions", () => {
  const segments = [
    overviewSegment({ end_date: "2027-05-05" }),
    overviewSegment({
      id: "next-destination",
      title: "Second saved destination",
      start_date: "2027-05-05",
      position: 1,
    }),
  ];
  const model = tripOverview(trip, segments, overviewData(), now);
  expect(model.destinations).toHaveLength(2);
  expect(
    model.suggestions.find((item) => item.view === "transport")?.detail,
  ).toContain("Second saved destination");
  const withTransport = tripOverview(
    trip,
    [
      ...segments,
      overviewSegment({
        id: "journey",
        kind: "transport",
        start_date: "2027-05-05",
        end_date: "2027-05-05",
      }),
    ],
    overviewData(),
    now,
  );
  expect(
    withTransport.suggestions.some((item) => item.view === "transport"),
  ).toBe(false);
});
it("reports unknown dates and travelers without fabricated countdowns, durations or invalid dates", () => {
  const model = tripOverview(
    { ...trip, start_date: "", end_date: "", travelers: 0 },
    [],
    overviewData(),
    now,
  );
  expect(model.dates).toEqual({
    label: "Travel dates not saved",
    duration: null,
    countdown: null,
    day: undefined,
  });
  expect(model.travelers).toBeNull();
  expect(model.destination).toBeNull();
  const partial = tripOverview(
    { ...trip, end_date: "" },
    [],
    overviewData(),
    now,
  );
  expect(partial.dates.countdown).toBeNull();
  expect(partial.dates.duration).toBeNull();
  expect(partial.dates.label).toContain("return date not saved");
});
it("uses packing and upload states without inventing document-review status", () => {
  const model = tripOverview(
    trip,
    [],
    overviewData({
      packingLists: [{ id: "list" }],
      packingItems: [{ packed: true }, { packed: false }],
      documents: [{ state: "ready" }, { state: "pending" }],
    }),
    now,
  );
  expect(model.packing).toEqual({ lists: 1, packed: 1, total: 2 });
  expect(model.documents).toEqual({ ready: 1, pending: 1 });
  expect(
    model.suggestions.find((item) => item.view === "documents")?.title,
  ).toBe("Check your incomplete uploads");
});
it("keeps target, planned, prepaid, and actual currencies separate", () => {
  const model = tripOverview(
    trip,
    [],
    overviewData({
      bookings: [overviewBooking()],
      allocations: [
        {
          id: "allocation",
          trip_id: trip.id,
          currency: "EUR",
          category: "Food",
          day: null,
          destination_id: null,
          planned: 50,
          estimate_low: null,
          estimate_high: null,
          notes: "",
        },
      ],
      expenses: [
        {
          id: "expense",
          trip_id: trip.id,
          amount: 20,
          currency: "USD",
          category: "Food",
          day: "2027-05-01",
          payment_method: "card",
          notes: "",
        },
      ],
    }),
    now,
  );
  expect(model.budget).toMatchObject({
    planned: 50,
    prepaid: 100,
    actual: { USD: 20 },
    unallocated: 850,
  });
});
it("does not turn failed reads into empty-booking claims or resurrect handled checks", () => {
  const model = tripOverview(
    trip,
    [],
    overviewData({
      bookings: null,
      packingItems: null,
      documents: null,
      findings: null,
    }),
    now,
  );
  expect(model.bookings).toBeNull();
  expect(model.packing).toBeNull();
  expect(model.documents).toBeNull();
  expect(model.budget).toBeNull();
  expect(model.suggestions).toEqual([]);
  expect(model.checkAvailable).toBe(false);
});
it("retains valid itinerary-day context and computes summaries without modifying records", () => {
  const data = overviewData({ tasks: [overviewTask()] });
  const before = JSON.stringify(data);
  const segments = [
    overviewSegment(),
    overviewSegment({ id: "activity", kind: "activity" }),
    overviewSegment({ id: "idea", kind: "activity", status: "idea" }),
  ];
  const model = tripOverview(trip, segments, data, now, "2027-05-03");
  expect(model.dates.day).toBe("2027-05-03");
  expect(model.itinerary).toEqual({ total: 1, ideas: 1 });
  expect(tripOverview(trip, segments, data, now, "2026-01-01").dates.day).toBe(
    trip.start_date,
  );
  expect(JSON.stringify(data)).toBe(before);
});
