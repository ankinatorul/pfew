import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { it, expect } from "vitest";
it("enforces essentials ownership, template atomicity, private storage paths and repeatable migrations", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create schema auth;create role authenticated;create role anon;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema public,auth to authenticated;grant execute on function auth.uid() to authenticated;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert,delete on storage.objects to authenticated;`);
    for (const name of [
      "001_foundation.sql",
      "002_guided_destinations.sql",
      "003_travel_essentials.sql",
      "004_private_booking_files.sql",
    ])
      await db.exec(readFileSync("supabase/migrations/" + name, "utf8"));
    for (const name of [
      "003_travel_essentials.sql",
      "004_private_booking_files.sql",
    ])
      await db.exec(readFileSync("supabase/migrations/" + name, "utf8"));
    const owner = "11111111-1111-4111-8111-111111111111",
      other = "22222222-2222-4222-8222-222222222222";
    await db.exec(
      `insert into auth.users values('${owner}'),('${other}');set role authenticated;set request.jwt.claim.sub='${owner}'`,
    );
    const trip = (
      await db.query<{ id: string }>(
        `insert into trips(owner_id,name,start_date,end_date,timezone,style,currency) values($1,'Essentials','2027-05-01','2027-05-10','UTC','Comfort','EUR') returning id`,
        [owner],
      )
    ).rows[0].id;
    const trip2 = (
      await db.query<{ id: string }>(
        `insert into trips(owner_id,name,start_date,end_date,timezone,style,currency) values($1,'Other','2027-05-01','2027-05-10','UTC','Budget','EUR') returning id`,
        [owner],
      )
    ).rows[0].id;
    const booking = (
      await db.query<{ id: string }>(
        `insert into bookings(trip_id,title,category,start_date,end_date,timezone,currency) values($1,'Stay','accommodation','2027-05-01','2027-05-03','UTC','EUR') returning id`,
        [trip],
      )
    ).rows[0].id;
    await db.query(
      `insert into prep_tasks(trip_id,title) values($1,'Check documents')`,
      [trip],
    );
    const list = (
      await db.query<{ id: string }>(
        `insert into packing_lists(trip_id,traveler) values($1,'Shared') returning id`,
        [trip],
      )
    ).rows[0].id;
    await expect(
      db.query(
        `insert into packing_items(trip_id,list_id,title) values($1,$2,'Cross trip')`,
        [trip2, list],
      ),
    ).rejects.toThrow("same trip");
    await db.query(
      `insert into packing_items(trip_id,list_id,title,quantity) values($1,$2,'Socks',2)`,
      [trip, list],
    );
    const template = (
      await db.query<{ id: string }>(
        `insert into packing_templates(owner_id,name,items) values($1,'Weekend','[{"title":"Shirt","quantity":1,"category":"Clothes"}]') returning id`,
        [owner],
      )
    ).rows[0].id;
    await db.query("select apply_packing_template($1,$2)", [list, template]);
    expect((await db.query("select * from packing_items")).rows).toHaveLength(
      2,
    );
    const bad = (
      await db.query<{ id: string }>(
        `insert into packing_templates(owner_id,name,items) values($1,'Broken','[{"title":"Valid","quantity":1,"category":"Clothes"},{"title":"Invalid","quantity":0,"category":"Clothes"}]') returning id`,
        [owner],
      )
    ).rows[0].id;
    await expect(
      db.query("select apply_packing_template($1,$2)", [list, bad]),
    ).rejects.toThrow();
    expect((await db.query("select * from packing_items")).rows).toHaveLength(
      2,
    );
    await db.query(`insert into budget_settings(trip_id) values($1)`, [trip]);
    await db.query(
      `insert into budget_allocations(trip_id,currency,category,planned) values($1,'EUR','Food',100)`,
      [trip],
    );
    await expect(
      db.query(
        `insert into budget_allocations(trip_id,currency,category,planned,estimate_low,estimate_high) values($1,'EUR','Bad',100,10,null)`,
        [trip],
      ),
    ).rejects.toThrow();
    await db.query(
      `insert into expenses(trip_id,amount,currency,category,day,payment_method) values($1,10,'EUR','Lunch','2027-05-01','cash')`,
      [trip],
    );
    const attachment = "33333333-3333-4333-8333-333333333333",
      path = [owner, trip, booking, attachment].join("/");
    await db.query(
      `insert into booking_attachments(id,trip_id,booking_id,owner_id,path,filename,content_type,size) values($1,$2,$3,$4,$5,'booking.pdf','application/pdf',100)`,
      [attachment, trip, booking, owner, path],
    );
    await db.query(
      `insert into storage.objects(bucket_id,name) values('booking-files',$1)`,
      [path],
    );
    expect((await db.query("select * from storage.objects")).rows).toHaveLength(
      1,
    );
    await db.exec(`set request.jwt.claim.sub='${other}'`);
    for (const table of [
      "bookings",
      "prep_tasks",
      "packing_lists",
      "packing_items",
      "packing_templates",
      "budget_settings",
      "budget_allocations",
      "expenses",
      "booking_attachments",
      "storage.objects",
    ]) {
      const t = table.includes(".") ? table : "public." + table;
      expect((await db.query("select * from " + t)).rows).toHaveLength(0);
    }
    await expect(
      db.query(
        `insert into storage.objects(bucket_id,name) values('booking-files',$1)`,
        [path],
      ),
    ).rejects.toThrow();
    await expect(
      db.query("select apply_packing_template($1,$2)", [list, template]),
    ).rejects.toThrow();
    await expect(
      db.query(
        `insert into expenses(trip_id,amount,currency,category,day,payment_method) values($1,10,'EUR','Intrusion','2027-05-01','cash')`,
        [trip],
      ),
    ).rejects.toThrow();
    await db.exec(`set request.jwt.claim.sub='${owner}'`);
    await db.query("delete from trips where id=$1", [trip]);
    expect((await db.query("select * from bookings")).rows).toHaveLength(0);
    expect((await db.query("select * from packing_items")).rows).toHaveLength(
      0,
    );
  } finally {
    await db.close();
  }
}, 30000);
