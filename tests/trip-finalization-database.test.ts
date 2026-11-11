import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { reviewDatabase, other } from "./fixtures/review-database";
import {
  reviewedBookingFields,
  emptyCollectionEntry,
  type CollectionEntry,
} from "../lib/booking-collection";
it("promotes the same draft atomically, preserves dates/destinations and budget, and makes simultaneous retries idempotent", async () => {
  const { db, create, finalize, basics } = await reviewDatabase();
  try {
    const id = await create(),
      second = await create();
    await db.query("update trips set budget=750 where id=$1", [id]);
    const saved = (
      await db.query<{ t: { draft_revision: number; style: string } }>(
        "select save_trip_review($1,1,'Luxury') t",
        [id],
      )
    ).rows[0].t;
    expect(saved.style).toBe("Luxury");
    expect(saved.draft_revision).toBe(2);
    await expect(finalize(id, 1)).rejects.toThrow(/Draft changed/);
    const [one, two] = await Promise.all([
      finalize(id, 2, [], "Luxury"),
      finalize(id, 2, [], "Luxury"),
    ]);
    expect(one.id).toBe(id);
    expect(two.id).toBe(id);
    expect(one.creation_state).toBe("finalized");
    expect(one.style).toBe("Luxury");
    expect(one.theme).toBe("City Break");
    expect(one.draft_data.destinations).toEqual(basics.destinations);
    expect(
      (
        await db.query(
          "select budget,start_date::text,end_date::text from trips where id=$1",
          [id],
        )
      ).rows,
    ).toEqual([
      {
        budget: "750",
        start_date: basics.start_date,
        end_date: basics.end_date,
      },
    ]);
    expect(
      (await db.query("select creation_state from trips where id=$1", [second]))
        .rows,
    ).toEqual([{ creation_state: "draft" }]);
    expect(
      (await db.query("select id from trip_segments where trip_id=$1", [id]))
        .rows,
    ).toEqual([]);
    await expect(
      db.query("update trips set theme='Ski' where id=$1", [id]),
    ).rejects.toThrow(/stable/);
    await db.query(
      "update trips set name='Changed later',style='Budget' where id=$1",
      [id],
    );
    expect(
      (await db.query("select theme from trips where id=$1", [id])).rows,
    ).toEqual([{ theme: "City Break" }]);
    await db.exec("reset role");
    await db.exec(
      readFileSync(
        "supabase/migrations/013_trip_review_and_finalization.sql",
        "utf8",
      ),
    );
  } finally {
    await db.close();
  }
}, 30000);
it("requires the owner, disallows direct publication, and rejects stale booking reviews without changing the draft", async () => {
  const { db, create, finalize, act } = await reviewDatabase();
  try {
    const id = await create();
    await expect(
      db.query("update trips set creation_state='finalized' where id=$1", [id]),
    ).rejects.toThrow(/directly/);
    const entry = emptyCollectionEntry(crypto.randomUUID());
    await db.query("select save_booking_intake($1,$2,0,$3::jsonb)", [
      id,
      entry.id,
      JSON.stringify(entry),
    ]);
    await expect(finalize(id)).rejects.toThrow(/Bookings changed/);
    await act(other);
    await expect(finalize(id)).rejects.toThrow(/unavailable/);
    await expect(
      db.query("select save_trip_review($1,1,'Budget')", [id]),
    ).rejects.toThrow(/unavailable/);
    await act();
    expect(
      (await db.query("select creation_state from trips where id=$1", [id]))
        .rows,
    ).toEqual([{ creation_state: "draft" }]);
    expect(
      (
        await db.query(
          "select has_function_privilege('anon','public.finalize_trip_draft(uuid,integer,text,jsonb,text)','EXECUTE') allowed",
        )
      ).rows,
    ).toEqual([{ allowed: false }]);
  } finally {
    await db.close();
  }
}, 30000);
it("materializes reviewed bookings and retains unfinished intake; a later error rolls the whole publication back", async () => {
  const { db, create, finalize } = await reviewDatabase();
  try {
    const id = await create();
    const parsed = reviewedBookingFields(
      {
        ...emptyCollectionEntry(crypto.randomUUID()).fields,
        travelers: "",
        notes: "",
        title: "Flight details",
        category: "flight",
        start_date: "2027-06-01",
        end_date: "2027-06-01",
        timezone: "Europe/Paris",
        currency: "EUR",
        payment_status: "unknown",
      },
      id,
    );
    if (!parsed.success) throw new Error(JSON.stringify(parsed.error.issues));
    const fields = parsed.data;
    const save = async (entry: CollectionEntry) =>
      (
        await db.query<{ e: CollectionEntry }>(
          "select save_booking_intake($1,$2,$3,$4::jsonb) e",
          [id, entry.id, entry.revision, JSON.stringify(entry)],
        )
      ).rows[0].e;
    const complete = await save({
      ...emptyCollectionEntry(crypto.randomUUID()),
      review_status: "reviewed",
      fields,
    });
    let incomplete = await save({
      ...emptyCollectionEntry(crypto.randomUUID()),
      fields: { title: "Still needs dates" },
    });
    const stamp = (...entries: CollectionEntry[]) =>
      entries
        .map(({ id, revision }) => ({ id, revision }))
        .sort((a, b) => a.id.localeCompare(b.id));
    const bad = await save({
      ...emptyCollectionEntry(crypto.randomUUID()),
      review_status: "reviewed",
      fields: { ...fields, segment_id: crypto.randomUUID() },
    });
    await expect(
      finalize(id, 1, stamp(complete, incomplete, bad)),
    ).rejects.toThrow(/same trip/);
    expect(
      (await db.query("select creation_state from trips where id=$1", [id]))
        .rows,
    ).toEqual([{ creation_state: "draft" }]);
    expect(
      (await db.query("select id from bookings where trip_id=$1", [id])).rows,
    ).toEqual([]);
    await db.query("select save_booking_intake($1,$2,$3,'{}',true)", [
      id,
      bad.id,
      bad.revision,
    ]);
    await finalize(id, 1, stamp(complete, incomplete));
    expect(
      (
        await db.query(
          "select title,reservation_status,verification from bookings where trip_id=$1",
          [id],
        )
      ).rows,
    ).toEqual([
      {
        title: "Flight details",
        reservation_status: "unknown",
        verification: "user confirmed",
      },
    ]);
    const pending = (
      await db.query<{ p: CollectionEntry[] }>(
        "select preferences->'pending_bookings' p from trip_onboarding where trip_id=$1",
        [id],
      )
    ).rows[0].p;
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe(incomplete.id);
    expect(pending[0].review_status).toBe("needs_review");
    incomplete = pending[0];
    expect(incomplete.fields.title).toBe("Still needs dates");
  } finally {
    await db.close();
  }
}, 30000);

