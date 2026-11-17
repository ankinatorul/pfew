import { it, expect } from "vitest";
import { reusableLinkFixture } from "./fixtures/reusable-link-database";
import { other } from "./fixtures/review-database";
import { overviewBooking } from "./fixtures/trip-overview";
import { geographicLocation } from "../lib/geographic-location";
import { tripMapData } from "../lib/trip-map";
import type { Trip } from "../lib/domain";
import type { Booking } from "../lib/essentials";
it("an Editor saves manual and matched Places on the same shared booking, with no invented map pin or private-file changes", async () => {
  const f = await reusableLinkFixture(true, false),
    { db, act, trip, third } = f;
  try {
    await act(other);
    const id = crypto.randomUUID();
    const manual = {
      ...overviewBooking({
        id,
        trip_id: trip,
        category: "accommodation",
        title: "Our family stay",
        start_date: "2027-06-01",
        end_date: "2027-06-03",
      }),
      location_id: null,
      location_label: "A private cottage",
      latitude: null,
      longitude: null,
      destination: "Custom entrance instructions",
    };
    await db.query("select save_managed_booking($1,$2,0,$3::jsonb)", [
      trip,
      id,
      JSON.stringify(manual),
    ]);
    let b = (
      await db.query<Booking>("select * from bookings where id=$1", [id])
    ).rows[0];
    const t = (await db.query<Trip>("select * from trips where id=$1", [trip]))
      .rows[0];
    expect(tripMapData(t, [], [b], []).places[0].coordinates).toBeNull();
    const point = geographicLocation(
      "Selected hotel",
      "Paris, France",
      48.86,
      2.33,
      "FR",
      "osm:N:123",
    );
    await db.query("select save_managed_booking($1,$2,0,$3::jsonb)", [
      trip,
      id,
      JSON.stringify({
        ...manual,
        location_id: point.id,
        location_label: point.label,
        latitude: point.latitude,
        longitude: point.longitude,
      }),
    ]);
    await act();
    b = (await db.query<Booking>("select * from bookings where id=$1", [id]))
      .rows[0];
    expect(b).toMatchObject({
      id,
      title: "Our family stay",
      destination: "Custom entrance instructions",
      location_id: point.id,
    });
    const map = tripMapData(t, [], [b], []);
    expect(map.places).toHaveLength(1);
    expect(map.places[0].coordinates).toEqual([2.33, 48.86]);
    expect(
      (
        await db.query(
          "select count(*)::int n from booking_attachments where trip_id=$1",
          [trip],
        )
      ).rows[0],
    ).toEqual({ n: 1 });
    await act(third);
    expect(
      (await db.query("select id from bookings where id=$1", [id])).rows,
    ).toHaveLength(0);
    await expect(
      db.query("select save_managed_booking($1,$2,1,$3::jsonb)", [
        trip,
        id,
        JSON.stringify(manual),
      ]),
    ).rejects.toThrow(/permission/);
  } finally {
    await db.close();
  }
}, 30000);
