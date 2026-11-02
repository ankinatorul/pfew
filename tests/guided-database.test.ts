import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { it, expect } from "vitest";
it("atomically creates destinations and enforces same-trip links without losing independent stays", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create schema auth;create role authenticated;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema public,auth to authenticated;grant execute on function auth.uid() to authenticated;`,
    );
    await db.exec(
      readFileSync("supabase/migrations/001_foundation.sql", "utf8"),
    );
    // Simulate a manual setup which already added the column but not its FK.
    await db.exec(
      "alter table public.trip_segments add column destination_id uuid",
    );
    const migration = readFileSync(
      "supabase/migrations/002_guided_destinations.sql",
      "utf8",
    );
    await db.exec(migration);
    const owner = "11111111-1111-4111-8111-111111111111";
    await db.exec(
      `insert into auth.users values('${owner}');set role authenticated;set request.jwt.claim.sub='${owner}';`,
    );
    const trip = {
      name: "Japan",
      start_date: "2027-05-01",
      end_date: "2027-05-10",
      timezone: "Asia/Tokyo",
      travelers: 2,
      style: "Comfort",
      currency: "EUR",
      budget: null,
    };
    const destinations = [
      {
        title: "Tokyo",
        start_date: "2027-05-01",
        end_date: "2027-05-05",
        timezone: "Asia/Tokyo",
      },
      {
        title: "Kyoto",
        start_date: "2027-05-05",
        end_date: "2027-05-10",
        timezone: "Asia/Tokyo",
      },
    ];
    const result = await db.query<{ id: string }>(
      "select public.create_trip_with_destinations($1::jsonb,$2::jsonb) id",
      [JSON.stringify(trip), JSON.stringify(destinations)],
    );
    const id = result.rows[0].id;
    const { rows } = await db.query<{ id: string }>(
      "select id from trip_segments where trip_id=$1 order by start_date",
      [id],
    );
    expect(rows).toHaveLength(2);
    // A later destination failure must roll back the trip and earlier valid destination.
    await expect(
      db.query(
        "select public.create_trip_with_destinations($1::jsonb,$2::jsonb)",
        [
          JSON.stringify(trip),
          JSON.stringify([
            ...destinations,
            { ...destinations[0], end_date: "2027-06-01" },
          ]),
        ],
      ),
    ).rejects.toThrow("Segment dates");
    expect((await db.query("select * from trips")).rows).toHaveLength(1);
    expect((await db.query("select * from trip_segments")).rows).toHaveLength(
      2,
    );
    for (const title of ["Hotel one", "Hotel two"])
      await db.query(
        `insert into trip_segments(trip_id,destination_id,kind,title,start_date,end_date,timezone) values($1,$2,'stay',$3,'2027-05-01','2027-05-03','Asia/Tokyo')`,
        [id, rows[0].id, title],
      );
    expect(
      (
        await db.query("select * from trip_segments where destination_id=$1", [
          rows[0].id,
        ])
      ).rows,
    ).toHaveLength(2);
    // Reapplying the complete migration must preserve rows and destination links.
    await db.exec("reset role");
    await db.exec(migration);
    await db.exec("set role authenticated");
    expect((await db.query("select * from trips")).rows).toHaveLength(1);
    expect((await db.query("select * from trip_segments")).rows).toHaveLength(
      4,
    );
    expect(
      (
        await db.query("select * from trip_segments where destination_id=$1", [
          rows[0].id,
        ])
      ).rows,
    ).toHaveLength(2);
    const another = await db.query<{ id: string }>(
      "select public.create_trip_with_destinations($1::jsonb) id",
      [JSON.stringify({ ...trip, name: "Another trip" })],
    );
    await expect(
      db.query(
        `insert into trip_segments(trip_id,destination_id,kind,title,start_date,end_date,timezone) values($1,$2,'stay','Wrong trip','2027-05-01','2027-05-03','Asia/Tokyo')`,
        [another.rows[0].id, rows[0].id],
      ),
    ).rejects.toThrow("same trip");
    await expect(
      db.query(`update trip_segments set kind='activity' where id=$1`, [
        rows[0].id,
      ]),
    ).rejects.toThrow("Unlink destination");
    await db.query("delete from trip_segments where id=$1", [rows[0].id]);
    const stays = await db.query<{ destination_id: string | null }>(
      "select destination_id from trip_segments where kind='stay'",
    );
    expect(stays.rows).toEqual([
      { destination_id: null },
      { destination_id: null },
    ]);
    await expect(
      db.query("update trips set timezone='Wrong/Zone' where id=$1", [id]),
    ).rejects.toThrow();
    // Deleting a whole trip also works when linked destination/stay records exist.
    await db.query(
      "update trip_segments set destination_id=$1 where kind='stay'",
      [rows[1].id],
    );
    await db.query("delete from trips where id=$1", [id]);
    expect(
      (await db.query("select * from trip_segments where trip_id=$1", [id]))
        .rows,
    ).toHaveLength(0);
  } finally {
    await db.close();
  }
}, 20000);
