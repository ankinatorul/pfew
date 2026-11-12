import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { reviewDatabase, owner, other } from "./fixtures/review-database";
const sql = readFileSync(
  "supabase/migrations/016_packing_and_documents.sql",
  "utf8",
);
async function setup() {
  const f = await reviewDatabase();
  const trip = await f.create();
  await f.finalize(trip);
  await f.db.exec("reset role");
  await f.db.exec(
    readFileSync("supabase/migrations/014_itinerary_planning.sql", "utf8"),
  );
  await f.db.exec(
    readFileSync("supabase/migrations/015_bookings_and_budget.sql", "utf8"),
  );
  await f.db.exec(sql);
  await f.act();
  return { ...f, trip };
}
it("persists packing CRUD, completion, quantities and reorder with stable retries, duplicates and stale edits protected", async () => {
  const { db, trip, act } = await setup();
  try {
    const command = (c: unknown) =>
      db.query<{ r: { id?: string; message?: string } }>(
        "select change_packing($1,$2::jsonb) r",
        [trip, JSON.stringify(c)],
      );
    const list = crypto.randomUUID();
    await command({ op: "list", id: list, traveler: "My list" });
    const id = crypto.randomUUID(),
      input = {
        id,
        revision: 0,
        list_id: list,
        title: "Cable",
        category: "Electronics",
        quantity: 2,
        notes: "My device",
      };
    await command({ op: "save", input });
    await command({ op: "save", input });
    await command({ op: "packed", id, revision: 0, packed: true });
    await command({
      op: "save",
      input: { ...input, id: crypto.randomUUID(), title: "  CABLE  " },
    });
    expect(
      (
        await db.query(
          "select title,packed,quantity,notes from packing_items where list_id=$1",
          [list],
        )
      ).rows,
    ).toEqual([
      { title: "Cable", packed: true, quantity: 2, notes: "My device" },
    ]);
    await expect(command({ op: "save", input })).rejects.toThrow(/changed/);
    const second = { ...input, id: crypto.randomUUID(), title: "Adapter" };
    await command({ op: "save", input: second });
    await command({
      op: "reorder",
      list_id: list,
      order: [
        { id, revision: 1 },
        { id: second.id, revision: 0 },
      ],
    });
    expect(
      (
        await db.query<{ id: string }>(
          "select id from packing_items where list_id=$1 order by position",
          [list],
        )
      ).rows.map((r) => r.id),
    ).toEqual([id, second.id]);
    await expect(
      command({ op: "reorder", list_id: list, order: [{ id, revision: 1 }] }),
    ).rejects.toThrow(/changed/);
    await act(other);
    await expect(command({ op: "delete", id, revision: 1 })).rejects.toThrow(
      /permission/,
    );
    await act();
    const r = (
      await db.query<{ r: number }>(
        "select packing_revision r from packing_items where id=$1",
        [id],
      )
    ).rows[0].r;
    await command({ op: "delete", id, revision: r });
    expect(
      (await db.query("select id from packing_items where id=$1", [id])).rows,
    ).toEqual([]);
  } finally {
    await db.close();
  }
}, 30000);
it("copies only owned list definitions and templates, skips duplicates, and preserves source packed states and notes", async () => {
  const { db, trip, act, create, finalize } = await setup();
  try {
    const sourceTrip = await create();
    await finalize(sourceTrip);
    const source = crypto.randomUUID(),
      target = crypto.randomUUID();
    await db.query(
      "insert into packing_lists(id,trip_id,traveler) values($1,$2,'Source'),($3,$4,'Target')",
      [source, sourceTrip, target, trip],
    );
    await db.query(
      "insert into packing_items(trip_id,list_id,title,category,quantity,packed,notes) values($1,$2,'Shirt','Clothing',3,true,'Private source note')",
      [sourceTrip, source],
    );
    const call = (op: string, src: string) =>
      db.query("select change_packing($1,$2::jsonb)", [
        trip,
        JSON.stringify({ op, list_id: target, source: src }),
      ]);
    await call("copy", source);
    await call("copy", source);
    expect(
      (
        await db.query(
          "select title,quantity,packed,notes from packing_items where list_id=$1",
          [target],
        )
      ).rows,
    ).toEqual([{ title: "Shirt", quantity: 3, packed: false, notes: "" }]);
    expect(
      (
        await db.query(
          "select packed,notes from packing_items where list_id=$1",
          [source],
        )
      ).rows,
    ).toEqual([{ packed: true, notes: "Private source note" }]);
    const template = crypto.randomUUID();
    await db.query(
      'insert into packing_templates(id,owner_id,name,items) values($1,$2,\'Saved\',\'[{"title":"Cable","category":"Electronics","quantity":1}]\')',
      [template, owner],
    );
    await call("template", template);
    await call("template", template);
    expect(
      (
        await db.query("select id from packing_items where list_id=$1", [
          target,
        ])
      ).rows,
    ).toHaveLength(2);
    await db.query(
      "insert into trip_members(trip_id,user_id,role) values($1,$2,'editor')",
      [trip, other],
    );
    await act(other);
    await expect(call("copy", source)).rejects.toThrow(/own saved/);
    await act();
  } finally {
    await db.close();
  }
}, 30000);
it("keeps independent originals private in the existing bucket and cannot retag a booking file to bypass its guard", async () => {
  const { db, trip, act } = await setup();
  try {
    const id = crypto.randomUUID(),
      path = [owner, trip, "documents", id].join("/");
    await db.query(
      "insert into booking_attachments(id,trip_id,owner_id,path,filename,content_type,size,state,content_sha256,document_kind,display_name,document_category) values($1,$2,$3,$4,'insurance.pdf','application/pdf',100,'pending',$5,'trip','Insurance','Insurance')",
      [id, trip, owner, path, "a".repeat(64)],
    );
    await expect(
      db.query("update booking_attachments set state='ready' where id=$1", [
        id,
      ]),
    ).rejects.toThrow(/complete/);
    await db.query(
      "insert into storage.objects(bucket_id,name) values('booking-files',$1)",
      [path],
    );
    await db.query("update booking_attachments set state='ready' where id=$1", [
      id,
    ]);
    await db.query(
      "select save_document_metadata($1,$2,1,'Travel insurance','Insurance',false)",
      [trip, id],
    );
    await expect(
      db.query("select save_document_metadata($1,$2,1,'Stale','Other',false)", [
        trip,
        id,
      ]),
    ).rejects.toThrow(/changed/);
    await expect(
      db.query(
        "update booking_attachments set document_kind='booking' where id=$1",
        [id],
      ),
    ).rejects.toThrow();
    await act(other);
    expect(
      (await db.query("select id from booking_attachments where id=$1", [id]))
        .rows,
    ).toEqual([]);
    expect(
      (await db.query("select name from storage.objects where name=$1", [path]))
        .rows,
    ).toEqual([]);
    await expect(
      db.query("select save_document_metadata($1,$2,2,'No','Other',false)", [
        trip,
        id,
      ]),
    ).rejects.toThrow(/unavailable/);
    await act();
    await expect(
      db.query("delete from booking_attachments where id=$1", [id]),
    ).rejects.toThrow(/stored private/);
    await db.query("delete from storage.objects where name=$1", [path]);
    await db.query("delete from booking_attachments where id=$1", [id]);
  } finally {
    await db.close();
  }
}, 30000);
it("hides booking shortcuts without deleting or moving confirmations and preserves user-driven reminders", async () => {
  const { db, trip, act } = await setup();
  try {
    const booking = crypto.randomUUID(),
      file = crypto.randomUUID(),
      path = [owner, trip, booking, file].join("/");
    await db.query(
      "insert into bookings(id,trip_id,title,category,start_date,end_date,timezone,currency) values($1,$2,'Saved booking','flight','2027-06-01','2027-06-01','Europe/Paris','EUR')",
      [booking, trip],
    );
    await db.query(
      "insert into booking_attachments(id,trip_id,booking_id,owner_id,path,filename,content_type,size,state) values($1,$2,$3,$4,$5,'ticket.pdf','application/pdf',100,'pending')",
      [file, trip, booking, owner, path],
    );
    await db.query(
      "insert into storage.objects(bucket_id,name) values('booking-files',$1)",
      [path],
    );
    await db.query("update booking_attachments set state='ready' where id=$1", [
      file,
    ]);
    await db.query(
      "select save_document_metadata($1,$2,1,'Flight ticket','Tickets',true)",
      [trip, file],
    );
    expect(
      (
        await db.query(
          "select path,booking_id,documents_hidden from booking_attachments where id=$1",
          [file],
        )
      ).rows,
    ).toEqual([{ path, booking_id: booking, documents_hidden: true }]);
    expect(
      (await db.query("select name from storage.objects where name=$1", [path]))
        .rows,
    ).toHaveLength(1);
    const reminder = {
      id: crypto.randomUUID(),
      revision: 0,
      title: "Check travel documents",
      category: "Documents",
      due_date: "",
      done: false,
    };
    const save = (fields: unknown) =>
      db.query("select change_preparation_reminder($1,$2::jsonb)", [
        trip,
        JSON.stringify(fields),
      ]);
    await save(reminder);
    await save({ ...reminder, id: crypto.randomUUID() });
    expect(
      (
        await db.query(
          "select done,due_date from prep_tasks where trip_id=$1",
          [trip],
        )
      ).rows,
    ).toEqual([{ done: false, due_date: null }]);
    await save({ ...reminder, done: true });
    await expect(save(reminder)).rejects.toThrow(/changed/);
    await act(other);
    await expect(save({ ...reminder, revision: 1 })).rejects.toThrow(
      /permission/,
    );
    await act();
    await db.exec("reset role");
    await db.exec(sql);
  } finally {
    await db.close();
  }
}, 30000);
it("isolates lists and uploads across trips/drafts while preserving edit access to completed trips", async () => {
  const { db, trip, act, create, finalize } = await setup();
  try {
    const second = await create(),
      draft = await create();
    await finalize(second);
    const list = crypto.randomUUID();
    await db.query(
      "insert into packing_lists(id,trip_id,traveler) values($1,$2,'Existing list')",
      [list, trip],
    );
    const item = {
      id: crypto.randomUUID(),
      revision: 0,
      list_id: list,
      title: "An item",
      category: "Other",
      quantity: 1,
      notes: "",
    };
    const call = (target: string, c: unknown) =>
      db.query("select change_packing($1,$2::jsonb)", [
        target,
        JSON.stringify(c),
      ]);
    await expect(call(second, { op: "save", input: item })).rejects.toThrow(
      /unavailable/,
    );
    await expect(
      call(draft, {
        op: "list",
        id: crypto.randomUUID(),
        traveler: "Draft list",
      }),
    ).rejects.toThrow(/permission/);
    const file = crypto.randomUUID();
    await expect(
      db.query(
        "insert into booking_attachments(id,trip_id,owner_id,path,filename,content_type,size,state,content_sha256,document_kind) values($1,$2,$3,$4,'private.pdf','application/pdf',100,'pending',$5,'trip')",
        [
          file,
          draft,
          owner,
          [owner, draft, "documents", file].join("/"),
          "a".repeat(64),
        ],
      ),
    ).rejects.toThrow();
    await db.query(
      "update trips set start_date='2020-01-01',end_date='2020-01-03' where id=$1",
      [trip],
    );
    await call(trip, { op: "save", input: item });
    expect(
      (
        await db.query("select title from packing_items where trip_id=$1", [
          trip,
        ])
      ).rows,
    ).toEqual([{ title: "An item" }]);
    expect(
      (
        await db.query("select id from packing_items where trip_id=$1", [
          second,
        ])
      ).rows,
    ).toEqual([]);
    await db.query(
      "insert into trip_members(trip_id,user_id,role) values($1,$2,'viewer')",
      [trip, other],
    );
    await act(other);
    await expect(
      call(trip, { op: "packed", id: item.id, revision: 0, packed: true }),
    ).rejects.toThrow(/permission/);
    await act();
    for (const signature of [
      "public.change_packing(uuid,jsonb)",
      "public.change_preparation_reminder(uuid,jsonb,boolean)",
      "public.save_document_metadata(uuid,uuid,integer,text,text,boolean)",
    ])
      expect(
        (
          await db.query<{ allowed: boolean }>(
            "select has_function_privilege('anon',$1,'EXECUTE') allowed",
            [signature],
          )
        ).rows[0].allowed,
      ).toBe(false);
  } finally {
    await db.close();
  }
}, 30000);
it("executes read-only before/after checks and preserves legacy attachment bytes, paths and business records", async () => {
  const { db, act, create, finalize } = await reviewDatabase();
  try {
    const trip = await create();
    await finalize(trip);
    const booking = crypto.randomUUID(),
      file = crypto.randomUUID(),
      path = [owner, trip, booking, file].join("/");
    await db.query(
      "insert into bookings(id,trip_id,title,category,start_date,end_date,timezone,currency) values($1,$2,'Existing booking','flight','2027-06-01','2027-06-01','Europe/Paris','EUR')",
      [booking, trip],
    );
    await db.query(
      "insert into booking_attachments(id,trip_id,booking_id,owner_id,path,filename,content_type,size,state) values($1,$2,$3,$4,$5,'legacy.pdf','application/pdf',100,'pending')",
      [file, trip, booking, owner, path],
    );
    await db.query(
      "insert into storage.objects(bucket_id,name) values('booking-files',$1)",
      [path],
    );
    await db.query("update booking_attachments set state='ready' where id=$1", [
      file,
    ]);
    await db.exec("reset role");
    const script = readFileSync(
      "supabase/VERIFY_PHASE10_READ_ONLY.sql",
      "utf8",
    );
    const report = async () => {
      const results = await db.exec(script);
      return JSON.parse(
        (
          results.find((r) => r.rows.some((row) => "phase10_report" in row))!
            .rows[0] as { phase10_report: string }
        ).phase10_report,
      ) as {
        read_only: string;
        columns: { present: boolean }[];
        baselines: unknown[];
        routines: { signature: string; body_hash: string }[];
      };
    };
    const before = await report();
    await db.exec(sql);
    const after = await report();
    expect(before.read_only).toBe("on");
    expect(before.columns.every((c) => !c.present)).toBe(true);
    expect(after.columns.every((c) => c.present)).toBe(true);
    expect(after.baselines).toEqual(before.baselines);
    expect(
      after.routines.find(
        (r) => r.signature === "public.validate_private_upload()",
      )?.body_hash,
    ).toBe(
      before.routines.find(
        (r) => r.signature === "public.validate_private_upload()",
      )?.body_hash,
    );
    await act();
    expect(
      (await db.query("select name from storage.objects where name=$1", [path]))
        .rows,
    ).toEqual([{ name: path }]);
  } finally {
    await db.close();
  }
}, 30000);
