import { expect, it } from "vitest";
import {
  buildJourney,
  calendarNights,
  friendlyDateRange,
  isDailyEntry,
  journeyBookingColumns,
} from "../lib/journey";
import {
  journeyTrip,
  journeySegments,
  journeySegment,
} from "./journey-fixtures";
it("orders real destinations chronologically without mutating input or counting destination ideas", () => {
  const segments = [
    journeySegments[2],
    journeySegments[0],
    journeySegments[1],
    journeySegment("outside", { trip_id: "other" }),
    journeySegment("idea", { status: "idea" }),
  ];
  const original = segments.map((s) => s.id);
  const journey = buildJourney(journeyTrip, segments, []);
  expect(journey.stops.map((s) => s.destination.title)).toEqual([
    "Tokyo",
    "Kyoto",
    "Osaka",
  ]);
  expect(journey.stops.map((s) => s.nights)).toEqual([4, 4, 2]);
  expect(segments.map((s) => s.id)).toEqual(original);
});
it("formats dates for people and calculates calendar nights across DST, leap days and year boundaries", () => {
  expect(friendlyDateRange("2027-09-12", "2027-09-16")).toBe("12–16 Sept 2027");
  expect(friendlyDateRange("2027-09-28", "2027-10-03")).toBe(
    "28 Sept – 3 Oct 2027",
  );
  expect(friendlyDateRange("2026-12-29", "2027-01-03")).toBe(
    "29 Dec 2026 – 3 Jan 2027",
  );
  expect(friendlyDateRange("2027-05-01", "2027-05-01")).toBe("1 May 2027");
  expect(calendarNights("2027-03-27", "2027-03-29")).toBe(2);
  expect(calendarNights("2028-02-28", "2028-03-01")).toBe(2);
});
it("derives summaries from scoped saved records and does not use an unscheduled idea's placeholder date", () => {
  const journey = buildJourney(
    journeyTrip,
    [
      ...journeySegments,
      journeySegment("unlinked idea", { kind: "activity", status: "idea" }),
    ],
    [],
  );
  expect(journey.stops[0]).toMatchObject({ stays: 1, activities: 1, ideas: 1 });
  expect(journey.stops[1]).toMatchObject({ stays: 1, activities: 0, ideas: 1 });
  expect(journey.ideaCount).toBe(3);
});
it("does not double-count a booking linked to a saved stay and avoids ambiguous date-only attribution", () => {
  const segments = [
    journeySegment("a"),
    journeySegment("b"),
    journeySegment("stay", { kind: "stay", destination_id: "a" }),
    journeySegment("ambiguous", { kind: "activity" }),
  ];
  const journey = buildJourney(journeyTrip, segments, [
    {
      id: "booking",
      segment_id: "stay",
      title: "Linked stay booking",
      category: "accommodation",
      start_date: "2027-09-12",
      end_date: "2027-09-16",
    },
  ]);
  expect(journey.stops.find((s) => s.destination.id === "a")?.stays).toBe(1);
  expect(journey.stops.every((s) => s.activities === 0)).toBe(true);
});
it("shows city-matched legs, labels date-linked context uncertain, and keeps unmatched journeys accessible", () => {
  const legs = buildJourney(journeyTrip, journeySegments, []).connections;
  expect(legs.map((c) => c.legs.map((l) => l.match))).toEqual([
    ["cities"],
    ["cities"],
  ]);
  const unknown = journeySegment("unknown", {
    kind: "transport",
    start_date: "2027-09-16",
    end_date: "2027-09-16",
  });
  expect(
    buildJourney(journeyTrip, [...journeySegments.slice(0, 3), unknown], [])
      .otherTransport,
  ).toHaveLength(1);
  const linked = { ...unknown, destination_id: journeySegments[1].id };
  expect(
    buildJourney(journeyTrip, [...journeySegments.slice(0, 3), linked], [])
      .connections[0].legs[0].match,
  ).toBe("dates");
});
it("keeps same-day stops and empty trips honest without invented bookings or transport", () => {
  const journey = buildJourney(
    journeyTrip,
    [journeySegment("same day", { end_date: "2027-09-12" })],
    [],
  );
  expect(journey.stops[0]).toMatchObject({
    nights: 0,
    stays: 0,
    activities: 0,
    ideas: 0,
  });
  expect(buildJourney(journeyTrip, [], []).stops).toEqual([]);
  expect(buildJourney(journeyTrip, [], []).connections).toEqual([]);
});
it("uses destination periods as context rather than daily activity entries", () => {
  expect(isDailyEntry(journeySegments[0], "2027-09-13")).toBe(false);
  expect(
    isDailyEntry(journeySegment("plan", { kind: "activity" }), "2027-09-13"),
  ).toBe(true);
  expect(
    isDailyEntry(
      journeySegment("idea", { kind: "activity", status: "idea" }),
      "2027-09-13",
    ),
  ).toBe(false);
});
it("keeps the summary booking projection free of personal/financial/file contents", () => {
  expect(journeyBookingColumns.split(",")).toContain("segment_id");
  expect(journeyBookingColumns).not.toMatch(
    /reference|notes|travelers|price|attachment|path/,
  );
});
it("uses a real wallet journey as a connection and deduplicates an explicitly linked itinerary leg", () => {
  const booking = {
    id: "wallet",
    segment_id: null,
    title: "My saved train booking",
    category: "ground transport" as const,
    start_date: "2027-09-16",
    end_date: "2027-09-16",
    location_id: "tokyo",
    end_location_id: "kyoto",
    verification: "unverified" as const,
  };
  const journey = buildJourney(journeyTrip, journeySegments.slice(0, 3), [
    booking,
  ]);
  expect(journey.connections[0].legs[0].segment).toMatchObject({
    source: "booking",
    bookingId: "wallet",
    status: "Unverified booking",
  });
  expect(
    buildJourney(journeyTrip, journeySegments, [
      { ...booking, segment_id: "train-1" },
    ]).connections[0].legs,
  ).toHaveLength(1);
});
