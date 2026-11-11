import { it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
it("runs the admin inspection read-only before/after Phase 7 and preserves original-field fingerprints across new columns", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create schema auth;create role authenticated;create role anon;create role service_role;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema public,auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert,delete on storage.objects to authenticated;
 alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;`);
    for (const name of [
      "001_foundation.sql",
      "002_guided_destinations.sql",
      "003_travel_essentials.sql",
      "004_private_booking_files.sql",
      "../upgrade_phase2_to_phase4.sql",
    ])
      await db.exec(readFileSync("supabase/migrations/" + name, "utf8"));
    await db.exec(`insert into auth.users(id) values('11111111-1111-4111-8111-111111111111');
 insert into trips(id,owner_id,name,start_date,end_date,timezone,style,currency) values('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','Isolated original trip','2027-01-01','2027-01-02','UTC','Comfort','EUR');
 insert into bookings(trip_id,title,category,start_date,end_date,timezone,currency) values('22222222-2222-4222-8222-222222222222','Isolated original booking','flight','2027-01-01','2027-01-01','UTC','EUR');`);
    await db.exec("grant truncate on public.trips to anon,authenticated");
    const inspect = async () => {
      const results = await db.exec(
        readFileSync("supabase/VERIFY_PHASE7_READ_ONLY.sql", "utf8"),
      );
      const row = results
        .flatMap((r) => r.rows as { phase7_report?: string }[])
        .find((r) => r.phase7_report);
      return JSON.parse(row!.phase7_report!);
    };
    const before = await inspect();
    expect(before.read_only).toBe("on");
    expect(before.truncate_grants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table_name: "trips",
          role_name: "anon",
          can_truncate: true,
        }),
      ]),
    );
    expect(before.columns.every((c: { present: boolean }) => !c.present)).toBe(
      true,
    );
    for (const name of [
      "010_private_trip_drafts.sql",
      "011_explicit_draft_rpc_permissions.sql",
      "012_booking_collection.sql",
      "013_trip_review_and_finalization.sql",
    ])
      await db.exec(readFileSync("supabase/migrations/" + name, "utf8"));
    const after = await inspect();
    expect(after.columns.every((c: { present: boolean }) => c.present)).toBe(
      true,
    );
    expect(
      after.rpcs.every(
        (r: {
          present: boolean;
          anon_execute: boolean;
          authenticated_execute: boolean;
        }) => r.present && !r.anon_execute && r.authenticated_execute,
      ),
    ).toBe(true);
    expect(after.trip_baseline).toEqual(before.trip_baseline);
    expect(after.booking_baseline).toEqual(before.booking_baseline);
    expect(after.attachment_baseline).toEqual(before.attachment_baseline);
    expect(after.booking_files_bucket[0]).toMatchObject({
      public: false,
      file_size_limit: 3145728,
    });
  } finally {
    await db.close();
  }
}, 30000);
