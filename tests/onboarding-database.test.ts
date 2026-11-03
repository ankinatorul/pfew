import { it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
it("creates flight-only trips atomically, preserves private drafts, completes them once and enforces shared AI limits", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create schema auth;create role authenticated;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated;grant execute on function auth.uid() to authenticated;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert,delete on storage.objects to authenticated;`,
    );
    for (const file of [
      "migrations/001_foundation.sql",
      "migrations/002_guided_destinations.sql",
      "migrations/003_travel_essentials.sql",
      "migrations/004_private_booking_files.sql",
      "upgrade_phase2_to_phase4.sql",
      "migrations/010_trip_onboarding.sql",
      "migrations/010_trip_onboarding.sql",
    ])
      await db.exec(readFileSync("supabase/" + file, "utf8"));
    const owner = "11111111-1111-4111-8111-111111111111",
      other = "22222222-2222-4222-8222-222222222222",
      key = "33333333-3333-4333-8333-333333333333",
      draft = "44444444-4444-4444-8444-444444444444";
    await db.query(
      "insert into auth.users values($1,'owner@example.com',now()),($2,'other@example.com',now())",
      [owner, other],
    );
    const act = (id: string) =>
      db.exec(
        `reset role;set role authenticated;set request.jwt.claim.sub='${id}'`,
      );
    await act(owner);
    const trip = {
      name: "Just my flight",
      start_date: "2027-06-12",
      end_date: "2027-06-26",
      timezone: "UTC",
      travelers: 1,
      style: "Comfort",
      currency: "EUR",
      budget: null,
    };
    const flight = {
      title: "My flight",
      category: "flight",
      start_date: "2027-06-12",
      end_date: "2027-06-12",
      timezone: "UTC",
      local_time: "",
      end_local_time: "",
      end_timezone: "",
      provider: "",
      reference: "",
      origin: "",
      destination: "",
      travelers: "",
      notes: "",
      price: null,
      paid_amount: null,
      currency: "EUR",
      payment_status: "unknown",
      verification: "unverified",
    };
    const create = (request = key, bookings = [flight]) =>
      db.query<{ id: string }>(
        "select public.create_onboarding_trip($1,$2::jsonb,'[]',$3::jsonb,$4::jsonb) as id",
        [
          request,
          JSON.stringify(trip),
          JSON.stringify(bookings),
          JSON.stringify({
            interests: ["Nature"],
            pending_bookings: [
              {
                id: draft,
                method: "manual",
                fields: { title: "Unknown stay", reference: "PRIVATE-REF" },
              },
            ],
          }),
        ],
      );
    const id = (await create()).rows[0].id;
    expect((await create()).rows[0].id).toBe(id);
    expect((await db.query("select * from public.trips")).rows).toHaveLength(1);
    expect((await db.query("select * from public.bookings")).rows).toHaveLength(
      1,
    );
    expect(
      (
        await db.query<{ verification: string }>(
          "select verification from public.bookings",
        )
      ).rows[0].verification,
    ).toBe("unverified");
    expect((await db.query("select * from public.trip_segments")).rows).toEqual(
      [],
    );
    await expect(
      create("55555555-5555-4555-8555-555555555555", [
        { ...flight, category: "invalid" },
      ]),
    ).rejects.toThrow();
    expect((await db.query("select * from public.trips")).rows).toHaveLength(1);
    await db.query(
      "insert into public.trip_members(trip_id,user_id,role) values($1,$2,'editor')",
      [id, other],
    );
    await act(other);
    expect((await db.query("select * from public.trips")).rows).toHaveLength(1);
    expect(
      (await db.query("select * from public.trip_onboarding")).rows,
    ).toEqual([]);
    await expect(
      db.query("select public.complete_onboarding_draft($1,$2,$3::jsonb)", [
        id,
        draft,
        JSON.stringify(flight),
      ]),
    ).rejects.toThrow("Private draft unavailable");
    await act(owner);
    const saveDraft = () =>
      db.query<{ id: string }>(
        "select public.complete_onboarding_draft($1,$2,$3::jsonb) as id",
        [
          id,
          draft,
          JSON.stringify({
            ...flight,
            title: "Reviewed stay",
            category: "accommodation",
          }),
        ],
      );
    const saved = (await saveDraft()).rows[0].id;
    expect((await saveDraft()).rows[0].id).toBe(saved);
    expect((await db.query("select * from public.bookings")).rows).toHaveLength(
      2,
    );
    expect(
      (
        await db.query<{ preferences: { pending_bookings: unknown[] } }>(
          "select preferences from public.trip_onboarding",
        )
      ).rows[0].preferences.pending_bookings,
    ).toEqual([]);
    await db.exec(
      "reset role;update public.service_budget_settings set daily_user_requests=1;",
    );
    await act(owner);
    const reservation = (
      await db.query<{ id: string }>(
        "select public.reserve_onboarding_ai() as id",
      )
    ).rows[0].id;
    await expect(
      db.query("select public.reserve_onboarding_ai()"),
    ).rejects.toThrow("Daily request limit reached");
    await db.query("select public.finish_service($1,false)", [reservation]);
    await expect(
      db.query("select public.reserve_service($1,'ai')", [id]),
    ).rejects.toThrow("Daily request limit reached");
  } finally {
    await db.close();
  }
}, 30000);
