import { it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { searchLocations, resolveLocation } from "../lib/locations";
import { geographicLocation } from "../lib/geographic-location";
import { locationFields } from "../lib/automatic-zones";
it("saves resolved destinations atomically and keeps trip reference time synchronized", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create schema auth;create role authenticated;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema public,auth to authenticated;grant execute on function auth.uid() to authenticated;`,
    );
    for (const name of [
      "001_foundation.sql",
      "002_guided_destinations.sql",
      "003_travel_essentials.sql",
      "005_automatic_locations.sql",
      "005_automatic_locations.sql",
    ])
      await db.exec(readFileSync("supabase/migrations/" + name, "utf8"));
    const owner = "11111111-1111-4111-8111-111111111111";
    await db.exec(
      `insert into auth.users values('${owner}');set role authenticated;set request.jwt.claim.sub='${owner}'`,
    );
    const tokyo = searchLocations("Tokyo")[0],
      sydney = searchLocations("Sydney")[0];
    const trip = {
      name: "Across zones",
      start_date: "2027-05-01",
      end_date: "2027-05-10",
      timezone: "UTC",
      travelers: 1,
      style: "Comfort",
      currency: "EUR",
      budget: null,
    };
    const d = (location: typeof tokyo, start: string, end: string) => ({
      title: location.label,
      start_date: start,
      end_date: end,
      timezone: location.timezone,
      ...locationFields(location),
    });
    const { rows } = await db.query<{ id: string }>(
      "select create_trip_with_destinations($1::jsonb,$2::jsonb) id",
      [
        JSON.stringify(trip),
        JSON.stringify([
          d(sydney, "2027-05-06", "2027-05-10"),
          d(tokyo, "2027-05-01", "2027-05-06"),
        ]),
      ],
    );
    expect(
      (
        await db.query<{ timezone: string }>(
          "select timezone from trips where id=$1",
          [rows[0].id],
        )
      ).rows[0].timezone,
    ).toBe("Asia/Tokyo");
    expect(
      (
        await db.query(
          "select latitude,longitude,location_id from trip_segments where location_id=$1",
          [tokyo.id],
        )
      ).rows,
    ).toHaveLength(1);
    const destination = (
      await db.query<{ id: string }>(
        "select id from trip_segments where location_id=$1",
        [tokyo.id],
      )
    ).rows[0].id;
    await db.query(
      `insert into trip_segments(trip_id,destination_id,kind,title,start_date,end_date,timezone,status) values($1,$2,'stay','Linked stay','2027-05-01','2027-05-03','Asia/Tokyo','planned')`,
      [rows[0].id, destination],
    );
    await db.query(
      `insert into bookings(trip_id,segment_id,title,category,start_date,end_date,timezone,end_timezone,currency) values($1,$2,'Linked booking','accommodation','2027-05-01','2027-05-03','Asia/Tokyo','Asia/Tokyo','EUR')`,
      [rows[0].id, destination],
    );
    await db.query(
      `update trip_segments set timezone='Europe/Bucharest' where id=$1`,
      [destination],
    );
    expect(
      (
        await db.query<{ timezone: string }>(
          "select timezone from trip_segments where title='Linked stay'",
        )
      ).rows[0].timezone,
    ).toBe("Europe/Bucharest");
    expect(
      (
        await db.query<{ timezone: string; end_timezone: string }>(
          "select timezone,end_timezone from bookings",
        )
      ).rows[0],
    ).toEqual({
      timezone: "Europe/Bucharest",
      end_timezone: "Europe/Bucharest",
    });
    await db.query("delete from trip_segments where location_id=$1", [
      tokyo.id,
    ]);
    expect(
      (
        await db.query<{ timezone: string }>(
          "select timezone from trips where id=$1",
          [rows[0].id],
        )
      ).rows[0].timezone,
    ).toBe("Australia/Sydney");
    await db.query("delete from trips where id=$1", [rows[0].id]);
    expect((await db.query("select * from trip_segments")).rows).toHaveLength(
      0,
    );
    const islands = [
      geographicLocation("Koh Phangan", "Thailand", 9.73, 100.01),
      geographicLocation("Koh Tao", "Thailand", 10.1, 99.84),
    ];
    await db.query(
      "select create_trip_with_destinations($1::jsonb,$2::jsonb)",
      [
        JSON.stringify({ ...trip, name: "Thai islands" }),
        JSON.stringify([
          d(islands[0], "2027-05-01", "2027-05-05"),
          d(islands[1], "2027-05-05", "2027-05-10"),
        ]),
      ],
    );
    const saved = (
      await db.query<{ location_id: string; timezone: string }>(
        "select location_id,timezone from trip_segments order by start_date",
      )
    ).rows;
    expect(saved.map((row) => resolveLocation(row.location_id)?.city)).toEqual([
      "Koh Phangan",
      "Koh Tao",
    ]);
    expect(saved.map((row) => row.timezone)).toEqual([
      "Asia/Bangkok",
      "Asia/Bangkok",
    ]);
  } finally {
    await db.close();
  }
}, 25000);
