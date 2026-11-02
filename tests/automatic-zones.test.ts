import { it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  segmentLocationValues,
  bookingLocationValues,
} from "../lib/automatic-zones";
import { searchLocations } from "../lib/locations";
function db() {
  const data: Record<string, Record<string, unknown>[]> = {
    trips: [{ id: "trip", timezone: "Europe/Bucharest" }],
    trip_segments: [
      {
        id: "dest",
        trip_id: "trip",
        kind: "destination",
        timezone: "Asia/Tokyo",
        start_date: "2027-05-01",
        end_date: "2027-05-10",
      },
    ],
    bookings: [],
  };
  return {
    from: (table: string) => {
      let rows = [...(data[table] || [])];
      const q = {
        select: () => q,
        eq: (key: string, value: unknown) => {
          rows = rows.filter((r) => r[key] === value);
          return q;
        },
        order: () => q,
        single: async () => ({ data: rows[0] || null }),
        then: (f: (v: unknown) => unknown) =>
          Promise.resolve({ data: rows }).then(f),
      };
      return q;
    },
  } as unknown as SupabaseClient;
}
function form(values: Record<string, string>) {
  const f = new FormData();
  Object.entries({
    trip_id: "trip",
    kind: "activity",
    start_date: "2027-05-02",
    timezone: "America/New_York",
    ...values,
  }).forEach(([k, v]) => f.set(k, v));
  return f;
}
it("ignores a posted timezone and resolves the selected location on the server", async () => {
  const city = searchLocations("Tokyo")[0];
  const values = await segmentLocationValues(
    db(),
    form({ location_id: city.id }),
  );
  expect(values.timezone).toBe("Asia/Tokyo");
  expect(values.latitude).toBe(city.latitude);
});
it("inherits a matching destination when no explicit city is selected", async () => {
  expect(
    (await segmentLocationValues(db(), form({ destination_id: "dest" })))
      .timezone,
  ).toBe("Asia/Tokyo");
});
it("derives arrival zones independently and keeps unknown arrivals unknown", async () => {
  const start = searchLocations("Tokyo")[0],
    end = searchLocations("Sydney")[0];
  const v = await bookingLocationValues(
    db(),
    form({
      category: "flight",
      location_id: start.id,
      end_location_id: end.id,
    }),
  );
  expect(v.timezone).toBe("Asia/Tokyo");
  expect(v.end_timezone).toBe("Australia/Sydney");
  expect(
    (await bookingLocationValues(db(), form({ category: "flight" })))
      .end_timezone,
  ).toBe("");
});
it("rejects unresolved destination locations instead of guessing a country timezone", async () => {
  await expect(
    segmentLocationValues(db(), form({ kind: "destination" })),
  ).rejects.toThrow("Choose");
  await expect(
    segmentLocationValues(db(), form({ location_id: "fake" })),
  ).rejects.toThrow("Choose");
});
