import { expect } from "vitest";
import { owner, other, reviewDatabase } from "./review-database";
import { overviewBooking } from "./trip-overview";
const hash = (c: string) => c.repeat(64);
export async function assertEditorPermissions(
  f: Pick<
    Awaited<ReturnType<typeof reviewDatabase>>,
    "db" | "act" | "basics"
  > & {
    trip: string;
    foreign: string;
    draft: string;
  },
) {
  const { db, act, trip, foreign, draft } = f;
  const revision = (
    await db.query<{ trip_revision: number }>(
      "select trip_revision from trips where id=$1",
      [trip],
    )
  ).rows[0].trip_revision;
  await db.query("select save_shared_trip_details($1,$2,$3::jsonb)", [
    trip,
    revision,
    JSON.stringify({
      ...f.basics,
      name: "Shared edited trip",
      travelers: 2,
      style: "Comfort",
      currency: "EUR",
      budget: 200,
    }),
  ]);
  await expect(
    db.query("select save_shared_trip_details($1,$2,$3::jsonb)", [
      trip,
      revision,
      JSON.stringify({ ...f.basics, name: "Stale" }),
    ]),
  ).rejects.toThrow(/changed/);
  const destination = crypto.randomUUID();
  await db.query(
    "insert into trip_segments(id,trip_id,kind,title,start_date,end_date,timezone) values($1,$2,'destination','Shared destination','2027-06-01','2027-06-03','Europe/Paris')",
    [destination, trip],
  );
  await db.query(
    "update trip_segments set title='Edited destination' where id=$1 and itinerary_revision=0",
    [destination],
  );
  const activity = crypto.randomUUID();
  const input = {
    id: activity,
    revision: 0,
    title: "Shared plan",
    day: "2027-06-02",
    start: "",
    end: "",
    destination: "",
    category: "Other",
    notes: "",
    location: "",
  };
  const itinerary = async (c: unknown) =>
    db.query("select change_itinerary($1,$2::jsonb)", [
      trip,
      JSON.stringify(c),
    ]);
  await itinerary({ op: "save", input });
  await itinerary({ op: "save", input: { ...input, title: "Updated plan" } });
  await expect(itinerary({ op: "save", input })).rejects.toThrow(/changed/);
  const booking = crypto.randomUUID(),
    b = {
      ...overviewBooking({
        id: booking,
        trip_id: trip,
        start_date: "2027-06-02",
        end_date: "2027-06-02",
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
  await db.query("select save_managed_booking($1,$2,0,$3::jsonb)", [
    trip,
    booking,
    JSON.stringify(b),
  ]);
  await db.query("select save_managed_booking($1,$2,0,$3::jsonb)", [
    trip,
    booking,
    JSON.stringify({ ...b, title: "Editor booking" }),
  ]);
  await expect(
    db.query("select save_managed_booking($1,$2,0,$3::jsonb)", [
      trip,
      booking,
      JSON.stringify(b),
    ]),
  ).rejects.toThrow(/changed/);
  await db.query("select save_monetary_budget($1,300,'EUR',200,'EUR')", [trip]);
  const expense = crypto.randomUUID();
  await db.query("select change_expense($1,$2,0,$3::jsonb,false)", [
    trip,
    expense,
    JSON.stringify({
      title: "Lunch",
      amount: "15",
      currency: "EUR",
      category: "Food & Drink",
      day: "2027-06-02",
      payment_method: "card",
      notes: "",
    }),
  ]);
  await db.query("select change_expense($1,$2,0,$3::jsonb,false)", [
    trip,
    expense,
    JSON.stringify({
      title: "Lunch updated",
      amount: "16",
      currency: "EUR",
      category: "Food & Drink",
      day: "2027-06-02",
      payment_method: "card",
      notes: "",
    }),
  ]);
  const list = crypto.randomUUID(),
    item = crypto.randomUUID();
  const packing = async (c: unknown) =>
    db.query("select change_packing($1,$2::jsonb)", [trip, JSON.stringify(c)]);
  await packing({ op: "list", id: list, traveler: "Shared list" });
  await packing({
    op: "save",
    input: {
      id: item,
      list_id: list,
      revision: 0,
      title: "Cable",
      category: "Electronics",
      quantity: 1,
      notes: "",
    },
  });
  await packing({ op: "packed", id: item, revision: 0, packed: true });
  await expect(
    packing({ op: "packed", id: item, revision: 0, packed: false }),
  ).rejects.toThrow(/changed/);
  const prep = crypto.randomUUID();
  await db.query("select change_preparation_reminder($1,$2::jsonb,false)", [
    trip,
    JSON.stringify({
      id: prep,
      revision: 0,
      title: "Prepare",
      category: "Other",
      due_date: "",
      done: false,
    }),
  ]);
  await db.query("select change_preparation_reminder($1,$2::jsonb,false)", [
    trip,
    JSON.stringify({
      id: prep,
      revision: 0,
      title: "Prepare",
      category: "Other",
      due_date: "",
      done: true,
    }),
  ]);
  for (const target of [foreign, draft]) {
    expect(
      (await db.query("select id from trips where id=$1", [target])).rows,
    ).toHaveLength(0);
    await expect(
      db.query("select change_packing($1,$2::jsonb)", [
        target,
        JSON.stringify({
          op: "list",
          id: crypto.randomUUID(),
          traveler: "Forbidden",
        }),
      ]),
    ).rejects.toThrow(/permission/);
  }
  await expect(
    db.query("select create_trip_link($1,$2)", [trip, hash("f")]),
  ).rejects.toThrow(/owner|permission/);
  expect(
    (await db.query("delete from trips where id=$1 returning id", [trip])).rows,
  ).toHaveLength(0);
  await expect(
    db.query("update trips set owner_id=$1 where id=$2", [other, trip]),
  ).rejects.toThrow();
  const file = crypto.randomUUID(),
    path = `${other}/${trip}/documents/${file}`;
  await db.query(
    "insert into booking_attachments(id,trip_id,owner_id,path,filename,content_type,size,document_kind,content_sha256) values($1,$2,$3,$4,'fixture.pdf','application/pdf',10,'trip',$5)",
    [file, trip, other, path, hash("a")],
  );
  await db.query(
    "insert into storage.objects(bucket_id,name) values('booking-files',$1)",
    [path],
  );
  await db.query("update booking_attachments set state='ready' where id=$1", [
    file,
  ]);
  await db.query("select set_trip_file_scope($1,$2,1,'shared')", [trip, file]);
  await act();
  expect(
    (await db.query("select name,budget from trips where id=$1", [trip]))
      .rows[0],
  ).toEqual({ name: "Shared edited trip", budget: "300" });
  expect(
    (await db.query("select title from bookings where id=$1", [booking]))
      .rows[0],
  ).toEqual({ title: "Editor booking" });
  expect(
    (await db.query("select packed from packing_items where id=$1", [item]))
      .rows[0],
  ).toEqual({ packed: true });
  expect(
    (await db.query("select id from booking_attachments where id=$1", [file]))
      .rows,
  ).toHaveLength(1);
  const privateFile = crypto.randomUUID(),
    privatePath = `${owner}/${trip}/documents/${privateFile}`;
  await db.query(
    "insert into booking_attachments(id,trip_id,owner_id,path,filename,content_type,size,document_kind,content_sha256) values($1,$2,$3,$4,'private.pdf','application/pdf',10,'trip',$5)",
    [privateFile, trip, owner, privatePath, hash("b")],
  );
  await db.query(
    "insert into storage.objects(bucket_id,name) values('booking-files',$1)",
    [privatePath],
  );
  await db.query("update booking_attachments set state='ready' where id=$1", [
    privateFile,
  ]);
  await act(other);
  expect(
    (
      await db.query("select id from booking_attachments where id=$1", [
        privateFile,
      ])
    ).rows,
  ).toHaveLength(0);
  expect(
    (
      await db.query(
        "delete from booking_attachments where id=$1 returning id",
        [privateFile],
      )
    ).rows,
  ).toHaveLength(0);
  expect(
    (
      await db.query("delete from storage.objects where name=$1 returning id", [
        privatePath,
      ])
    ).rows,
  ).toHaveLength(0);
  await itinerary({ op: "delete", id: activity, revision: 1 });
  expect(
    (await db.query("delete from bookings where id=$1 returning id", [booking]))
      .rows,
  ).toHaveLength(1);
  await db.query("select change_expense($1,$2,1,$3::jsonb,true)", [
    trip,
    expense,
    JSON.stringify({}),
  ]);
  await packing({ op: "delete", id: item, revision: 1 });
}
