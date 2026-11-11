import { describe, it, expect } from "vitest";
import {
  activityInput,
  activityValues,
  activityEnd,
  dateRange,
  destinationForDay,
  itineraryDestinations,
  dailyItinerary,
  itineraryAIContext,
} from "../lib/itinerary";
import {
  overviewTrip,
  overviewSegment,
  overviewBooking,
} from "./fixtures/trip-overview";
import { suggestionsSchema } from "../lib/ai";
const trip = {
  ...overviewTrip,
  start_date: "2027-06-01",
  end_date: "2027-06-06",
};
const input = {
  id: crypto.randomUUID(),
  revision: 0,
  title: "A walk",
  day: "2027-06-01",
  start: "",
  end: "",
  location: "",
  notes: "",
  category: "" as const,
  destination: "",
};
describe("itinerary model", () => {
  it("windows long trips, validates dates and never assigns a legacy missing date", () => {
    expect(
      dateRange({ ...trip, end_date: "2047-06-01" }, "2040-01-01")?.days,
    ).toHaveLength(7);
    expect(dateRange(trip, "bad")?.day).toBe(trip.start_date);
    expect(dateRange({ ...trip, start_date: "" })).toBeNull();
    expect(dateRange({ ...trip, end_date: "2027-05-30" })).toBeNull();
    expect(dateRange({ ...trip, start_date: "2027-02-30" })).toBeNull();
  });
  it("requires names and real in-range dates with optional times and strict same-day ends", () => {
    expect(activityInput.safeParse({ ...input, title: "" }).success).toBe(
      false,
    );
    expect(activityInput.safeParse({ ...input, end: "12:00" }).success).toBe(
      false,
    );
    expect(
      activityInput.safeParse({ ...input, start: "13:00", end: "12:00" })
        .success,
    ).toBe(false);
    expect(activityInput.safeParse({ ...input, start: "25:00" }).success).toBe(
      false,
    );
    expect(() =>
      activityValues({ ...input, day: "2027-06-07" }, trip, []),
    ).toThrow("within");
    expect(activityValues(input, trip, []).duration_minutes).toBeNull();
    expect(
      activityValues({ ...input, start: "10:00", end: "11:30" }, trip, [])
        .duration_minutes,
    ).toBe(90);
  });
  it("rejects skipped and ambiguous local times rather than guessing a DST occurrence", () => {
    const dst = {
      ...trip,
      start_date: "2027-01-01",
      end_date: "2027-12-31",
      timezone: "Europe/Paris",
    };
    expect(() =>
      activityValues({ ...input, day: "2027-03-28", start: "02:30" }, dst, []),
    ).toThrow();
    expect(() =>
      activityValues({ ...input, day: "2027-10-31", start: "02:30" }, dst, []),
    ).toThrow();
    const acrossChange = activityValues(
      { ...input, day: "2027-03-28", start: "01:30", end: "03:30" },
      dst,
      [],
    );
    expect(acrossChange.duration_minutes).toBe(60);
    expect(
      activityEnd(
        overviewSegment({
          kind: "activity",
          start_date: "2027-03-28",
          end_date: "2027-03-28",
          local_time: "01:30",
          timezone: "Europe/Paris",
          duration_minutes: 60,
        }),
      ),
    ).toBe("03:30");
  });
  it("retains destination order without allocating undated stops to days", () => {
    const first = {
        id: "place-one",
        label: "Paris, France",
        city: "Paris",
        country: "France",
        latitude: 48.85,
        longitude: 2.35,
        timezone: "Europe/Paris",
        source: "coordinates",
      },
      second = {
        ...first,
        id: "place-two",
        label: "Rome, Italy",
        city: "Rome",
        country: "Italy",
        timezone: "Europe/Rome",
      };
    const multi = { ...trip, draft_data: { destinations: [first, second] } };
    expect(itineraryDestinations(multi, []).map((d) => d.id)).toEqual([
      "place-one",
      "place-two",
    ]);
    expect(destinationForDay(multi, [], "2027-06-01")).toBeNull();
    expect(
      activityValues({ ...input, destination: "place-two" }, multi, [])
        .timezone,
    ).toBe("Europe/Rome");
    expect(() =>
      activityValues({ ...input, destination: "wrong" }, multi, []),
    ).toThrow();
    const dated = overviewSegment({
      start_date: trip.start_date,
      end_date: trip.end_date,
    });
    expect(destinationForDay(multi, [dated], trip.start_date)?.id).toBe(
      dated.id,
    );
    expect(
      destinationForDay(
        multi,
        [dated, { ...dated, id: crypto.randomUUID() }],
        trip.start_date,
      ),
    ).toBeNull();
  });
  it("sorts times and untimed position separately, folds linked bookings into their plan and preserves review distinctions", () => {
    const a = overviewSegment({
      kind: "activity",
      start_date: trip.start_date,
      end_date: trip.start_date,
      local_time: "10:00",
      duration_minutes: 90,
    });
    const b = {
      ...a,
      id: crypto.randomUUID(),
      title: "Second",
      local_time: "10:30",
      duration_minutes: 45,
    };
    const untimed = {
      ...a,
      id: crypto.randomUUID(),
      local_time: "",
      position: 2,
    };
    const booking = overviewBooking({
      start_date: trip.start_date,
      end_date: trip.start_date,
      segment_id: a.id,
      verification: "unverified",
      reservation_status: "confirmed",
    });
    const model = dailyItinerary(
      trip,
      [b, untimed, a],
      [booking],
      trip.start_date,
    );
    expect(model.timed.map((s) => s.id)).toEqual([a.id, b.id]);
    expect(model.untimed).toEqual([untimed]);
    expect(model.standalone).toEqual([]);
    expect(model.relevant[0].verification).toBe("unverified");
    expect(model.warnings.join(" ")).toContain("overlap");
    expect(activityEnd(a)).toBe("11:30");
  });
  it("does not invent gaps or overlaps for an unknown end and skips undated bookings", () => {
    const a = overviewSegment({
      kind: "activity",
      start_date: trip.start_date,
      end_date: trip.start_date,
      local_time: "10:00",
    });
    const model = dailyItinerary(
      trip,
      [a],
      [overviewBooking({ start_date: "", end_date: "" })],
      trip.start_date,
    );
    expect(model.gaps).toEqual([]);
    expect(model.warnings).toEqual([]);
    expect(model.undatedBookings).toBe(1);
  });
  it.each([
    ["Budget", "Budget"],
    ["Comfort", "Balanced"],
    ["Luxury", "Premium"],
  ] as const)(
    "uses stored %s as %s preference without changing budget or booking records",
    (style, label) => {
      const booking = overviewBooking({
        reference: "PRIVATE",
        notes: "PRIVATE",
        start_date: trip.start_date,
        end_date: trip.start_date,
      });
      const ctx = itineraryAIContext(
        { ...trip, style },
        [],
        [booking],
        trip.start_date,
        "",
        "Quiet walks",
      );
      expect(ctx.style).toBe(label);
      expect(ctx.selectedDay).toBe(trip.start_date);
      expect(ctx.budget).toBe(trip.budget);
      expect(JSON.stringify(ctx)).not.toContain("PRIVATE");
    },
  );
  it("accepts an honest empty provider result", () =>
    expect(suggestionsSchema.parse({ suggestions: [] })).toEqual({
      suggestions: [],
    }));
});
