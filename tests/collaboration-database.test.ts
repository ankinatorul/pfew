import { randomUUID } from "node:crypto";
import { it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
it("enforces shared roles, email-bound invitations, private upload reservations and revocation", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create schema auth;create role authenticated;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated;grant execute on function auth.uid() to authenticated;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert,delete on storage.objects to authenticated;`,
    );
    for (const name of [
      "001_foundation",
      "002_guided_destinations",
      "003_travel_essentials",
      "004_private_booking_files",
      "../upgrade_phase2_to_phase4",
      "../upgrade_phase2_to_phase4",
    ])
      await db.exec(
        readFileSync("supabase/migrations/" + name + ".sql", "utf8"),
      );
    const [owner, editor, viewer, stranger, unverified] = [1, 2, 3, 4, 5].map(
      (n) => `${n}${"1".repeat(7)}-1111-4111-8111-111111111111`,
    );
    for (const [index, id] of [
      owner,
      editor,
      viewer,
      stranger,
      unverified,
    ].entries())
      await db.query("insert into auth.users values($1,$2,$3)", [
        id,
        "person" + index + "@example.com",
        index === 4 ? null : new Date().toISOString(),
      ]);
    const act = async (id: string) => {
      await db.exec(
        `reset role;set role authenticated;set request.jwt.claim.sub='${id}'`,
      );
    };
    await act(owner);
    const trip = (
      await db.query<{ id: string }>(
        `insert into trips(owner_id,name,start_date,end_date,timezone,style,currency) values($1,'Shared trip','2027-05-01','2027-05-05','UTC','Comfort','EUR') returning id`,
        [owner],
      )
    ).rows[0].id;
    const invite = async (email: string, role: string, token: string) =>
      db.query(
        `insert into trip_invitations(trip_id,email,role,token_hash,expires_at) values($1,$2,$3,$4,now()+interval '7 days')`,
        [trip, email, role, token.repeat(64)],
      );
    await invite("person1@example.com", "editor", "a");
    await invite("person2@example.com", "viewer", "b");
    await invite("person4@example.com", "editor", "c");
    await act(stranger);
    expect((await db.query("select * from trips")).rows).toHaveLength(0);
    expect(
      (
        await db.query("select preview_trip_invitation($1) result", [
          "a".repeat(64),
        ])
      ).rows[0],
    ).toEqual({ result: null });
    await expect(
      db.query("select accept_trip_invitation($1)", ["a".repeat(64)]),
    ).rejects.toThrow();
    await act(unverified);
    await expect(
      db.query("select accept_trip_invitation($1)", ["c".repeat(64)]),
    ).rejects.toThrow("Verified");
    for (const [id, token] of [
      [editor, "a"],
      [viewer, "b"],
    ]) {
      await act(id);
      await db.query("select accept_trip_invitation($1)", [token.repeat(64)]);
      await db.query("select accept_trip_invitation($1)", [token.repeat(64)]);
    }
    await act(editor);
    expect((await db.query("select * from trips")).rows).toHaveLength(1);
    const segment = (
      await db.query<{ id: string }>(
        `insert into trip_segments(trip_id,kind,title,start_date,end_date,timezone,status) values($1,'destination','Tokyo','2027-05-01','2027-05-05','Asia/Tokyo','planned') returning id`,
        [trip],
      )
    ).rows[0].id;
    expect(
      (await db.query<{ timezone: string }>("select timezone from trips"))
        .rows[0].timezone,
    ).toBe("Asia/Tokyo");
    expect(
      (await db.query("update trips set name=$1 returning id", ["Not allowed"]))
        .rows,
    ).toHaveLength(0);
    await db.query("select set_trip_budget($1,1000,'Budget')", [trip]);
    const booking = (
      await db.query<{ id: string }>(
        `insert into bookings(trip_id,title,category,start_date,end_date,timezone,currency) values($1,'My booking','flight','2027-05-01','2027-05-01','Asia/Tokyo','EUR') returning id`,
        [trip],
      )
    ).rows[0].id;
    const file = "66666666-1111-4111-8111-111111111111",
      path = [editor, trip, booking, file].join("/");
    await expect(
      db.query(
        `insert into storage.objects(bucket_id,name) values('booking-files',$1)`,
        [path],
      ),
    ).rejects.toThrow();
    await db.query(
      `insert into booking_attachments(id,trip_id,booking_id,owner_id,path,filename,content_type,size) values($1,$2,$3,$4,$5,'private.pdf','application/pdf',100)`,
      [file, trip, booking, editor, path],
    );
    await expect(
      db.query(`update booking_attachments set state='ready' where id=$1`, [
        file,
      ]),
    ).rejects.toThrow("not complete");
    await db.query(
      `insert into storage.objects(bucket_id,name) values('booking-files',$1)`,
      [path],
    );
    await db.query(`update booking_attachments set state='ready' where id=$1`, [
      file,
    ]);
    await expect(
      db.query("update booking_attachments set owner_id=$1 where id=$2", [
        owner,
        file,
      ]),
    ).rejects.toThrow();
    await expect(
      db.query("delete from booking_attachments where id=$1", [file]),
    ).rejects.toThrow("stored private");
    await expect(
      db.query("delete from bookings where id=$1", [booking]),
    ).rejects.toThrow("private documents");
    const reserve = async () => {
      const id = randomUUID();
      return db.query(
        `insert into booking_attachments(id,trip_id,booking_id,owner_id,path,filename,content_type,size) values($1,$2,$3,$4,$5,'pending.pdf','application/pdf',100)`,
        [id, trip, booking, editor, [editor, trip, booking, id].join("/")],
      );
    };
    for (let i = 0; i < 9; i++) await reserve();
    await expect(reserve()).rejects.toThrow("limit");
    await db.query("delete from booking_attachments where id<>$1", [file]);
    await act(viewer);
    expect((await db.query("select * from bookings")).rows).toHaveLength(1);
    expect(
      (await db.query("select * from booking_attachments")).rows,
    ).toHaveLength(0);
    expect((await db.query("select * from storage.objects")).rows).toHaveLength(
      0,
    );
    expect(
      (await db.query(`update trip_segments set title='changed' returning id`))
        .rows,
    ).toHaveLength(0);
    expect(
      (await db.query("delete from bookings returning id")).rows,
    ).toHaveLength(0);
    await expect(
      db.query("select set_trip_budget($1,1,'Luxury')", [trip]),
    ).rejects.toThrow();
    await expect(
      db.query("select reserve_service($1,'mock')", [trip]),
    ).rejects.toThrow();
    await expect(
      db.query(
        `insert into prep_tasks(trip_id,title,category) values($1,'Forbidden','Other')`,
        [trip],
      ),
    ).rejects.toThrow();
    await expect(
      db.query("update trip_members set role='editor'"),
    ).resolves.toBeDefined();
    expect(
      (
        await db.query("select role from trip_members where user_id=$1", [
          viewer,
        ])
      ).rows[0],
    ).toEqual({ role: "viewer" });
    await expect(
      db.query(
        `insert into audit_events(trip_id,entity_table,entity_id,action) values($1,'trips',$1,'DELETE')`,
        [trip],
      ),
    ).rejects.toThrow();
    await act(owner);
    expect(
      (await db.query("select * from booking_attachments")).rows,
    ).toHaveLength(0);
    expect((await db.query("select * from storage.objects")).rows).toHaveLength(
      0,
    );
    expect(
      (
        await db.query<{ result: boolean }>(
          "select has_other_private_files($1) result",
          [trip],
        )
      ).rows[0].result,
    ).toBe(true);
    await expect(
      db.query("delete from trips where id=$1", [trip]),
    ).rejects.toThrow("private documents");
    const audit = await db.query("select * from audit_events");
    expect(audit.rows.length).toBeGreaterThan(5);
    expect(JSON.stringify(audit.rows)).not.toContain("private.pdf");
    expect(JSON.stringify(audit.rows)).not.toContain("person1@example.com");
    await expect(
      db.query("update trips set owner_id=$1", [editor]),
    ).rejects.toThrow("ownership");
    await db.query("delete from trip_members where user_id=$1", [editor]);
    await act(editor);
    expect((await db.query("select * from trips")).rows).toHaveLength(0);
    expect(
      (await db.query("select * from booking_attachments")).rows,
    ).toHaveLength(1);
    expect((await db.query("select * from storage.objects")).rows).toHaveLength(
      1,
    );
    await db.query("delete from storage.objects where name=$1", [path]);
    await db.query("delete from booking_attachments where id=$1", [file]);
    await act(owner);
    expect(
      (
        await db.query<{ result: boolean }>(
          "select has_other_private_files($1) result",
          [trip],
        )
      ).rows[0].result,
    ).toBe(false);
    await db.query("delete from trips where id=$1", [trip]);
    expect(
      (await db.query("select * from trip_segments where id=$1", [segment]))
        .rows,
    ).toHaveLength(0);
  } finally {
    await db.close();
  }
}, 30000);
