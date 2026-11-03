import { it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
it("enforces bulk insert roles, preserves packed states on retries and rolls back an invalid batch", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create schema auth;create role authenticated;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated;grant execute on function auth.uid() to authenticated;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert,delete on storage.objects to authenticated;`,
    );
    for (const file of [
      "migrations/001_foundation.sql",
      "migrations/002_guided_destinations.sql",
      "migrations/003_travel_essentials.sql",
      "migrations/004_private_booking_files.sql",
      "upgrade_phase2_to_phase4.sql",
    ])
      await db.exec(readFileSync("supabase/" + file, "utf8"));
    const [owner, editor, viewer] = [1, 2, 3].map(
      (n) => `${n}1111111-1111-4111-8111-111111111111`,
    );
    for (const id of [owner, editor, viewer])
      await db.query("insert into auth.users values($1,$2,now())", [
        id,
        id + "@example.com",
      ]);
    const act = async (id: string) =>
      db.exec(
        `reset role;set role authenticated;set request.jwt.claim.sub='${id}'`,
      );
    await act(owner);
    const trip = (
      await db.query<{ id: string }>(
        `insert into trips(owner_id,name,start_date,end_date,timezone,style,currency) values($1,'Ready trip','2027-05-01','2027-05-10','UTC','Comfort','EUR') returning id`,
        [owner],
      )
    ).rows[0].id;
    for (const [id, role] of [
      [editor, "editor"],
      [viewer, "viewer"],
    ])
      await db.query(
        "insert into trip_members(trip_id,user_id,role) values($1,$2,$3)",
        [trip, id, role],
      );
    const list = (
      await db.query<{ id: string }>(
        `insert into packing_lists(trip_id,traveler) values($1,'Shared') returning id`,
        [trip],
      )
    ).rows[0].id;
    await act(editor);
    const item = crypto.randomUUID();
    const insert = () =>
      db.query(
        `insert into packing_items(id,trip_id,list_id,title,category,quantity,packed) values($1,$2,$3,'Cable','Electronics',1,false) on conflict(id) do nothing returning id`,
        [item, trip, list],
      );
    expect((await insert()).rows).toHaveLength(1);
    await db.query(
      "update packing_items set packed=true,quantity=3 where id=$1",
      [item],
    );
    expect((await insert()).rows).toHaveLength(0);
    expect(
      (await db.query("select packed,quantity from packing_items")).rows[0],
    ).toEqual({ packed: true, quantity: 3 });
    const batchId = crypto.randomUUID();
    await expect(
      db.query(
        `insert into packing_items(id,trip_id,list_id,title,category,quantity) values($1,$2,$3,'First','Other',1),($4,$2,$5,'Invalid','Other',1) on conflict(id) do nothing`,
        [batchId, trip, list, crypto.randomUUID(), crypto.randomUUID()],
      ),
    ).rejects.toThrow();
    expect(
      (await db.query("select id from packing_items where id=$1", [batchId]))
        .rows,
    ).toHaveLength(0);
    await act(viewer);
    await expect(insert()).rejects.toThrow();
    await expect(
      db.query(
        `insert into prep_tasks(trip_id,title,category) values($1,'Task','Other') on conflict do nothing`,
        [trip],
      ),
    ).rejects.toThrow();
    await expect(
      db.query(
        `insert into budget_allocations(trip_id,currency,category,day,planned) values($1,'EUR','Food','2027-05-01',5) on conflict do nothing`,
        [trip],
      ),
    ).rejects.toThrow();
    expect((await db.query("select * from packing_items")).rows).toHaveLength(
      1,
    );
  } finally {
    await db.close();
  }
}, 30000);
