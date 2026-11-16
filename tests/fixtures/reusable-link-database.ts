import { expect } from "vitest";
import { readFileSync } from "node:fs";
import { reviewDatabase, owner, other } from "./review-database";
import { overviewBooking } from "./trip-overview";
const hash = (c: string) => c.repeat(64);
export async function reusableLinkFixture(
  acceptedLegacy = true,
  with021 = true,
) {
  const f = await reviewDatabase();
  const trip = await f.create();
  await f.finalize(trip);
  const foreign = await f.create();
  await f.finalize(foreign);
  const draft = await f.create();
  await f.db.exec(
    "reset role; alter table auth.users add is_anonymous boolean not null default false",
  );
  await f.db.query(
    "update auth.users set email=case when id=$1 then 'owner@example.com' else 'original@example.com' end,email_confirmed_at=now()",
    [owner],
  );
  const third = crypto.randomUUID();
  await f.db.query(
    "insert into auth.users(id,email,email_confirmed_at) values($1,'third@example.com',null)",
    [third],
  );
  for (const file of [
    "014_itinerary_planning.sql",
    "015_bookings_and_budget.sql",
    "016_packing_and_documents.sql",
    "017_booking_payment_due.sql",
    "018_unified_booking_editor.sql",
    "019_trip_collaboration_v1a.sql",
  ])
    await f.db.exec(readFileSync("supabase/migrations/" + file, "utf8"));
  await f.act();
  const legacy = (
    await f.db.query<{ id: string }>(
      "select create_trip_invitation($1,'original@example.com',$2) id",
      [trip, hash("a")],
    )
  ).rows[0].id;
  if (acceptedLegacy) {
    await f.act(other);
    await f.db.query("select accept_trip_invitation($1)", [hash("a")]);
    await f.act();
    const booking = crypto.randomUUID();
    await f.db.query("select save_managed_booking($1,$2,0,$3::jsonb)", [
      trip,
      booking,
      JSON.stringify(
        overviewBooking({
          id: booking,
          trip_id: trip,
          start_date: "2027-06-02",
          end_date: "2027-06-02",
        }),
      ),
    ]);
    const file = crypto.randomUUID(),
      path = `${owner}/${trip}/documents/${file}`;
    await f.db.query(
      "insert into booking_attachments(id,trip_id,owner_id,path,filename,content_type,size,document_kind,content_sha256) values($1,$2,$3,$4,'existing.pdf','application/pdf',10,'trip',$5)",
      [file, trip, owner, path, hash("f")],
    );
    await f.db.query(
      "insert into storage.objects(bucket_id,name) values('booking-files',$1)",
      [path],
    );
    await f.db.query(
      "update booking_attachments set state='ready' where id=$1",
      [file],
    );
  }
  const preservedTables = [
    "trips",
    "bookings",
    "trip_members",
    "booking_attachments",
  ];
  const preserved = await Promise.all(
    preservedTables.map((table) =>
      f.db.query(`select to_jsonb(t) x from ${table} t order by id`),
    ),
  );
  const old = (await f.db.query("select to_jsonb(i) x from trip_invitations i"))
    .rows;
  await f.db.exec("reset role");
  if (with021)
    await f.db.exec(
      readFileSync("supabase/migrations/021_link_invitations.sql", "utf8"),
    );
  await f.db.exec(
    readFileSync("supabase/migrations/022_reusable_trip_sharing.sql", "utf8"),
  );
  expect(
    (
      await f.db.query(
        "select to_jsonb(i)-'invitation_kind' x from trip_invitations i",
      )
    ).rows,
  ).toEqual(old);
  for (let index = 0; index < preservedTables.length; index++)
    expect(
      (
        await f.db.query(
          `select to_jsonb(t) x from ${preservedTables[index]} t order by id`,
        )
      ).rows,
    ).toEqual(preserved[index].rows);
  await f.act();
  return { ...f, trip, foreign, draft, third, legacy };
}