it("retains private original files for reviewed and unfinished entries across finalization", async () => {
  const { db, create, finalize, act } = await reviewDatabase();
  try {
    const id = await create();
    const parsed = reviewedBookingFields(
      {
        ...emptyCollectionEntry(crypto.randomUUID()).fields,
        travelers: "",
        notes: "",
        title: "Reviewed source",
        category: "flight",
        start_date: "2027-06-01",
        end_date: "2027-06-01",
        timezone: "Europe/Paris",
        currency: "EUR",
      },
      id,
    );
    if (!parsed.success) throw new Error("Bad fixture");
    const save = async (entry: CollectionEntry) =>
      (
        await db.query<{ e: CollectionEntry }>(
          "select save_booking_intake($1,$2,$3,$4::jsonb) e",
          [id, entry.id, entry.revision, JSON.stringify(entry)],
        )
      ).rows[0].e;
    const entries: CollectionEntry[] = [],
      paths: string[] = [];
    for (const reviewed of [true, false]) {
      let entry = await save({
        ...emptyCollectionEntry(crypto.randomUUID()),
        fields: reviewed ? parsed.data : { title: "Unfinished source" },
        review_status: reviewed ? "reviewed" : "needs_review",
      });
      const file = crypto.randomUUID(),
        checksum = "a".repeat(64),
        path = [
          "11111111-1111-4111-8111-111111111111",
          id,
          entry.id,
          file,
        ].join("/");
      entry = await save({
        ...entry,
        source: {
          attachment_id: file,
          filename: "fixture.pdf",
          content_type: "application/pdf",
          size: 100,
          checksum,
        },
      });
      await db.query(
        "insert into booking_attachments(id,trip_id,intake_id,owner_id,path,filename,content_type,size,content_sha256,state) values($1,$2,$3,$4,$5,'fixture.pdf','application/pdf',100,$6,'pending')",
        [
          file,
          id,
          entry.id,
          "11111111-1111-4111-8111-111111111111",
          path,
          checksum,
        ],
      );
      await db.query(
        "insert into storage.objects(bucket_id,name) values('booking-files',$1)",
        [path],
      );
      await db.query(
        "update booking_attachments set state='ready' where id=$1",
        [file],
      );
      entries.push(entry);
      paths.push(path);
    }
    const stamp = entries
      .map(({ id, revision }) => ({ id, revision }))
      .sort((a, b) => a.id.localeCompare(b.id));
    await finalize(id, 1, stamp);
    expect(
      (
        await db.query<{ name: string }>(
          "select name from storage.objects order by name",
        )
      ).rows
        .map((r) => r.name)
        .sort(),
    ).toEqual(paths.sort());
    const files = (
      await db.query<{
        intake_id: string;
        booking_id: string | null;
        state: string;
      }>(
        "select intake_id,booking_id,state from booking_attachments where trip_id=$1",
        [id],
      )
    ).rows;
    expect(
      files.find((f) => f.intake_id === entries[0].id)?.booking_id,
    ).toBeTruthy();
    expect(
      files.find((f) => f.intake_id === entries[1].id)?.booking_id,
    ).toBeNull();
    expect(files.every((f) => f.state === "ready")).toBe(true);
    const pending = (
      await db.query<{ p: CollectionEntry[] }>(
        "select preferences->'pending_bookings' p from trip_onboarding where trip_id=$1",
        [id],
      )
    ).rows[0].p;
    expect(pending[0].source).toEqual(entries[1].source);
    await act(other);
    expect(
      (
        await db.query(
          "select path from booking_attachments where trip_id=$1",
          [id],
        )
      ).rows,
    ).toEqual([]);
  } finally {
    await db.close();
  }
}, 30000);
