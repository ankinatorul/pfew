import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { reusableLinkFixture } from "./fixtures/reusable-link-database";
import { other } from "./fixtures/review-database";
import { emptyCollectionEntry } from "../lib/booking-collection";
import { overviewBooking } from "./fixtures/trip-overview";
it("syncs one payment reminder atomically for editor changes, paid completion and deletion, with trip isolation", async () => {
  const f = await reusableLinkFixture(true, false);
  try {
    await f.db.exec("reset role");
    const before = (await f.db.query("select count(*)::int n from bookings"))
      .rows;
    await f.db.exec(
      readFileSync(
        "supabase/migrations/025_booking_payment_arrangements.sql",
        "utf8",
      ),
    );
    expect(
      (await f.db.query("select count(*)::int n from bookings")).rows,
    ).toEqual(before);
    expect(
      (
        await f.db.query(
          "select count(*)::int n from prep_tasks where booking_id is not null",
        )
      ).rows[0],
    ).toEqual({ n: 0 });
    await f.act(other);
    const id = crypto.randomUUID(),
      fields = {
        ...overviewBooking({
          id,
          trip_id: f.trip,
          title: "Shared hotel",
          start_date: "2027-06-01",
          end_date: "2027-06-03",
        }),
        price: 200,
        currency: "RON",
        payment_status: "unpaid",
        payment_arrangement: "due_date",
        payment_due_date: "2027-05-01",
      };
    const save = async (changes: object = {}, revision = 0) =>
      f.db.query("select save_managed_booking($1,$2,$3,$4::jsonb)", [
        f.trip,
        id,
        revision,
        JSON.stringify({ ...fields, ...changes }),
      ]);
    await save();
    let tasks = (
      await f.db.query<{
        id: string;
        title: string;
        done: boolean;
        due_date: string;
      }>("select * from prep_tasks where booking_id=$1", [id])
    ).rows;
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toContain("200.00 RON");
    expect(tasks[0].done).toBe(false);
    const taskId = tasks[0].id;
    await f.act();
    await expect(
      f.db.query("update prep_tasks set trip_id=$1 where id=$2", [
        f.foreign,
        taskId,
      ]),
    ).rejects.toThrow(/same trip/);
    await f.act(other);
    await save({ payment_due_date: "2027-05-03" });
    tasks = (
      await f.db.query<(typeof tasks)[0]>(
        "select * from prep_tasks where booking_id=$1",
        [id],
      )
    ).rows;
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe(taskId);
    expect(new Date(tasks[0].due_date).toISOString()).toContain("2027-05-03");
    await save({ payment_status: "paid" }, 1);
    expect(
      (
        await f.db.query("select done from prep_tasks where booking_id=$1", [
          id,
        ])
      ).rows[0],
    ).toEqual({ done: true });
    await save({ payment_arrangement: "property", payment_due_date: null }, 2);
    expect(
      (
        await f.db.query("select done from prep_tasks where booking_id=$1", [
          id,
        ])
      ).rows[0],
    ).toEqual({ done: true });
    await expect(
      save({ payment_arrangement: "due_date", payment_due_date: null }, 3),
    ).rejects.toThrow();
    expect(
      (
        await f.db.query(
          "select payment_arrangement from bookings where id=$1",
          [id],
        )
      ).rows[0],
    ).toEqual({ payment_arrangement: "property" });
    await f.act(f.third);
    expect(
      (await f.db.query("select * from prep_tasks where booking_id=$1", [id]))
        .rows,
    ).toHaveLength(0);
    await expect(save({}, 3)).rejects.toThrow(/permission/i);
    await f.act();
    await f.db.query("delete from bookings where id=$1", [id]);
    expect(
      (await f.db.query("select * from prep_tasks where booking_id=$1", [id]))
        .rows,
    ).toHaveLength(0);
    // Reviewed Create Trip intake uses the same insertion transaction and reminder trigger.
    const staged = {
      ...emptyCollectionEntry(crypto.randomUUID()),
      fields: {
        ...fields,
        payment_arrangement: "property",
        payment_due_date: "",
      },
      review_status: "reviewed",
    };
    const saved = (
      await f.db.query<{ entry: { revision: number } }>(
        "select save_booking_intake($1,$2,0,$3::jsonb) entry",
        [f.trip, staged.id, JSON.stringify(staged)],
      )
    ).rows[0].entry;
    const booked = (
      await f.db.query<{ id: string }>(
        "select materialize_booking_intake($1,$2,$3) id",
        [f.trip, staged.id, saved.revision],
      )
    ).rows[0].id;
    expect(
      (
        await f.db.query(
          "select payment_arrangement,payment_due_date from bookings where id=$1",
          [booked],
        )
      ).rows[0],
    ).toEqual({ payment_arrangement: "property", payment_due_date: null });
    expect(
      (
        await f.db.query("select * from prep_tasks where booking_id=$1", [
          booked,
        ])
      ).rows,
    ).toHaveLength(0);
  } finally {
    await f.db.close();
  }
});
