import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { reviewDatabase, other } from "./fixtures/review-database";

it("extends the existing booking RPC atomically, preserves legacy fields and links, and denies stale/cross-user saves", async () => {
  const f = await reviewDatabase();
  const { db } = f;
  try {
    const trip = await f.create();
    await f.finalize(trip);
    await db.exec("reset role");
    for (const file of [
      "014_itinerary_planning.sql",
      "015_bookings_and_budget.sql",
      "016_packing_and_documents.sql",
      "017_booking_payment_due.sql",
    ])
      await db.exec(readFileSync("supabase/migrations/" + file, "utf8"));
    await f.act();
    const id = crypto.randomUUID(),
      segment = crypto.randomUUID(),
      expense = crypto.randomUUID();
    await db.query(
      "insert into trip_segments(id,trip_id,kind,title,start_date,end_date,timezone) values($1,$2,'activity','Saved activity','2027-06-01','2027-06-01','Europe/Paris')",
      [segment, trip],
    );
    await db.query(
      "insert into bookings(id,trip_id,title,category,start_date,end_date,timezone,currency,provider,notes,paid_amount,price,payment_status,reservation_status,verification,segment_id) values($1,$2,'Legacy flight','flight','2027-06-01','2027-06-01','Europe/Paris','EUR','Original airline','Private note',30,100,'partial','cancelled','unverified',$3)",
      [id, trip, segment],
    );
    await db.query(
      "insert into expenses(id,trip_id,title,amount,currency,category,day,payment_method,booking_id) values($1,$2,'Recorded cost',30,'EUR','Transportation','2027-06-01','card',$3)",
      [expense, trip, id],
    );
    const before = (
      await db.query("select to_jsonb(b) b from bookings b where id=$1", [id])
    ).rows;
    await db.exec("reset role");
    await db.exec(
      readFileSync(
        "supabase/migrations/018_unified_booking_editor.sql",
        "utf8",
      ),
    );
    await f.act();
    expect(
      (await db.query("select to_jsonb(b) b from bookings b where id=$1", [id]))
        .rows,
    ).toEqual(before);
    const save = (fields: unknown, revision = 0) =>
      db.query("select save_managed_booking($1,$2,$3,$4::jsonb)", [
        trip,
        id,
        revision,
        JSON.stringify(fields),
      ]);
    await save({ title: "Updated flight", payment_due_date: "2027-05-20" });
    const row = (
      await db.query(
        "select title,category,provider,notes,paid_amount::text,price::text,payment_status,reservation_status,verification,segment_id,payment_due_date::text,finance_revision from bookings where id=$1",
        [id],
      )
    ).rows[0];
    expect(row).toMatchObject({
      title: "Updated flight",
      category: "flight",
      provider: "Original airline",
      notes: "Private note",
      paid_amount: "30.00",
      price: "100.00",
      payment_status: "partial",
      reservation_status: "cancelled",
      verification: "unverified",
      segment_id: segment,
      payment_due_date: "2027-05-20",
      finance_revision: 1,
    });
    await expect(save({ title: "Stale overwrite" })).rejects.toThrow(/changed/);
    await expect(save({ payment_due_date: "not-a-date" }, 1)).rejects.toThrow();
    expect(
      (
        await db.query("select finance_revision from bookings where id=$1", [
          id,
        ])
      ).rows[0],
    ).toEqual({ finance_revision: 1 });
    await save({ verification: "user confirmed" }, 1);
    await save({ payment_due_date: null }, 2);
    expect(
      (
        await db.query(
          "select booking_id,amount::text from expenses where id=$1",
          [expense],
        )
      ).rows[0],
    ).toEqual({ booking_id: id, amount: "30.00" });
    expect(
      (
        await db.query(
          "select count(*)::int n from bookings where trip_id=$1",
          [trip],
        )
      ).rows[0],
    ).toEqual({ n: 1 });
    await f.act(other);
    await expect(save({ title: "Foreign edit" }, 3)).rejects.toThrow(
      /permission/,
    );
    await db.exec("reset role;set role anon");
    await expect(
      db.query("select managed_booking_editor_version()"),
    ).rejects.toThrow(/permission/);
    await expect(save({ title: "Anonymous edit" }, 3)).rejects.toThrow(
      /permission/,
    );
  } finally {
    await db.close();
  }
}, 30000);
