import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { geographicLocation } from "../../lib/geographic-location";
export const owner = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222";
export async function reviewDatabase() {
  const db = new PGlite();
  await db.exec(`create schema auth;create role authenticated;create role anon;create role service_role;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema public,auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert,delete on storage.objects to authenticated;
 alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;`);
  for (const path of [
    "001_foundation.sql",
    "002_guided_destinations.sql",
    "003_travel_essentials.sql",
    "004_private_booking_files.sql",
    "../upgrade_phase2_to_phase4.sql",
    "010_private_trip_drafts.sql",
    "011_explicit_draft_rpc_permissions.sql",
    "012_booking_collection.sql",
    "013_trip_review_and_finalization.sql",
  ])
    await db.exec(readFileSync("supabase/migrations/" + path, "utf8"));
  await db.query("insert into auth.users(id) values($1),($2)", [owner, other]);
  const act = async (id = owner) =>
    db.exec(
      `reset role;set role authenticated;set request.jwt.claim.sub='${id}'`,
    );
  await act();
  const basics = {
    name: "Paris weekend",
    start_date: "2027-06-01",
    end_date: "2027-06-06",
    destinations: [geographicLocation("Paris", "France", 48.85, 2.35, "FR")],
  };
  const create = async () => {
    const id = crypto.randomUUID();
    await db.query("select save_trip_draft($1,0,$2::jsonb)", [
      id,
      JSON.stringify(basics),
    ]);
    return id;
  };
  const finalize = async (
    id: string,
    revision = 1,
    stamp: unknown[] = [],
    tier = "Comfort",
  ) =>
    (
      await db.query<{
        trip: {
          id: string;
          draft_revision: number;
          creation_state: string;
          theme: string;
          style: string;
          draft_data: Record<string, unknown>;
        };
      }>("select finalize_trip_draft($1,$2,$3,$4::jsonb,$5) trip", [
        id,
        revision,
        tier,
        JSON.stringify(stamp),
        "City Break",
      ])
    ).rows[0].trip;
  return { db, act, create, finalize, basics };
}
