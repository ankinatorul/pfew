import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { reviewDatabase, other } from "./fixtures/review-database";
import { overviewBooking } from "./fixtures/trip-overview";
const sql = readFileSync(
  "supabase/migrations/015_bookings_and_budget.sql",
  "utf8",
);
async function fixture() {
  const f = await reviewDatabase();
  const trip = await f.create();
  await f.finalize(trip);
  await f.db.exec("reset role");
  await f.db.exec(
    readFileSync("supabase/migrations/014_itinerary_planning.sql", "utf8"),
  );
  await f.db.exec(sql);
  await f.act();
  return { ...f, trip };
}
it("saves bookings with stable IDs and revisions, independent statuses, real itinerary links and safe retries", async () => {
  const { db, trip, act } = await fixture();
  try {
    const id = crypto.randomUUID(),
      segment = crypto.randomUUID();
    await db.query(
      "insert into trip_segments(id,trip_id,kind,title,start_date,end_date,timezone) values($1,$2,'activity','My saved activity','2027-06-01','2027-06-01','Europe/Paris')",
      [segment, trip],
    );
    const b = {
      ...overviewBooking({
        id,
        trip_id: trip,
        start_date: "2027-06-01",
        end_date: "2027-06-01",
        segment_id: segment,
        verification: "unverified",
        reservation_status: "confirmed",
      }),
      location_id: null,
      location_label: null,
      latitude: null,
      longitude: null,
      end_location_id: null,
      end_location_label: null,
      end_latitude: null,
      end_longitude: null,
    };
    const save = async (fields: unknown, rev = 0) =>
      db.query("select save_managed_booking($1,$2,$3,$4::jsonb)", [
        trip,
        id,
        rev,
        JSON.stringify(fields),
      ]);
    await save(b);
    await save(b);
    expect(
      (
        await db.query(
          "select count(*)::int n from bookings where trip_id=$1",
          [trip],
        )
      ).rows[0],
    ).toEqual({ n: 1 });
    await save({ ...b, verification: "user confirmed" });
    expect(
      (
        await db.query(
          "select verification,reservation_status,finance_revision from bookings where id=$1",
          [id],
        )
      ).rows[0],
    ).toEqual({
      verification: "user confirmed",
      reservation_status: "confirmed",
      finance_revision: 1,
    });
    await expect(save({ ...b, title: "Stale edit" })).rejects.toThrow(
      /changed/,
    );
    await save(
      { ...b, verification: "user confirmed", reservation_status: "cancelled" },
      1,
    );
    expect(
      (await db.query("select id from trip_segments where id=$1", [segment]))
        .rows,
    ).toHaveLength(1);
    await act(other);
    await expect(save(b, 2)).rejects.toThrow(/permission/);
    expect(
      (await db.query("select id from bookings where id=$1", [id])).rows,
    ).toEqual([]);
  } finally {
    await db.close();
  }
}, 30000);
it("persists expense CRUD, preserves legacy data, rejects foreign links and revisions, and keeps expenses after booking deletion", async () => {
  const { db, trip, act, create, finalize } = await fixture();
  try {
    const legacy = crypto.randomUUID();
    await db.query(
      "insert into expenses(id,trip_id,amount,currency,category,day,payment_method) values($1,$2,10,'EUR','Existing category','2027-06-01','cash')",
      [legacy, trip],
    );
    expect(
      (
        await db.query("select title,booking_id from expenses where id=$1", [
          legacy,
        ])
      ).rows[0],
    ).toEqual({ title: null, booking_id: null });
    const booking = crypto.randomUUID();
    await db.query(
      "insert into bookings(id,trip_id,title,category,start_date,end_date,timezone,currency) values($1,$2,'Related booking','activity','2027-06-01','2027-06-01','Europe/Paris','EUR')",
      [booking, trip],
    );
    const id = crypto.randomUUID(),
      input = {
        title: "A recorded cost",
        amount: "25.15",
        currency: "USD",
        category: "Activities",
        day: "2027-06-01",
        payment_method: "card",
        notes: "Keep me",
        booking_id: booking,
      };
    const save = async (fields: unknown, rev = 0, remove = false) =>
      db.query("select change_expense($1,$2,$3,$4::jsonb,$5)", [
        trip,
        id,
        rev,
        JSON.stringify(fields),
        remove,
      ]);
    await save(input);
    await save(input);
    expect(
      (
        await db.query(
          "select amount::text,currency,finance_revision from expenses where id=$1",
          [id],
        )
      ).rows[0],
    ).toEqual({ amount: "25.15", currency: "USD", finance_revision: 0 });
    await save({ ...input, title: "Edited" });
    await expect(save(input)).rejects.toThrow(/changed/);
    const another = await create();
    await finalize(another);
    const foreign = crypto.randomUUID();
    await db.query(
      "insert into bookings(id,trip_id,title,category,start_date,end_date,timezone,currency) values($1,$2,'Foreign booking','activity','2027-06-01','2027-06-01','Europe/Paris','EUR')",
      [foreign, another],
    );
    await expect(save({ ...input, booking_id: foreign }, 1)).rejects.toThrow(
      /same trip/,
    );
    await db.query("delete from bookings where id=$1", [booking]);
    expect(
      (
        await db.query(
          "select title,amount::text,currency,booking_id,finance_revision from expenses where id=$1",
          [id],
        )
      ).rows[0],
    ).toEqual({
      title: "Edited",
      amount: "25.15",
      currency: "USD",
      booking_id: null,
      finance_revision: 2,
    });
    await act(other);
    await expect(save(input, 2)).rejects.toThrow(/permission/);
    await act();
    await save({}, 2, true);
    expect(
      (await db.query("select id from expenses where id=$1", [id])).rows,
    ).toEqual([]);
  } finally {
    await db.close();
  }
}, 30000);
it("saves only monetary target/currency, preserves style and amounts, permits editors but not viewers, and denies anonymous RPC execution", async () => {
  const { db, trip, act } = await fixture();
  try {
    const save = (
      amount: number | null,
      unit: string,
      expected: number | null,
      previous: string,
    ) =>
      db.query("select save_monetary_budget($1,$2,$3,$4,$5)", [
        trip,
        amount,
        unit,
        expected,
        previous,
      ]);
    await save(500, "EUR", null, "EUR");
    await expect(save(600, "USD", null, "EUR")).rejects.toThrow(/changed/);
    await db.query(
      "insert into trip_members(trip_id,user_id,role) values($1,$2,'viewer')",
      [trip, other],
    );
    await act(other);
    await expect(save(600, "USD", 500, "EUR")).rejects.toThrow(/permission/);
    await act();
    await db.query(
      "update trip_members set role='editor' where trip_id=$1 and user_id=$2",
      [trip, other],
    );
    await act(other);
    await save(600, "USD", 500, "EUR");
    expect(
      (
        await db.query(
          "select budget::text,currency,style from trips where id=$1",
          [trip],
        )
      ).rows[0],
    ).toEqual({ budget: "600", currency: "USD", style: "Comfort" });
    await save(null, "USD", 600, "USD");
    for (const signature of [
      "public.save_managed_booking(uuid,uuid,integer,jsonb)",
      "public.change_expense(uuid,uuid,integer,jsonb,boolean)",
      "public.save_monetary_budget(uuid,numeric,text,numeric,text)",
    ])
      expect(
        (
          await db.query<{ allowed: boolean }>(
            "select has_function_privilege('anon',$1,'EXECUTE') allowed",
            [signature],
          )
        ).rows[0].allowed,
      ).toBe(false);
    await db.exec("reset role");
    await db.exec(sql);
  } finally {
    await db.close();
  }
}, 30000);
it("preserves existing business data and validates the optional read-only report before and after migration 015", async () => {
  const { db, act, create, finalize } = await reviewDatabase();
  try {
    const trip = await create();
    await finalize(trip);
    await db.query(
      "insert into expenses(trip_id,amount,currency,category,day,payment_method) values($1,12.50,'EUR','Legacy category','2027-06-01','cash')",
      [trip],
    );
    await db.query(
      "insert into bookings(trip_id,title,category,start_date,end_date,timezone,currency,price) values($1,'Existing booking','flight','2027-06-01','2027-06-01','Europe/Paris','EUR',99)",
      [trip],
    );
    await db.exec("reset role");
    const inspection = readFileSync(
      "supabase/VERIFY_PHASE9_READ_ONLY.sql",
      "utf8",
    );
    const report = async () => {
      const results = await db.exec(inspection);
      return JSON.parse(
        (
          results.find((r) => r.rows.some((row) => "phase9_report" in row))!
            .rows[0] as { phase9_report: string }
        ).phase9_report,
      ) as {
        read_only: string;
        baselines: unknown[];
        columns: { present: boolean }[];
      };
    };
    const before = await report();
    await db.exec(sql);
    const after = await report();
    expect(after.read_only).toBe("on");
    expect(before.columns.every((c) => !c.present)).toBe(true);
    expect(after.columns.every((c) => c.present)).toBe(true);
    expect(after.baselines).toEqual(before.baselines);
    await act();
  } finally {
    await db.close();
  }
}, 30000);
