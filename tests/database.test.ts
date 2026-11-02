import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { it, expect } from "vitest";
it("applies the migration and enforces ownership, child RLS, date constraints and cascades", async () => {
  const db = new PGlite();
  await db.exec(
    `create schema auth;create role authenticated;create role anon;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema public,auth to authenticated;grant execute on function auth.uid() to authenticated;`,
  );
  await db.exec(readFileSync("supabase/migrations/001_foundation.sql", "utf8"));
  await db.exec(
    readFileSync("supabase/migrations/002_guided_destinations.sql", "utf8"),
  );
  const owner = "11111111-1111-4111-8111-111111111111",
    other = "22222222-2222-4222-8222-222222222222";
  await db.exec(
    `insert into auth.users values('${owner}'),('${other}');set role authenticated;set request.jwt.claim.sub='${owner}';`,
  );
  const { rows } = await db.query<{ id: string }>(
    `insert into trips(owner_id,name,start_date,end_date,timezone,style,currency) values($1,'Private escape','2027-01-01','2027-01-05','UTC','Comfort','EUR') returning id`,
    [owner],
  );
  const id = rows[0].id;
  await db.query(
    `insert into trip_segments(trip_id,kind,title,start_date,end_date,timezone) values($1,'stay','My stay','2027-01-01','2027-01-04','UTC')`,
    [id],
  );
  await db.query(
    `insert into trip_hub_preferences(trip_id,layout) values($1,'[{"key":"stays","visible":false}]')`,
    [id],
  );
  expect((await db.query("select * from trip_segments")).rows).toHaveLength(1);
  await expect(
    db.query(`update trips set end_date='2027-01-02' where id=$1`, [id]),
  ).rejects.toThrow("Move segment dates");
  await expect(
    db.query(
      `insert into trip_segments(trip_id,kind,title,start_date,end_date,timezone) values($1,'stay','Outside','2026-01-01','2026-01-04','UTC')`,
      [id],
    ),
  ).rejects.toThrow("Segment dates");
  await db.exec(`set request.jwt.claim.sub='${other}'`);
  for (const table of ["trips", "trip_segments", "trip_hub_preferences"])
    expect((await db.query(`select * from ${table}`)).rows).toHaveLength(0);
  await expect(
    db.query(`insert into trip_hub_preferences(trip_id) values($1)`, [id]),
  ).rejects.toThrow();
  await expect(
    db.query(
      `insert into trip_segments(trip_id,kind,title,start_date,end_date,timezone) values($1,'note','Intrusion','2027-01-01','2027-01-01','UTC')`,
      [id],
    ),
  ).rejects.toThrow();
  expect(
    (
      await db.query(
        `update trips set name='Hijacked' where id=$1 returning id`,
        [id],
      )
    ).rows,
  ).toHaveLength(0);
  await db.exec(`set request.jwt.claim.sub='${owner}'`);
  expect(
    (
      await db.query<{ layout: unknown }>(
        "select layout from trip_hub_preferences",
      )
    ).rows[0].layout,
  ).toEqual([{ key: "stays", visible: false }]);
  await db.query("delete from trips where id=$1", [id]);
  await db.exec("reset role");
  expect((await db.query("select * from trip_segments")).rows).toHaveLength(0);
  expect(
    (await db.query("select * from trip_hub_preferences")).rows,
  ).toHaveLength(0);
  await db.exec("set role anon");
  await expect(db.query("select * from public.trips")).rejects.toThrow();
  await db.exec("reset role");
  await db.close();
}, 20000);
