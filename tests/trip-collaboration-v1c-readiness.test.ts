import { it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { geographicLocation } from "../lib/geographic-location";

it("replays numbered 001–018 before 019, preserves finalized records, and rolls back an accidental 019 replay", async () => {
  const db = new PGlite();
  const owner = "11111111-1111-4111-8111-111111111111";
  try {
    await db.exec(`
      create schema auth; create role authenticated; create role anon; create role service_role;
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
    const files = readdirSync("supabase/migrations")
      .filter((name) => /^0(0[1-9]|1[0-8])_/.test(name))
      .sort();
    expect(files).toHaveLength(18);
    for (const file of files)
      await db.exec(readFileSync("supabase/migrations/" + file, "utf8"));
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at) values($1,'owner@example.com',now())",
      [owner],
    );
    await db.exec(
      `set role authenticated; set request.jwt.claim.sub='${owner}'`,
    );
    const id = crypto.randomUUID();
    const basics = {
      name: "Release audit fixture",
      start_date: "2027-06-01",
      end_date: "2027-06-03",
      destinations: [geographicLocation("Paris", "France", 48.85, 2.35, "FR")],
    };
    await db.query("select save_trip_draft($1,0,$2::jsonb)", [
      id,
      JSON.stringify(basics),
    ]);
    await db.query(
      "select finalize_trip_draft($1,1,'Comfort','[]'::jsonb,'Default')",
      [id],
    );
    const before = (
      await db.query("select to_jsonb(t) t from public.trips t where id=$1", [
        id,
      ])
    ).rows;
    await db.exec("reset role");
    const sql = readFileSync(
      "supabase/migrations/019_trip_collaboration_v1a.sql",
      "utf8",
    );
    await db.exec(
      readFileSync("supabase/VERIFY_COLLABORATION_V1C_READ_ONLY.sql", "utf8"),
    );
    await db.exec(sql);
    expect(
      (
        await db.query(
          "select proname,md5(prosrc) body_hash from pg_proc where pronamespace='public'::regnamespace and proname in ('save_managed_booking','managed_booking_editor_version','preview_trip_invitation') order by proname",
        )
      ).rows,
    ).toEqual([
      {
        proname: "managed_booking_editor_version",
        body_hash: "6ebceba1516d1b8c52d508dc3039fc26",
      },
      {
        proname: "preview_trip_invitation",
        body_hash: "1acfdb9b9ed5425c829bf71ca9a86593",
      },
      {
        proname: "save_managed_booking",
        body_hash: "6217a62c84105de7f3c97f9b6fbba144",
      },
    ]);
    expect(
      (
        await db.query(
          "select to_jsonb(t)-'trip_revision' t from public.trips t where id=$1",
          [id],
        )
      ).rows,
    ).toEqual(before);
    await expect(db.exec(sql)).rejects.toThrow(/already exists/);
    await db.exec("rollback");
    expect(
      (await db.query("select collaboration_version() version")).rows,
    ).toEqual([{ version: 1 }]);
    expect(
      (
        await db.query(
          "select to_jsonb(t)-'trip_revision' t from public.trips t where id=$1",
          [id],
        )
      ).rows,
    ).toEqual(before);
    await db.exec(
      readFileSync("supabase/VERIFY_COLLABORATION_V1A_READ_ONLY.sql", "utf8"),
    );
    await db.exec(
      readFileSync("supabase/VERIFY_COLLABORATION_V1C_READ_ONLY.sql", "utf8"),
    );
  } finally {
    await db.close();
  }
}, 30000);
