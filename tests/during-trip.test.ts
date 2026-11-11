import { it, expect } from "vitest";
import { duringTripPlan } from "../lib/during-trip";
import { tripOverview, tripOverviewPhase } from "../lib/trip-overview";
import {
  duringTrip as trip,
  duringNow as now,
  duringDestination as destination,
  duringActivity as activity,
  duringBooking as booking,
  duringSegments,
  duringData,
} from "./fixtures/during-trip";
import { overviewData } from "./fixtures/trip-overview";

it("shows the whole local day chronologically, including earlier plans, bookings, transport, and untimed entries", () => {
  const result = duringTripPlan(
    trip,
    [
      destination,
      activity(),
      activity({
        id: "transport",
        kind: "transport",
        title: "Saved train",
        local_time: "11:00",
        arrival_time: "12:00",
        arrival_timezone: "UTC",
      }),
      activity({ id: "flexible", local_time: "", title: "Flexible plan" }),
      activity({ id: "idea", status: "idea" }),
      activity({
        id: "tomorrow",
        start_date: "2027-05-04",
        end_date: "2027-05-04",
      }),
    ],
    [booking()],
    now,
  );
  expect(result.items.map((item) => item.id)).toEqual([
    activity().id,
    "transport",
    booking().id,
    "flexible",
  ]);
  expect(result.items[0].status).toBe("Planned activity");
  expect(result.items[1].arrival).toContain("12:00 UTC");
  expect(result.items[2].status).toBe("Booking · status unknown");
  expect(result.items[3].time).toBe("Time not set");
});
it("deduplicates a linked booking/itinerary item and retains a route back to differing itinerary details", () => {
  const same = booking({
    segment_id: activity().id,
    local_time: "09:00",
    end_local_time: "10:00",
  });
  const result = duringTripPlan(trip, [destination, activity()], [same], now);
  expect(result.items).toHaveLength(1);
  expect(result.items[0]).toMatchObject({
    source: "booking",
    linkedMismatch: false,
    linkedDay: "2027-05-03",
  });
  const different = duringTripPlan(
    trip,
    [destination, activity()],
    [booking({ segment_id: activity().id })],
    now,
  );
  expect(different.items).toHaveLength(1);
  expect(different.items[0].linkedMismatch).toBe(true);
  // A linked booking on another day must not hide today's itinerary record.
  expect(
    duringTripPlan(
      trip,
      [destination, activity()],
      [
        booking({
          segment_id: activity().id,
          start_date: "2027-05-04",
          end_date: "2027-05-04",
        }),
      ],
      now,
    ).items[0].source,
  ).toBe("segment");
});
it("supports booking-only days, multi-day saved reservations, and honest empty/unavailable states", () => {
  expect(
    duringTripPlan(trip, [destination], [booking()], now).items,
  ).toHaveLength(1);
  expect(
    duringTripPlan(
      trip,
      [destination],
      [
        booking({
          category: "accommodation",
          start_date: trip.start_date,
          end_date: trip.end_date,
        }),
      ],
      now,
    ).items[0],
  ).toMatchObject({ time: "Spans today", spansToday: true });
  expect(duringTripPlan(trip, [], [], now).items).toEqual([]);
  expect(duringTripPlan(trip, [], null, now)).toMatchObject({
    items: [],
    bookingsAvailable: false,
  });
});
it("uses the active saved destination's timezone and compares actual instants across calendar dates", () => {
  const tokyo = {
    ...destination,
    timezone: "Asia/Tokyo",
    start_date: "2027-05-02",
    end_date: "2027-05-05",
    title: "Saved Tokyo stop",
  };
  const result = duringTripPlan(
    trip,
    [
      tokyo,
      activity({
        start_date: "2027-05-02",
        end_date: "2027-05-02",
        local_time: "18:00",
        timezone: "America/New_York",
      }),
    ],
    [
      booking({
        local_time: "08:00",
        timezone: "Asia/Tokyo",
        end_timezone: "Asia/Tokyo",
        end_local_time: "09:00",
      }),
    ],
    new Date("2027-05-02T23:30:00Z"),
  );
  expect(result).toMatchObject({
    day: "2027-05-03",
    timezone: "Asia/Tokyo",
    destination: "Saved Tokyo stop",
    dayNumber: 3,
  });
  expect(result.items.map((item) => item.time)).toEqual(["07:00", "08:00"]);
  expect(result.items[0].day).toBe("2027-05-02");
});
it("includes overnight travel that overlaps today and shows an ambiguous DST time as needing review", () => {
  const result = duringTripPlan(
    trip,
    [
      destination,
      activity({
        kind: "transport",
        start_date: "2027-05-02",
        end_date: "2027-05-03",
        local_time: "23:00",
        arrival_time: "12:00",
        arrival_timezone: "UTC",
      }),
    ],
    [],
    now,
  );
  expect(result.items[0]).toMatchObject({
    time: "Spans today",
    spansToday: true,
  });
  const dst = duringTripPlan(
    {
      ...trip,
      timezone: "America/New_York",
      start_date: "2027-03-10",
      end_date: "2027-03-20",
    },
    [
      activity({
        start_date: "2027-03-14",
        end_date: "2027-03-14",
        local_time: "02:30",
        timezone: "America/New_York",
      }),
    ],
    [],
    new Date("2027-03-14T12:00:00Z"),
  );
  expect(dst.items[0]).toMatchObject({
    time: "Time needs checking",
    start: null,
    timeUncertain: true,
  });
});
it("handles local days with skipped midnight and ignores invalid destination zones", () => {
  const result = duringTripPlan(
    {
      ...trip,
      timezone: "America/Santiago",
      start_date: "2027-09-01",
      end_date: "2027-09-10",
    },
    [
      activity({
        start_date: "2027-09-05",
        end_date: "2027-09-05",
        timezone: "America/Santiago",
      }),
      { ...destination, timezone: "Invalid/Zone" },
    ],
    [],
    new Date("2027-09-05T16:00:00Z"),
  );
  expect(result.timezone).toBe("America/Santiago");
  expect(result.items).toHaveLength(1);
});
it("offers only saved ideas explicitly associated with today's saved destination", () => {
  const result = duringTripPlan(
    trip,
    [
      ...duringSegments,
      activity({
        id: "unrelated",
        status: "idea",
        destination_id: "another-stop",
      }),
    ],
    [],
    now,
  );
  expect(result.ideas).toEqual([
    { id: "77777777-7777-4777-8777-777777777777", title: "An idea I saved" },
  ]);
  expect(
    duringTripPlan(trip, [activity({ status: "idea" })], [], now).ideas,
  ).toEqual([]);
});
it("uses saved trip timezone boundaries for lifecycle, recomputes edited dates, and never guesses incomplete or open-ended status", () => {
  const edge = new Date("2027-05-01T00:30:00Z");
  expect(
    tripOverviewPhase({ ...trip, timezone: "America/Los_Angeles" }, edge),
  ).toBe("upcoming");
  expect(tripOverviewPhase({ ...trip, timezone: "Asia/Tokyo" }, edge)).toBe(
    "traveling",
  );
  expect(
    tripOverviewPhase(
      { ...trip, start_date: "2027-06-01", end_date: "2027-06-10" },
      now,
    ),
  ).toBe("upcoming");
  for (const change of [
    { start_date: "" },
    { end_date: "" },
    { end_date: "2027-04-01" },
    { timezone: "Invalid/Zone" },
    { start_date: "2027-02-30" },
  ])
    expect(tripOverviewPhase({ ...trip, ...change }, now)).toBe("unknown");
  expect(tripOverviewPhase({ ...trip, end_date: "2027-05-02" }, now)).toBe(
    "past",
  );
});
it("keeps the same module summaries, defaults ongoing navigation to today, and does not emit preparation suggestions", () => {
  const before = tripOverview(
    trip,
    duringSegments,
    duringData(),
    new Date("2027-04-25"),
  );
  const live = tripOverview(
    trip,
    duringSegments,
    duringData(),
    now,
    "2027-05-01",
  );
  expect(live.dates.day).toBe("2027-05-03");
  expect(live.dates.countdown).toBeNull();
  expect(live.suggestions).toEqual([]);
  for (const key of [
    "bookings",
    "itinerary",
    "packing",
    "documents",
    "budget",
  ] as const)
    expect(live[key]).toEqual(before[key]);
  expect(
    tripOverview({ ...trip, end_date: "" }, [], overviewData(), now).during,
  ).toBeNull();
});
it("does not mutate saved trip, itinerary or bookings while producing today's view", () => {
  const input = { trip, segments: duringSegments, bookings: [booking()] };
  const original = structuredClone(input);
  duringTripPlan(input.trip, input.segments, input.bookings, now);
  expect(input).toEqual(original);
});
