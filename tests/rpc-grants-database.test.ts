import { it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { geographicLocation } from "../lib/geographic-location";

it("removes explicit anonymous RPC grants inherited from Supabase defaults while preserving signed-in drafts and ideas", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create schema auth;create role authenticated;create role anon;create role service_role;
      create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema public,auth to authenticated,anon;
      grant execute on function auth.uid() to authenticated,anon;
      create schema storage;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
      alter table storage.objects enable row level security;
      grant usage on schema storage to authenticated;
      grant select,insert,delete on storage.objects to authenticated;
      alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;
    `);
    for (const file of [
      "migrations/001_foundation.sql",
      "migrations/002_guided_destinations.sql",
      "migrations/003_travel_essentials.sql",
      "migrations/004_private_booking_files.sql",
      "upgrade_phase2_to_phase4.sql",
      "migrations/010_private_trip_drafts.sql",
    ])
      await db.exec(readFileSync("supabase/" + file, "utf8"));
    const permissions = () =>
      db.query<{
        anon_draft: boolean;
        anon_idea: boolean;
        user_draft: boolean;
        user_idea: boolean;
        service_draft: boolean;
        unrelated_anon: boolean;
      }>(`
      select has_function_privilege('anon','public.save_trip_draft(uuid,integer,jsonb)','EXECUTE') anon_draft,
      has_function_privilege('anon','public.accept_ai_idea(uuid)','EXECUTE') anon_idea,
      has_function_privilege('authenticated','public.save_trip_draft(uuid,integer,jsonb)','EXECUTE') user_draft,
      has_function_privilege('authenticated','public.accept_ai_idea(uuid)','EXECUTE') user_idea,
      has_function_privilege('service_role','public.save_trip_draft(uuid,integer,jsonb)','EXECUTE') service_draft,
      has_function_privilege('anon','public.create_trip_with_destinations(jsonb,jsonb)','EXECUTE') unrelated_anon
    `);
    expect((await permissions()).rows[0]).toMatchObject({
      anon_draft: true,
      anon_idea: true,
    });
    const correction = readFileSync(
      "supabase/migrations/011_explicit_draft_rpc_permissions.sql",
      "utf8",
    );
    await db.exec(correction);
    await db.exec(correction);
    expect((await permissions()).rows[0]).toEqual({
      anon_draft: false,
      anon_idea: false,
      user_draft: true,
      user_idea: true,
      service_draft: true,
      unrelated_anon: true,
    });
    await db.exec(
      readFileSync("supabase/CHECK_AFTER_010_011_READ_ONLY.sql", "utf8"),
    );
    const owner = "11111111-1111-4111-8111-111111111111",
      other = "22222222-2222-4222-8222-222222222222",
      target = crypto.randomUUID();
    await db.query("insert into auth.users(id) values($1),($2)", [
      owner,
      other,
    ]);
    const basics = JSON.stringify({
      name: "Private dated fixture",
      start_date: "2027-05-01",
      end_date: "2027-05-10",
      destinations: [geographicLocation("Kyoto", "Japan", 35.01, 135.77)],
    });
    await db.exec("set role anon");
    await expect(
      db.query("select save_trip_draft($1,0,$2::jsonb)", [target, basics]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.query("select accept_ai_idea($1)", [crypto.randomUUID()]),
    ).rejects.toThrow(/permission denied/);
    await db.exec(
      `reset role;set role authenticated;set request.jwt.claim.sub='${owner}'`,
    );
    await db.query("select save_trip_draft($1,0,$2::jsonb)", [target, basics]);
    await db.query("select save_trip_draft($1,0,$2::jsonb)", [target, basics]);
    expect(
      (await db.query("select id from trips where creation_state='draft'"))
        .rows,
    ).toEqual([{ id: target }]);
    const trip = (
      await db.query<{ id: string }>(
        "insert into trips(owner_id,name,start_date,end_date,timezone,style,currency) values($1,'Finalized fixture','2027-06-01','2027-06-10','UTC','Comfort','EUR') returning id",
        [owner],
      )
    ).rows[0].id;
    const suggestion = (
      await db.query<{ id: string }>(
        "insert into ai_suggestions(trip_id,title,note,category,source) values($1,'Saved idea','Fixture only','activity','mock') returning id",
        [trip],
      )
    ).rows[0].id;
    await db.query("select accept_ai_idea($1)", [suggestion]);
    expect(
      (
        await db.query("select status from trip_segments where trip_id=$1", [
          trip,
        ])
      ).rows,
    ).toEqual([{ status: "idea" }]);
    await db.exec(`set request.jwt.claim.sub='${other}'`);
    expect(
      (await db.query("select id from trips where id=$1", [target])).rows,
    ).toEqual([]);
    await expect(
      db.query("select save_trip_draft($1,1,$2::jsonb)", [target, basics]),
    ).rejects.toThrow(/unavailable/);
    await expect(
      db.query("select accept_ai_idea($1)", [suggestion]),
    ).rejects.toThrow(/unavailable/);
  } finally {
    await db.close();
  }
}, 30000);
