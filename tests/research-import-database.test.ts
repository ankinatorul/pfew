import { it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { schemaProbes } from "../lib/setup-checks";
import { mapBookingColumns } from "../lib/trip-map";
import { journeyBookingColumns } from "../lib/journey";
it("keeps approved imports idempotent and enforces research roles, links and budgets", async () => {
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
      "migrations/009_research_and_booking_imports.sql",
      "migrations/010_trip_onboarding.sql",
    ])
      await db.exec(readFileSync("supabase/" + file, "utf8"));
    const [owner, editor, viewer, stranger] = [1, 2, 3, 4].map(
      (n) => `${n}1111111-1111-4111-8111-111111111111`,
    );
    for (const id of [owner, editor, viewer, stranger])
      await db.query("insert into auth.users values($1,$2,now())", [
        id,
        id + "@example.com",
      ]);
    const act = async (id: string) =>
      db.exec(
        `reset role;set role authenticated;set request.jwt.claim.sub='${id}'`,
      );
    await act(owner);
    expect(
      (
        await db.query(
          `select ${journeyBookingColumns} from public.bookings limit 0`,
        )
      ).rows,
    ).toEqual([]);
    expect(
      (
        await db.query(
          `select ${mapBookingColumns} from public.bookings limit 0`,
        )
      ).rows,
    ).toEqual([]);
    // The production read checker must accept exactly the schema we ship,
    // using ordinary authenticated grants rather than an administrator role.
    for (const probe of schemaProbes)
      expect(
        (
          await db.query(
            `select ${probe.columns} from public.${probe.table} limit 0`,
          )
        ).rows,
      ).toEqual([]);
    const trip = (
      await db.query<{ id: string }>(
        `insert into trips(owner_id,name,start_date,end_date,timezone,style,currency) values($1,'Research trip','2027-05-01','2027-05-10','Asia/Tokyo','Comfort','EUR') returning id`,
        [owner],
      )
    ).rows[0].id;
    const otherTrip = (
      await db.query<{ id: string }>(
        `insert into trips(owner_id,name,start_date,end_date,timezone,style,currency) values($1,'Other trip','2027-05-01','2027-05-10','UTC','Comfort','EUR') returning id`,
        [owner],
      )
    ).rows[0].id;
    for (const [id, role] of [
      [editor, "editor"],
      [viewer, "viewer"],
    ])
      await db.query(
        "insert into trip_members(trip_id,user_id,role) values($1,$2,$3)",
        [trip, id, role],
      );
    const destination = (
      await db.query<{ id: string }>(
        `insert into trip_segments(trip_id,kind,title,start_date,end_date,timezone,status) values($1,'destination','Tokyo','2027-05-01','2027-05-10','Asia/Tokyo','planned') returning id`,
        [trip],
      )
    ).rows[0].id;
    const otherDestination = (
      await db.query<{ id: string }>(
        `insert into trip_segments(trip_id,kind,title,start_date,end_date,timezone,status) values($1,'destination','London','2027-05-01','2027-05-10','Europe/London','planned') returning id`,
        [otherTrip],
      )
    ).rows[0].id;
    const data = {
      title: "Reviewed booking",
      category: "flight",
      provider: "",
      reference: "ABC123",
      start_date: "2027-05-01",
      end_date: "2027-05-01",
      local_time: "",
      timezone: "Asia/Tokyo",
      end_local_time: "",
      end_timezone: "",
      origin: "",
      destination: "",
      travelers: "",
      notes: "",
      price: null,
      paid_amount: null,
      currency: "EUR",
      payment_status: "unknown",
    };
    const token = crypto.randomUUID();
    await act(editor);
    await expect(
      db.query("select save_reviewed_booking($1,$2,'text',false,$3::jsonb)", [
        trip,
        token,
        JSON.stringify(data),
      ]),
    ).rejects.toThrow("approval");
    const saved = (
      await db.query<{ id: string }>(
        "select save_reviewed_booking($1,$2,'text',true,$3::jsonb) id",
        [trip, token, JSON.stringify(data)],
      )
    ).rows[0].id;
    expect(
      (
        await db.query<{ id: string }>(
          "select save_reviewed_booking($1,$2,'text',true,$3::jsonb) id",
          [
            trip,
            token,
            JSON.stringify({ ...data, title: "Should not overwrite" }),
          ],
        )
      ).rows[0].id,
    ).toBe(saved);
    expect(
      (
        await db.query(
          "select title,verification,paid_amount,import_method from bookings",
        )
      ).rows,
    ).toEqual([
      {
        title: "Reviewed booking",
        verification: "user confirmed",
        paid_amount: null,
        import_method: "text",
      },
    ]);
    const context = {
      nationality: "Romanian",
      document: "ordinary passport",
      purpose: "tourism",
      travel_start: "2027-05-01",
      travel_end: "2027-05-10",
    };
    const insert = (dest = destination) =>
      db.query<{ id: string }>(
        `insert into research_notes(trip_id,destination_id,destination_label,source_id,source_name,source_url,retrieved_at,reviewed_at,title,source_excerpt,note,context) values($1,$2,'Tokyo','jp-fcdo','Official source','https://www.gov.uk/foreign-travel-advice/japan/entry-requirements',now(),now(),'Check guidance','Fixture source excerpt for a reviewed note.','Personal note',$3::jsonb) returning id`,
        [trip, dest, JSON.stringify(context)],
      );
    const note = (await insert()).rows[0].id;
    await expect(insert(otherDestination)).rejects.toThrow();
    const task = (
      await db.query<{ id: string }>(
        "select research_note_to_prep($1,$2,'Check applicable guidance',null) id",
        [note, trip],
      )
    ).rows[0].id;
    expect(
      (
        await db.query<{ id: string }>(
          "select research_note_to_prep($1,$2,'Do not duplicate',null) id",
          [note, trip],
        )
      ).rows[0].id,
    ).toBe(task);
    expect((await db.query("select * from prep_tasks")).rows).toHaveLength(1);
    await expect(
      db.query("select research_note_to_prep($1,$2,'Wrong trip',null)", [
        note,
        otherTrip,
      ]),
    ).rejects.toThrow();
    await act(owner);
    await expect(
      db.query(
        `insert into prep_tasks(trip_id,title,category,research_note_id) values($1,'Wrong link','Other',$2)`,
        [otherTrip, note],
      ),
    ).rejects.toThrow("same trip");
    expect(
      JSON.stringify((await db.query("select * from audit_events")).rows),
    ).not.toContain("Fixture source excerpt");
    await db.exec(
      "reset role;update service_budget_settings set daily_user_requests=1;set role authenticated",
    );
    const research = (
      await db.query<{ id: string }>(
        "select reserve_service($1,'research') id",
        [trip],
      )
    ).rows[0].id;
    expect(
      (
        await db.query(
          "select estimated_cents from service_usage where id=$1",
          [research],
        )
      ).rows[0],
    ).toEqual({ estimated_cents: 0 });
    await expect(
      db.query("select reserve_service($1,'research')", [trip]),
    ).rejects.toThrow("Daily");
    await act(viewer);
    expect((await db.query("select * from research_notes")).rows).toHaveLength(
      1,
    );
    expect(
      (
        await db.query(
          `update research_notes set title='Forbidden' returning id`,
        )
      ).rows,
    ).toHaveLength(0);
    await expect(
      db.query("select save_reviewed_booking($1,$2,'ai',true,$3::jsonb)", [
        trip,
        crypto.randomUUID(),
        JSON.stringify(data),
      ]),
    ).rejects.toThrow("permission");
    await expect(
      db.query("select research_note_to_prep($1,$2,'Forbidden',null)", [
        note,
        trip,
      ]),
    ).rejects.toThrow("permission");
    await act(stranger);
    expect((await db.query("select * from research_notes")).rows).toHaveLength(
      0,
    );
    expect((await db.query("select * from bookings")).rows).toHaveLength(0);
    await act(editor);
    await db.query("delete from research_notes where id=$1", [note]);
    expect(
      (await db.query("select research_note_id from prep_tasks")).rows[0],
    ).toEqual({ research_note_id: null });
  } finally {
    await db.close();
  }
}, 30000);
