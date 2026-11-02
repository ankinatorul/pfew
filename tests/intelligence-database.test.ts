import { it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
it("persists reviewed decisions, enforces quotas and keeps suggestions separate from plans", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create schema auth;create role authenticated;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema public,auth to authenticated;grant execute on function auth.uid() to authenticated;`,
    );
    for (const file of [
      "001_foundation.sql",
      "002_guided_destinations.sql",
      "003_travel_essentials.sql",
      "005_automatic_locations.sql",
      "006_trip_intelligence.sql",
      "006_trip_intelligence.sql",
    ])
      await db.exec(readFileSync("supabase/migrations/" + file, "utf8"));
    const owner = "11111111-1111-4111-8111-111111111111",
      other = "22222222-2222-4222-8222-222222222222";
    await db.exec(
      `insert into auth.users values('${owner}'),('${other}');set role authenticated;set request.jwt.claim.sub='${owner}'`,
    );
    const trip = (
      await db.query<{ id: string }>(
        `insert into trips(owner_id,name,start_date,end_date,timezone,style,currency) values($1,'Trip','2027-05-01','2027-05-05','UTC','Comfort','EUR') returning id`,
        [owner],
      )
    ).rows[0].id;
    const finding = {
      fingerprint: "a".repeat(64),
      kind: "stay_gap",
      priority: "attention",
      title: "Check stays",
      observation: "No saved stay",
      uncertainty: "May be arranged elsewhere",
      action_view: "stays",
    };
    await db.query("select replace_trip_check($1,$2::jsonb)", [
      trip,
      JSON.stringify([finding]),
    ]);
    const fid = (
      await db.query<{ id: string }>("select id from trip_check_findings")
    ).rows[0].id;
    await db.query(
      `insert into finding_decisions(finding_id,trip_id,decision) values($1,$2,'dismissed')`,
      [fid, trip],
    );
    await db.query("select replace_trip_check($1,$2::jsonb)", [
      trip,
      JSON.stringify([finding]),
    ]);
    expect(
      (await db.query("select * from finding_decisions")).rows,
    ).toHaveLength(1);
    await db.query("select replace_trip_check($1,$2::jsonb)", [trip, "[]"]);
    expect(
      (
        await db.query<{ finding_count: number }>(
          "select finding_count from trip_check_runs",
        )
      ).rows[0].finding_count,
    ).toBe(0);
    const sid = (
      await db.query<{ id: string }>(
        `insert into ai_suggestions(trip_id,title,note,category,source) values($1,'A flexible evening','Sample suggestion','relaxation','mock') returning id`,
        [trip],
      )
    ).rows[0].id;
    expect((await db.query("select * from trip_segments")).rows).toHaveLength(
      0,
    );
    await db.query("select accept_ai_idea($1)", [sid]);
    await db.query("select accept_ai_idea($1)", [sid]);
    expect(
      (await db.query<{ status: string }>("select status from trip_segments"))
        .rows,
    ).toEqual([{ status: "idea" }]);
    await db.exec(
      "reset role;update service_budget_settings set monthly_limit_cents=5,daily_user_requests=3;set role authenticated",
    );
    const reservation = (
      await db.query<{ id: string }>("select reserve_service($1,'ai') id", [
        trip,
      ])
    ).rows[0].id;
    await db.query("select finish_service($1,false)", [reservation]);
    await expect(
      db.query("select reserve_service($1,'places')", [trip]),
    ).rejects.toThrow("Monthly");
    await db.query("select reserve_service($1,'mock')", [trip]);
    await db.query("select reserve_service($1,'mock')", [trip]);
    await expect(
      db.query("select reserve_service($1,'mock')", [trip]),
    ).rejects.toThrow("Daily");
    await db.exec(`set request.jwt.claim.sub='${other}'`);
    for (const table of [
      "trip_check_findings",
      "finding_decisions",
      "trip_check_runs",
      "ai_suggestions",
      "saved_places",
      "service_usage",
    ])
      expect((await db.query("select * from " + table)).rows).toHaveLength(0);
    await expect(
      db.query("select accept_ai_idea($1)", [sid]),
    ).rejects.toThrow();
    await expect(
      db.query("select reserve_service($1,'ai')", [trip]),
    ).rejects.toThrow("permission");
  } finally {
    await db.close();
  }
}, 30000);
