import { it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import {
  emptyCollectionEntry,
  type CollectionEntry,
} from "../lib/booking-collection";
import { geographicLocation } from "../lib/geographic-location";

it("persists owner-private unfinished booking collection, retains files and materializes reviewed details without confirming reservations", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create schema auth;create role authenticated;create role anon;create role service_role;
   create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema public,auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;
   create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
   alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert,delete on storage.objects to authenticated;
   alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;`);
    for (const file of [
      "migrations/001_foundation.sql",
      "migrations/002_guided_destinations.sql",
      "migrations/003_travel_essentials.sql",
      "migrations/004_private_booking_files.sql",
      "upgrade_phase2_to_phase4.sql",
      "migrations/010_private_trip_drafts.sql",
      "migrations/011_explicit_draft_rpc_permissions.sql",
    ])
      await db.exec(readFileSync("supabase/" + file, "utf8"));
    const owner = "11111111-1111-4111-8111-111111111111",
      other = "22222222-2222-4222-8222-222222222222";
    await db.query("insert into auth.users(id) values($1),($2)", [
      owner,
      other,
    ]);
    const act = async (id: string) =>
      db.exec(
        `reset role;set role authenticated;set request.jwt.claim.sub='${id}'`,
      );
    await act(owner);
    const finalized = (
      await db.query<{ id: string }>(
        "insert into trips(owner_id,name,start_date,end_date,timezone,style,currency) values($1,'Existing finalized trip','2027-05-01','2027-05-10','UTC','Comfort','EUR') returning id",
        [owner],
      )
    ).rows[0].id;
    await db.query(
      "insert into trip_members(trip_id,user_id,role) values($1,$2,'editor')",
      [finalized, other],
    );
    await db.query(
      "insert into bookings(trip_id,title,category,start_date,end_date,timezone,currency,verification) values($1,'Existing reviewed booking','flight','2027-05-01','2027-05-01','UTC','EUR','user confirmed')",
      [finalized],
    );
    const before = (
      await db.query("select to_jsonb(b) original from bookings b")
    ).rows;
    await db.exec("reset role");
    const sql = readFileSync(
      "supabase/migrations/012_booking_collection.sql",
      "utf8",
    );
    await db.exec(sql);
    await db.exec(sql);
    await act(owner);
    expect(
      (
        await db.query(
          "select to_jsonb(b)-'reservation_status' original from bookings b",
        )
      ).rows,
    ).toEqual(before);
    expect(
      (await db.query("select reservation_status from bookings")).rows,
    ).toEqual([{ reservation_status: "unknown" }]);
    await db.exec("reset role");
    const inspection = readFileSync(
      "supabase/VERIFY_PHASE11A1_READ_ONLY.sql",
      "utf8",
    );
    const inspect = async () =>
      JSON.parse(
        String(
          (await db.exec(inspection))
            .flatMap((r) => r.rows)
            .find((r) => r.phase11a1_report)!.phase11a1_report,
        ),
      );
    const deadlineBefore = await inspect();
    const deadlineSQL = readFileSync(
      "supabase/migrations/017_booking_payment_due.sql",
      "utf8",
    );
    await db.exec(deadlineSQL);
    await db.exec(deadlineSQL);
    const deadlineAfter = await inspect();
    expect(deadlineAfter.booking_baseline).toEqual(
      deadlineBefore.booking_baseline,
    );
    expect(deadlineBefore.payment_due_date).toBeNull();
    expect(deadlineAfter.payment_due_date).toEqual({
      type: "date",
      not_null: false,
    });
    expect(deadlineAfter.routine).toMatchObject({
      security_definer: false,
      anon_execute: false,
    });
    expect(
      (await db.query("select payment_due_date from bookings")).rows,
    ).toEqual([{ payment_due_date: null }]);
    await act(owner);
    const trip = crypto.randomUUID(),
      secondTrip = crypto.randomUUID();
    const basics = JSON.stringify({
      name: "Private fixture",
      start_date: "2027-05-01",
      end_date: "2027-05-10",
      destinations: [geographicLocation("Kyoto", "Japan", 35, 135)],
    });
    for (const id of [trip, secondTrip])
      await db.query("select save_trip_draft($1,0,$2::jsonb)", [id, basics]);
    await db.query(
      "insert into trip_onboarding(trip_id,owner_id,request_id,preferences) values($1,$2,$1,'{\"keep_existing\":true}')",
      [trip, owner],
    );
    const save = async (target: string, entry: CollectionEntry) =>
      (
        await db.query<{ entry: CollectionEntry }>(
          "select save_booking_intake($1,$2,$3,$4::jsonb) entry",
          [target, entry.id, entry.revision, JSON.stringify(entry)],
        )
      ).rows[0].entry;
    const initial = emptyCollectionEntry(crypto.randomUUID());
    let entry = await save(trip, initial);
    expect(await save(trip, initial)).toEqual(entry);
    await save(trip, emptyCollectionEntry(crypto.randomUUID()));
    expect(
      (
        await db.query(
          "select preferences->'keep_existing' kept,jsonb_array_length(preferences->'pending_bookings') count from trip_onboarding where trip_id=$1",
          [trip],
        )
      ).rows,
    ).toEqual([{ kept: true, count: 2 }]);
    expect(
      (
        await db.query("select trip_id from trip_onboarding where trip_id=$1", [
          secondTrip,
        ])
      ).rows,
    ).toEqual([]);
    await expect(
      save(trip, { ...initial, fields: { title: "Stale" } }),
    ).rejects.toThrow(/another tab/);
    const attachment = crypto.randomUUID(),
      checksum = "a".repeat(64),
      path = [owner, trip, entry.id, attachment].join("/");
    entry = await save(trip, {
      ...entry,
      fields: { title: "Reliable title" },
      source: {
        attachment_id: attachment,
        filename: "source.pdf",
        size: 100,
        content_type: "application/pdf",
        checksum,
      },
    });
    await db.query(
      "insert into booking_attachments(id,trip_id,booking_id,intake_id,owner_id,path,filename,content_type,size,content_sha256,state) values($1,$2,null,$3,$4,$5,'source.pdf','application/pdf',100,$6,'pending')",
      [attachment, trip, entry.id, owner, path, checksum],
    );
    await expect(
      db.query("update booking_attachments set state='ready' where id=$1", [
        attachment,
      ]),
    ).rejects.toThrow(/not complete/);
    await db.query(
      "insert into storage.objects(bucket_id,name) values('booking-files',$1)",
      [path],
    );
    expect(
      (await db.query("select can_access_booking_file($1) allowed", [path]))
        .rows,
    ).toEqual([{ allowed: true }]);
    await db.query("update booking_attachments set state='ready' where id=$1", [
      attachment,
    ]);
    entry = await save(trip, {
      ...entry,
      extraction: { status: "failed", warnings: ["Read failed"], evidence: {} },
    });
    expect(entry.fields.title).toBe("Reliable title");
    expect(
      (
        await db.query("select state from booking_attachments where id=$1", [
          attachment,
        ])
      ).rows,
    ).toEqual([{ state: "ready" }]);
    await expect(
      save(trip, { ...entry, review_status: "reviewed" }),
    ).rejects.toThrow(/required booking details/);
    await expect(
      db.query("select save_booking_intake($1,$2,$3,'{}',true)", [
        trip,
        entry.id,
        entry.revision,
      ]),
    ).rejects.toThrow(/private files/);
    await db.query("select advance_booking_collection($1)", [trip]);
    expect(
      (
        await db.query(
          "select creation_state,draft_step from trips where id=$1",
          [trip],
        )
      ).rows,
    ).toEqual([{ creation_state: "draft", draft_step: 3 }]);
    await act(other);
    expect(
      (await db.query("select can_access_booking_file($1) allowed", [path]))
        .rows,
    ).toEqual([{ allowed: false }]);
    expect(
      (await db.query("select name from storage.objects where name=$1", [path]))
        .rows,
    ).toEqual([]);
    expect(
      (await db.query("select trip_id from trip_onboarding")).rows,
    ).toEqual([]);
    expect(
      (
        await db.query("select id from booking_attachments where id=$1", [
          attachment,
        ])
      ).rows,
    ).toEqual([]);
    await expect(save(trip, initial)).rejects.toThrow(/owner access/);
    await expect(save(finalized, initial)).rejects.toThrow(/owner access/);
    await expect(
      db.query("select advance_booking_collection($1)", [trip]),
    ).rejects.toThrow();
    await act(owner);
    const validFields = {
      trip_id: finalized,
      segment_id: null,
      title: "Reviewed fields",
      category: "flight",
      provider: "",
      reference: "",
      start_date: "2027-05-01",
      end_date: "2027-05-01",
      local_time: "",
      timezone: "UTC",
      end_local_time: "",
      end_timezone: "",
      origin: "",
      destination: "",
      travelers: "",
      notes: "",
      price: null,
      paid_amount: null,
      currency: "EUR",
      payment_status: "unpaid",
      payment_due_date: "2027-04-15",
      verification: "user confirmed",
    };
    let complete = await save(finalized, {
      ...emptyCollectionEntry(crypto.randomUUID()),
      fields: validFields,
      review_status: "reviewed",
    });
    const sourceId = crypto.randomUUID(),
      sourcePath = [owner, finalized, complete.id, sourceId].join("/");
    complete = await save(finalized, {
      ...complete,
      source: {
        attachment_id: sourceId,
        filename: "retained.pdf",
        content_type: "application/pdf",
        size: 100,
        checksum,
      },
    });
    await db.query(
      "insert into booking_attachments(id,trip_id,intake_id,owner_id,path,filename,content_type,size,content_sha256,state) values($1,$2,$3,$4,$5,'retained.pdf','application/pdf',100,$6,'pending')",
      [sourceId, finalized, complete.id, owner, sourcePath, checksum],
    );
    await db.exec("reset role");
    await db.query(
      "insert into storage.objects(bucket_id,name) values('booking-files',$1)",
      [sourcePath],
    );
    await act(owner);
    await db.query("update booking_attachments set state='ready' where id=$1", [
      sourceId,
    ]);
    const materialize = () =>
      db.query<{ id: string }>(
        "select materialize_booking_intake($1,$2,$3) id",
        [finalized, complete.id, complete.revision],
      );
    const result = await materialize();
    expect((await materialize()).rows).toEqual(result.rows);
    expect(
      (
        await db.query(
          "select payment_due_date::text, payment_status,reservation_status from bookings where id=$1",
          [result.rows[0].id],
        )
      ).rows,
    ).toEqual([
      {
        payment_due_date: "2027-04-15",
        payment_status: "unpaid",
        reservation_status: "unknown",
      },
    ]);
    expect(
      (await db.query("select count(*)::int n from expenses")).rows,
    ).toEqual([{ n: 0 }]);
    expect(
      (
        await db.query(
          "select reservation_status,verification from bookings where id=$1",
          [result.rows[0].id],
        )
      ).rows,
    ).toEqual([
      { reservation_status: "unknown", verification: "user confirmed" },
    ]);
    expect(
      (
        await db.query(
          "select booking_id,intake_id,path,state from booking_attachments where id=$1",
          [sourceId],
        )
      ).rows,
    ).toEqual([
      {
        booking_id: result.rows[0].id,
        intake_id: complete.id,
        path: sourcePath,
        state: "ready",
      },
    ]);
    expect(
      (
        await db.query(
          "select jsonb_array_length(preferences->'pending_bookings') count from trip_onboarding where trip_id=$1",
          [finalized],
        )
      ).rows,
    ).toEqual([{ count: 0 }]);
    expect(
      (
        await db.query(
          "select has_function_privilege('anon','public.save_booking_intake(uuid,uuid,integer,jsonb,boolean)','EXECUTE') allowed",
        )
      ).rows,
    ).toEqual([{ allowed: false }]);
  } finally {
    await db.close();
  }
}, 30000);
