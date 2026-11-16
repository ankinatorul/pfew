import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { reviewDatabase, owner, other } from "./fixtures/review-database";
const hash = (n: string) => n.repeat(64);
async function fixture() {
  const f = await reviewDatabase();
  const trip = await f.create();
  await f.finalize(trip);
  const draft = await f.create();
  await f.db.exec("reset role");
  await f.db.query(
    "update auth.users set email=case when id=$1 then 'owner@example.com' else 'editor@example.com' end,email_confirmed_at=now()",
    [owner],
  );
  const stranger = crypto.randomUUID(),
    unverified = crypto.randomUUID();
  await f.db.query(
    "insert into auth.users(id,email,email_confirmed_at) values($1,'stranger@example.com',now()),($2,'unverified@example.com',null)",
    [stranger, unverified],
  );
  for (const file of [
    "014_itinerary_planning.sql",
    "015_bookings_and_budget.sql",
    "016_packing_and_documents.sql",
    "017_booking_payment_due.sql",
    "018_unified_booking_editor.sql",
  ])
    await f.db.exec(readFileSync("supabase/migrations/" + file, "utf8"));
  await f.db.exec(
    "grant truncate on public.trips,public.expenses to authenticated,anon",
  );
  const legacyFile = crypto.randomUUID(),
    legacyPath = `${owner}/${trip}/documents/${legacyFile}`;
  await f.db.query(
    "insert into booking_attachments(id,trip_id,owner_id,path,filename,content_type,size,document_kind,document_category,content_sha256) values($1,$2,$3,$4,'legacy-personal.pdf','application/pdf',10,'trip','Passport & ID',$5)",
    [legacyFile, trip, owner, legacyPath, hash("a")],
  );
  await f.db.query(
    "insert into storage.objects(bucket_id,name) values('booking-files',$1)",
    [legacyPath],
  );
  await f.db.query("update booking_attachments set state='ready' where id=$1", [
    legacyFile,
  ]);
  const filesBefore = (
    await f.db.query("select to_jsonb(a) a from booking_attachments a")
  ).rows;
  const before = (
    await f.db.query("select to_jsonb(t) t from trips t order by id")
  ).rows;
  await f.db.exec(
    readFileSync("supabase/VERIFY_COLLABORATION_V1A_READ_ONLY.sql", "utf8"),
  );
  await f.db.exec(
    readFileSync("supabase/migrations/019_trip_collaboration_v1a.sql", "utf8"),
  );
  await f.db.exec(
    readFileSync("supabase/VERIFY_COLLABORATION_V1A_READ_ONLY.sql", "utf8"),
  );
  expect(
    (
      await f.db.query(
        "select to_jsonb(t)-'trip_revision' t from trips t order by id",
      )
    ).rows,
  ).toEqual(before);
  expect(
    (
      await f.db.query(
        "select has_table_privilege('authenticated','public.trips','TRUNCATE') allowed",
      )
    ).rows[0],
  ).toEqual({ allowed: false });
  expect(
    (
      await f.db.query(
        "select to_jsonb(a)-'file_scope' a from booking_attachments a",
      )
    ).rows,
  ).toEqual(filesBefore);
  expect(
    (
      await f.db.query(
        "select file_scope from booking_attachments where id=$1",
        [legacyFile],
      )
    ).rows[0],
  ).toEqual({ file_scope: "private" });
  await f.act();
  return { ...f, trip, draft, stranger, unverified };
}
it("enforces hashed recipient-bound invitations, acceptance, revocation, decline, expiry and single-use membership", async () => {
  const f = await fixture();
  const { db, trip, act, draft, stranger, unverified } = f;
  try {
    const invite = async (email: string, h: string) =>
      (
        await db.query<{ id: string }>(
          "select create_trip_invitation($1,$2,$3) id",
          [trip, email, hash(h)],
        )
      ).rows[0].id;
    await expect(
      db.query("select create_trip_invitation($1,'editor@example.com',$2)", [
        draft,
        hash("a"),
      ]),
    ).rejects.toThrow(/finalized/);
    const ident = await invite("EDITOR@example.com", "a");
    await expect(invite("editor@example.com", "b")).rejects.toThrow(
      /already pending/,
    );
    await expect(
      db.query(
        "insert into trip_members(trip_id,user_id,role) values($1,$2,'editor')",
        [trip, other],
      ),
    ).rejects.toThrow(/permission/);
    await act(stranger);
    expect(
      (await db.query("select preview_trip_invitation($1) x", [hash("a")]))
        .rows[0],
    ).toEqual({ x: null });
    await expect(
      db.query("select accept_trip_invitation($1)", [hash("a")]),
    ).rejects.toThrow(/unavailable/);
    expect((await db.query("select * from trips")).rows).toHaveLength(0);
    await act(other);
    expect(
      (await db.query<{ x: unknown[] }>("select list_my_trip_invitations() x"))
        .rows[0].x,
    ).toMatchObject([{ id: ident, role: "editor" }]);
    await expect(
      db.query("select create_trip_invitation($1,'stranger@example.com',$2)", [
        trip,
        hash("b"),
      ]),
    ).rejects.toThrow(/owner/);
    expect(
      (await db.query("select preview_trip_invitation($1) x", [hash("a")]))
        .rows[0],
    ).toMatchObject({ x: { state: "valid" } });
    await db.query("select accept_trip_invitation($1)", [hash("a")]);
    expect(
      (await db.query("select preview_trip_invitation($1) x", [hash("a")]))
        .rows[0],
    ).toMatchObject({ x: { state: "accepted", trip_id: trip } });
    await db.query("select accept_trip_invitation($1)", [hash("a")]);
    expect((await db.query("select id from trips order by id")).rows).toEqual([
      { id: trip },
    ]);
    const member = (
      await db.query<{ id: string }>(
        "select id from trip_members where trip_id=$1",
        [trip],
      )
    ).rows[0].id;
    await expect(
      db.query("select revoke_trip_invitation($1,$2)", [trip, ident]),
    ).rejects.toThrow(/owner/);
    expect(
      (await db.query("delete from trips where id=$1 returning id", [trip]))
        .rows,
    ).toEqual([]);
    await expect(
      db.query("update trips set owner_id=$1 where id=$2", [other, trip]),
    ).rejects.toThrow();
    await expect(
      db.query("update trips set draft_data='{}' where id=$1", [trip]),
    ).rejects.toThrow(/owner/);
    await act();
    await db.query("select manage_trip_member($1,$2,0,true)", [trip, member]);
    await expect(
      db.query("select manage_trip_member($1,$2,0,true)", [trip, member]),
    ).rejects.toThrow(/changed/);
    await act(other);
    expect((await db.query("select * from trips")).rows).toHaveLength(0);
    await expect(
      db.query("select accept_trip_invitation($1)", [hash("a")]),
    ).rejects.toThrow(/unavailable|access removed/);
    await act();
    const revoked = await invite("editor@example.com", "b");
    await db.query("select revoke_trip_invitation($1,$2)", [trip, revoked]);
    await act(other);
    expect(
      (await db.query("select preview_trip_invitation($1) x", [hash("b")]))
        .rows[0],
    ).toEqual({ x: { state: "revoked" } });
    await expect(
      db.query("select accept_trip_invitation($1)", [hash("b")]),
    ).rejects.toThrow(/unavailable/);
    await act();
    await invite("editor@example.com", "c");
    await act(other);
    await db.query("select decline_trip_invitation($1)", [hash("c")]);
    expect(
      (await db.query("select preview_trip_invitation($1) x", [hash("c")]))
        .rows[0],
    ).toEqual({ x: { state: "declined" } });
    await expect(
      db.query("select accept_trip_invitation($1)", [hash("c")]),
    ).rejects.toThrow(/unavailable/);
    await act();
    const expired = await invite("editor@example.com", "d");
    await db.exec("reset role");
    await db.query(
      "update trip_invitations set expires_at=now()-interval '1 second' where id=$1",
      [expired],
    );
    await act(other);
    expect(
      (await db.query("select preview_trip_invitation($1) x", [hash("d")]))
        .rows[0],
    ).toEqual({ x: { state: "expired" } });
    await act(stranger);
    expect(
      (await db.query("select preview_trip_invitation($1) x", [hash("d")]))
        .rows[0],
    ).toEqual({ x: null });
    await act(other);
    await expect(
      db.query("select accept_trip_invitation($1)", [hash("d")]),
    ).rejects.toThrow(/expired/);
    await act();
    await invite("unverified@example.com", "e");
    await act(unverified);
    await expect(
      db.query("select accept_trip_invitation($1)", [hash("e")]),
    ).rejects.toThrow();
    await act();
    await invite("editor@example.com", "f");
    await act(other);
    await db.query("select accept_trip_invitation($1)", [hash("f")]);
    expect(
      (await db.query("select id from trip_members where trip_id=$1", [trip]))
        .rows,
    ).toHaveLength(1);
    expect(
      (await db.query("select id from trips where id=$1", [draft])).rows,
    ).toHaveLength(0);
  } finally {
    await db.close();
  }
}, 30000);
it("shares only explicitly shared files, keeps identity documents private, preserves content permissions and detects conflicts", async () => {
  const f = await fixture();
  const { db, trip, act, stranger, draft } = f;
  try {
    await db.query(
      "select create_trip_invitation($1,'editor@example.com',$2)",
      [trip, hash("a")],
    );
    await act(other);
    await db.query("select accept_trip_invitation($1)", [hash("a")]);
    await db.query("select save_shared_trip_details($1,0,$2::jsonb)", [
      trip,
      JSON.stringify({
        ...f.basics,
        travelers: 2,
        style: "Comfort",
        currency: "EUR",
        budget: 100,
      }),
    ]);
    await expect(
      db.query("select save_shared_trip_details($1,0,$2::jsonb)", [
        trip,
        JSON.stringify({
          ...f.basics,
          name: "Stale",
          travelers: 2,
          style: "Comfort",
          currency: "EUR",
        }),
      ]),
    ).rejects.toThrow(/changed/);
    const segment = crypto.randomUUID(),
      booking = crypto.randomUUID(),
      expense = crypto.randomUUID(),
      list = crypto.randomUUID(),
      item = crypto.randomUUID();
    await db.query(
      "insert into trip_segments(id,trip_id,kind,title,start_date,end_date,timezone) values($1,$2,'activity','Shared activity','2027-06-01','2027-06-01','Europe/Paris')",
      [segment, trip],
    );
    await db.query(
      "insert into bookings(id,trip_id,title,category,start_date,end_date,timezone,currency) values($1,$2,'Shared booking','flight','2027-06-01','2027-06-01','Europe/Paris','EUR')",
      [booking, trip],
    );
    await db.query(
      "insert into expenses(id,trip_id,title,amount,currency,category,day,payment_method) values($1,$2,'Shared cost',10,'EUR','Other','2027-06-01','card')",
      [expense, trip],
    );
    await db.query(
      "insert into packing_lists(id,trip_id,traveler) values($1,$2,'Shared list')",
      [list, trip],
    );
    await db.query(
      "insert into packing_items(id,trip_id,list_id,title,category,quantity) values($1,$2,$3,'Shared item','Other',1)",
      [item, trip, list],
    );
    await act();
    const file = crypto.randomUUID(),
      personal = crypto.randomUUID();
    const path = `${owner}/${trip}/${booking}/${file}`;
    await db.query(
      "insert into booking_attachments(id,trip_id,booking_id,owner_id,path,filename,content_type,size) values($1,$2,$3,$4,$5,'confirmation.pdf','application/pdf',10)",
      [file, trip, booking, owner, path],
    );
    await db.query(
      "insert into storage.objects(bucket_id,name) values('booking-files',$1)",
      [path],
    );
    await db.query("update booking_attachments set state='ready' where id=$1", [
      file,
    ]);
    const privatePath = `${owner}/${trip}/documents/${personal}`;
    await db.query(
      "insert into booking_attachments(id,trip_id,owner_id,path,filename,content_type,size,document_kind,document_category,content_sha256) values($1,$2,$3,$4,'identity.pdf','application/pdf',10,'trip','Passport & ID',$5)",
      [personal, trip, owner, privatePath, hash("a")],
    );
    await act(other);
    expect((await db.query("select id from booking_attachments")).rows).toEqual(
      [],
    );
    expect((await db.query("select name from storage.objects")).rows).toEqual(
      [],
    );
    await act();
    const revision = (
      await db.query<{ document_revision: number }>(
        "select document_revision from booking_attachments where id=$1",
        [file],
      )
    ).rows[0].document_revision;
    await db.query("select set_trip_file_scope($1,$2,$3,'shared')", [
      trip,
      file,
      revision,
    ]);
    await expect(
      db.query("select set_trip_file_scope($1,$2,0,'shared')", [
        trip,
        personal,
      ]),
    ).rejects.toThrow(/identity/);
    await act(other);
    expect((await db.query("select id from booking_attachments")).rows).toEqual(
      [{ id: file }],
    );
    expect((await db.query("select name from storage.objects")).rows).toEqual([
      { name: path },
    ]);
    expect(
      (
        await db.query(
          "delete from storage.objects where name=$1 returning name",
          [path],
        )
      ).rows,
    ).toEqual([]);
    await expect(
      db.query("select set_trip_file_scope($1,$2,2,'private')", [trip, file]),
    ).rejects.toThrow(/permission/);
    expect(
      (await db.query("select id from trips where id=$1", [draft])).rows,
    ).toEqual([]);
    await act(stranger);
    expect((await db.query("select * from trip_segments")).rows).toEqual([]);
    expect((await db.query("select * from storage.objects")).rows).toEqual([]);
    await act();
    const m = (
      await db.query<{ id: string }>(
        "select id from trip_members where trip_id=$1",
        [trip],
      )
    ).rows[0];
    await db.query("select manage_trip_member($1,$2,0,true)", [trip, m.id]);
    await act(other);
    expect((await db.query("select * from booking_attachments")).rows).toEqual(
      [],
    );
    expect((await db.query("select * from storage.objects")).rows).toEqual([]);
    await expect(
      db.query(
        "insert into expenses(trip_id,amount,currency,category,day,payment_method) values($1,1,'EUR','Other','2027-06-01','cash')",
        [trip],
      ),
    ).rejects.toThrow();
    await db.exec("reset role;set role anon");
    await expect(db.query("select list_my_trip_invitations()")).rejects.toThrow(
      /permission/,
    );
  } finally {
    await db.close();
  }
}, 30000);
it("permits editor content CRUD on the same trip while denying a different finalized trip and membership mutation", async () => {
  const f = await fixture();
  const { db, trip, act } = f;
  try {
    const foreign = await f.create();
    await f.finalize(foreign);
    await db.query(
      "select create_trip_invitation($1,'editor@example.com',$2)",
      [trip, hash("a")],
    );
    await act(other);
    await db.query("select accept_trip_invitation($1)", [hash("a")]);
    const segment = crypto.randomUUID(),
      booking = crypto.randomUUID(),
      expense = crypto.randomUUID();
    await db.query(
      "insert into trip_segments(id,trip_id,kind,title,start_date,end_date,timezone) values($1,$2,'activity','Fixture activity','2027-06-01','2027-06-01','UTC')",
      [segment, trip],
    );
    await db.query(
      "update trip_segments set title='Edited fixture' where id=$1",
      [segment],
    );
    await db.query(
      "insert into bookings(id,trip_id,title,category,start_date,end_date,timezone,currency) values($1,$2,'Fixture booking','activity','2027-06-01','2027-06-01','UTC','EUR')",
      [booking, trip],
    );
    await db.query("update bookings set title='Edited booking' where id=$1", [
      booking,
    ]);
    await db.query(
      "insert into expenses(id,trip_id,title,amount,currency,category,day,payment_method) values($1,$2,'Fixture expense',10,'EUR','Other','2027-06-01','cash')",
      [expense, trip],
    );
    await db.query("update expenses set amount=11 where id=$1", [expense]);
    await db.query("select save_monetary_budget($1,50,'EUR',null,'EUR')", [
      trip,
    ]);
    await expect(
      db.query(
        "insert into expenses(trip_id,amount,currency,category,day,payment_method) values($1,1,'EUR','Other','2027-06-01','cash')",
        [foreign],
      ),
    ).rejects.toThrow();
    await expect(
      db.query("update bookings set trip_id=$1 where id=$2", [
        foreign,
        booking,
      ]),
    ).rejects.toThrow();
    expect(
      (await db.query("select id from trips where id=$1", [foreign])).rows,
    ).toEqual([]);
    await expect(
      db.query("update trip_members set role='viewer' where trip_id=$1", [
        trip,
      ]),
    ).rejects.toThrow(/permission/);
    for (const [table, id] of [
      ["bookings", booking],
      ["trip_segments", segment],
      ["expenses", expense],
    ])
      expect(
        (await db.query(`delete from ${table} where id=$1 returning id`, [id]))
          .rows,
      ).toHaveLength(1);
    // Editors can add their own shared document; no other uploader's bytes are exposed.
    const file = crypto.randomUUID(),
      path = `${other}/${trip}/documents/${file}`;
    await db.query(
      "insert into booking_attachments(id,trip_id,owner_id,path,filename,content_type,size,document_kind,content_sha256,file_scope) values($1,$2,$3,$4,'shared.pdf','application/pdf',10,'trip',$5,'shared')",
      [file, trip, other, path, hash("a")],
    );
    await db.query(
      "insert into storage.objects(bucket_id,name) values('booking-files',$1)",
      [path],
    );
    await db.query("update booking_attachments set state='ready' where id=$1", [
      file,
    ]);
    await act();
    expect(
      (await db.query("select id from booking_attachments where id=$1", [file]))
        .rows,
    ).toEqual([{ id: file }]);
    const m = (
      await db.query<{ id: string }>(
        "select id from trip_members where trip_id=$1",
        [trip],
      )
    ).rows[0];
    await db.query("select manage_trip_member($1,$2,0,true)", [trip, m.id]);
    expect(
      (await db.query("select has_other_private_files($1) blocked", [trip]))
        .rows[0],
    ).toEqual({ blocked: false });
    expect(
      (
        await db.query(
          "delete from storage.objects where name=$1 returning name",
          [path],
        )
      ).rows,
    ).toEqual([{ name: path }]);
    expect(
      (
        await db.query(
          "delete from booking_attachments where id=$1 returning id",
          [file],
        )
      ).rows,
    ).toEqual([{ id: file }]);
  } finally {
    await db.close();
  }
}, 30000);
