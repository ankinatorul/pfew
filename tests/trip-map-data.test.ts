import { it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadTripMapData } from "../lib/trip-map-data";
import { overviewTrip, overviewBooking } from "./fixtures/trip-overview";
function client(fail = false) {
  const select = vi.fn(),
    eq = vi.fn();
  const from = vi.fn((table: string) => ({
    select: (fields: string) => {
      select(table, fields);
      return {
        eq: (key: string, value: string) => {
          eq(table, key, value);
          return Promise.resolve({
            data: table === "bookings" ? [overviewBooking()] : [],
            error: fail ? { message: "offline" } : null,
          });
        },
      };
    },
  }));
  return { db: { from } as unknown as SupabaseClient, from, select, eq };
}

it("requests only trip-scoped map fields, never attachments, notes or sharing secrets", async () => {
  const c = client();
  await loadTripMapData(c.db, overviewTrip, []);
  expect(c.from.mock.calls.map((x) => x[0])).toEqual([
    "bookings",
    "saved_places",
  ]);
  for (const [table, fields] of c.select.mock.calls) {
    expect(fields).not.toMatch(
      /\*|notes|secret|token|reference|path|travelers/,
    );
    expect(c.eq).toHaveBeenCalledWith(table, "trip_id", overviewTrip.id);
  }
});
it("overview reuses fetched bookings, marks query failures accurately and never fetches private file metadata", async () => {
  const c = client();
  const m = await loadTripMapData(c.db, overviewTrip, [], [overviewBooking()]);
  expect(m.places).toHaveLength(1);
  expect(c.from.mock.calls.map((x) => x[0])).toEqual(["saved_places"]);
  const failed = await loadTripMapData(client(true).db, overviewTrip, []);
  expect(failed.unavailable).toEqual(["Bookings", "Saved places"]);
});
