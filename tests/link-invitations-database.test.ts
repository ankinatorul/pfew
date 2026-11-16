import { assertEditorPermissions } from "./fixtures/assert-editor-permissions";
import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { reviewDatabase, owner, other } from "./fixtures/review-database";
import { overviewBooking } from "./fixtures/trip-overview";
const hash = (c: string) => c.repeat(64);
async function fixture(acceptedLegacy = false) {
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
  await f.db.exec(
    readFileSync("supabase/migrations/021_link_invitations.sql", "utf8"),
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
  const create = async (c: string) =>
    (
      await f.db.query<{ id: string }>("select create_trip_link($1,$2) id", [
        trip,
        hash(c),
      ])
    ).rows[0].id;
  const preview = async (c: string) =>
    (
      await f.db.query<{ x: Record<string, unknown> | null }>(
        "select preview_trip_invitation($1) x",
        [hash(c)],
      )
    ).rows[0].x;
  return { ...f, trip, foreign, draft, third, legacy, create, preview };
}
it("claims one editor membership on explicit authenticated acceptance, denies reuse and preserves legacy bindings", async () => {
  const f = await fixture(),
    { db, trip, third, act, create, preview, legacy, draft } = f;
  try {
    await expect(
      db.query("select create_trip_link($1,$2)", [draft, hash("b")]),
    ).rejects.toThrow(/finalized/);
    const id = await create("b");
    await db.exec("reset role");
    const anonymous = crypto.randomUUID();
    await db.query("insert into auth.users(id,is_anonymous) values($1,true)", [
      anonymous,
    ]);
    await act(anonymous);
    expect(await preview("b")).toBeNull();
    await expect(
      db.query("select accept_trip_invitation($1)", [hash("b")]),
    ).rejects.toThrow(/Sign in/);
    await act(third);
    expect(await preview("b")).toMatchObject({
      state: "valid",
      kind: "link",
      trip_name: "Paris weekend",
    });
    expect(
      (await db.query("select id from trips where id=$1", [trip])).rows,
    ).toHaveLength(0);
    await expect(
      db.query("select create_trip_link($1,$2)", [trip, hash("c")]),
    ).rejects.toThrow(/owner/);
    await expect(
      db.query("select respond_trip_invitation($1,true)", [id]),
    ).rejects.toThrow(/Verified|unavailable/);
    await expect(
      db.query("select accept_trip_invitation($1)", [hash("a")]),
    ).rejects.toThrow(/Verified|unavailable/);
    await expect(
      db.query("select decline_trip_invitation($1)", [hash("b")]),
    ).rejects.toThrow(/unavailable/);
    expect(
      (await db.query("select accept_trip_invitation($1) id", [hash("b")]))
        .rows[0],
    ).toEqual({ id: trip });
    expect(
      (await db.query("select role from trip_members where trip_id=$1", [trip]))
        .rows,
    ).toEqual([{ role: "editor" }]);
    await db.query("select accept_trip_invitation($1)", [hash("b")]);
    await expect(
      db.query("select revoke_trip_invitation($1,$2)", [trip, id]),
    ).rejects.toThrow(/owner/);
    await expect(
      db.query("update trip_members set role='viewer' where trip_id=$1", [
        trip,
      ]),
    ).rejects.toThrow(/permission/);
    await act(other);
    expect(await preview("b")).toEqual({ state: "used" });
    await expect(
      db.query("select accept_trip_invitation($1)", [hash("b")]),
    ).rejects.toThrow(/used/);
    expect(await preview("a")).toMatchObject({ state: "valid", kind: "email" });
    await db.query("select accept_trip_invitation($1)", [hash("a")]);
    await act();
    const members = (
      await db.query<{ id: string; user_id: string }>(
        "select id,user_id from trip_members where trip_id=$1",
        [trip],
      )
    ).rows;
    await db.query("select manage_trip_member($1,$2,0,true)", [
      trip,
      members.find((m) => m.user_id === third)!.id,
    ]);
    await act(third);
    await expect(
      db.query("select accept_trip_invitation($1)", [hash("b")]),
    ).rejects.toThrow(/unavailable/);
    expect(
      (await db.query("select id from trips where id=$1", [trip])).rows,
    ).toHaveLength(0);
    await act();
    await create("c");
    await act(third);
    await db.query("select accept_trip_invitation($1)", [hash("c")]);
    expect(
      (
        await db.query("select role from trip_members where user_id=$1", [
          third,
        ])
      ).rows,
    ).toEqual([{ role: "editor" }]);
    await act();
    const revoked = await create("d");
    await db.query("select revoke_trip_invitation($1,$2)", [trip, revoked]);
    await act(other);
    expect(await preview("d")).toEqual({ state: "revoked" });
    await expect(
      db.query("select accept_trip_invitation($1)", [hash("d")]),
    ).rejects.toThrow(/unavailable/);
    await act();
    const expired = await create("e");
    await db.exec("reset role");
    await db.query(
      "update trip_invitations set expires_at=now()-interval '1 second' where id=$1",
      [expired],
    );
    await act(other);
    expect(await preview("e")).toEqual({ state: "expired" });
    await expect(
      db.query("select accept_trip_invitation($1)", [hash("e")]),
    ).rejects.toThrow(/expired/);
    expect(
      (await db.query("select id from trips where id=$1", [draft])).rows,
    ).toHaveLength(0);
    await db.exec("reset role;set role anon;set request.jwt.claim.sub=''");
    await expect(preview("c")).rejects.toThrow(/permission/);
    await expect(
      db.query("select accept_trip_invitation($1)", [hash("c")]),
    ).rejects.toThrow(/permission/);
    expect(legacy).toBeTruthy();
  } finally {
    await db.close();
  }
}, 30000);
it("new link editor edits the same trip through existing RPCs with conflicts, cross-trip isolation and private-file boundaries", async () => {
  const f = await fixture();
  try {
    await f.create("b");
    await f.act(other);
    await f.db.query("select accept_trip_invitation($1)", [hash("b")]);
    await assertEditorPermissions(f);
  } finally {
    await f.db.close();
  }
}, 30000);

it("preserves already-accepted legacy membership, bookings and private originals on migration", async () => {
  const f = await fixture(true);
  try {
    await f.act(other);
    expect(await f.preview("a")).toMatchObject({
      state: "accepted",
      kind: "email",
      trip_id: f.trip,
    });
    await f.db.query("select accept_trip_invitation($1)", [hash("a")]);
    expect(
      (await f.db.query("select id from bookings where trip_id=$1", [f.trip]))
        .rows,
    ).toHaveLength(1);
    expect(
      (
        await f.db.query(
          "select id from booking_attachments where trip_id=$1",
          [f.trip],
        )
      ).rows,
    ).toHaveLength(0);
    await f.act();
    expect(
      (
        await f.db.query(
          "select file_scope from booking_attachments where trip_id=$1",
          [f.trip],
        )
      ).rows,
    ).toEqual([{ file_scope: "private" }]);
  } finally {
    await f.db.close();
  }
}, 30000);
