import { it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { geographicLocation } from "../lib/geographic-location";

it("migrates legacy trips, saves independent private drafts with mandatory dates and enforces RLS, retries and revisions", async () => {
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
      "migrations/009_research_and_booking_imports.sql",
    ])
      await db.exec(readFileSync("supabase/" + file, "utf8"));
    const [owner, editor, stranger] = [1, 2, 3].map(
      (n) => `${n}1111111-1111-4111-8111-111111111111`,
    );
    for (const id of [owner, editor, stranger])
      await db.query("insert into auth.users values($1,$2,now())", [
        id,
        `${id}@example.com`,
      ]);
    const act = (id: string) =>
      db.exec(
        `reset role;set role authenticated;set request.jwt.claim.sub='${id}'`,
      );
    await act(owner);
    const legacy = (
      await db.query<{ id: string }>(
        `insert into trips(owner_id,name,start_date,end_date,timezone,style,currency) values($1,'Existing trip','2027-05-01','2027-05-10','UTC','Comfort','EUR') returning id`,
        [owner],
      )
    ).rows[0].id;
    await db.query(
      "insert into trip_members(trip_id,user_id,role) values($1,$2,'editor')",
      [legacy, editor],
    );
    await db.query(
      "insert into bookings(trip_id,title,category,start_date,end_date,timezone,currency) values($1,'Preserved booking','flight','2027-05-01','2027-05-01','UTC','EUR')",
      [legacy],
    );
    const beforeTrip = (
      await db.query("select to_jsonb(t) original from trips t where id=$1", [
        legacy,
      ])
    ).rows;
    const beforeBookings = (
      await db.query(
        "select to_jsonb(b) original from bookings b where trip_id=$1 order by id",
        [legacy],
      )
    ).rows;
    await db.exec("reset role");
    const sql = readFileSync(
      "supabase/migrations/010_private_trip_drafts.sql",
      "utf8",
    );
    await db.exec(sql);
    await db.exec(sql); // intentionally rerunnable
    await act(owner);
    expect(
      (
        await db.query(
          "select to_jsonb(t)-array['creation_state','draft_data','draft_step','draft_revision'] original from trips t where id=$1",
          [legacy],
        )
      ).rows,
    ).toEqual(beforeTrip);
    expect(
      (
        await db.query(
          "select to_jsonb(b) original from bookings b where trip_id=$1 order by id",
          [legacy],
        )
      ).rows,
    ).toEqual(beforeBookings);
    expect(
      (
        await db.query("select creation_state,name from trips where id=$1", [
          legacy,
        ])
      ).rows,
    ).toEqual([{ creation_state: "finalized", name: "Existing trip" }]);
    const a = crypto.randomUUID(),
      b = crypto.randomUUID();
    const locations = [
      geographicLocation("Kyoto", "Japan", 35.01, 135.77, "JP", "osm:R:357238"),
      geographicLocation("Victoria", "Canada", 48.43, -123.36, "CA"),
    ];
    const basics = {
      name: "First draft",
      start_date: "2027-06-01",
      end_date: "2027-06-10",
      destinations: locations,
    };
    const save = async (id: string, revision: number, input: unknown) =>
      (
        await db.query<{
          draft: {
            id: string;
            draft_revision: number;
            start_date: null | string;
            end_date: null | string;
            draft_data: { destinations: typeof locations };
            draft_step: number;
          };
        }>("select save_trip_draft($1,$2,$3::jsonb) draft", [
          id,
          revision,
          JSON.stringify(input),
        ])
      ).rows[0].draft;
    expect(
      (
        await db.query(
          "select attnotnull from pg_attribute where attrelid='public.trips'::regclass and attname in ('start_date','end_date') order by attname",
        )
      ).rows,
    ).toEqual([{ attnotnull: true }, { attnotnull: true }]);
    for (const fields of [
      { start_date: null },
      { end_date: null },
      { start_date: "" },
      { end_date: "" },
      { start_date: "2027-02-30" },
    ]) {
      await expect(
        save(crypto.randomUUID(), 0, { ...basics, ...fields }),
      ).rejects.toThrow();
    }
    const first = await save(a, 0, basics);
    expect(first).toMatchObject({
      id: a,
      start_date: "2027-06-01",
      end_date: "2027-06-10",
      draft_revision: 1,
      draft_step: 2,
      draft_data: { destinations: locations },
    });
    expect(await save(a, 0, basics)).toEqual(first);
    await save(b, 0, {
      ...basics,
      name: "Second draft",
      start_date: "2027-06-01",
    });
    expect(
      (await db.query("select id from trips where creation_state='draft'"))
        .rows,
    ).toHaveLength(2);
    expect(
      (await db.query("select id from trips where creation_state='finalized'"))
        .rows,
    ).toEqual([{ id: legacy }]);
    await expect(
      save(a, 1, {
        ...basics,
        start_date: "2027-06-05",
        end_date: "2027-06-01",
      }),
    ).rejects.toThrow();
    await expect(save(a, 1, { ...basics, destinations: [] })).rejects.toThrow();
    const edited = await save(a, 1, {
      ...basics,
      name: "Edited draft",
      end_date: "2027-06-09",
      destinations: [...locations].reverse(),
    });
    expect(edited).toMatchObject({
      id: a,
      start_date: "2027-06-01",
      end_date: "2027-06-09",
      draft_revision: 2,
    });
    expect(edited.draft_data.destinations[0]).toEqual(locations[1]);
    await expect(save(a, 1, { ...basics, name: "Stale edit" })).rejects.toThrow(
      /changed in another tab/,
    );
    await expect(save(legacy, 0, basics)).rejects.toThrow(/unavailable/);
    await expect(
      db.query("update trips set creation_state='finalized' where id=$1", [a]),
    ).rejects.toThrow(/publication state/);
    await expect(
      db.query(
        "insert into trip_members(trip_id,user_id,role) values($1,$2,'editor')",
        [a, editor],
      ),
    ).rejects.toThrow(/cannot be shared/);
    const booking = (
      await db.query<{ id: string }>(
        `insert into bookings(trip_id,title,category,start_date,end_date,timezone,currency) values($1,'Private booking','flight','2027-06-01','2027-06-01','UTC','EUR') returning id`,
        [a],
      )
    ).rows[0].id;
    // Even an accidental privileged membership cannot expose a draft or children.
    await db.exec(
      "reset role;alter table trip_members disable trigger no_draft_members",
    );
    await db.query(
      "insert into trip_members(trip_id,user_id,role) values($1,$2,'editor')",
      [a, editor],
    );
    await db.exec("alter table trip_members enable trigger no_draft_members");
    for (const id of [editor, stranger]) {
      await act(id);
      expect(
        (await db.query("select id from trips where id=$1", [a])).rows,
      ).toEqual([]);
      expect(
        (await db.query("select id from bookings where id=$1", [booking])).rows,
      ).toEqual([]);
      expect(
        (
          await db.query(
            "select can_read_trip($1) allowed,can_edit_trip($1) editable",
            [a],
          )
        ).rows,
      ).toEqual([{ allowed: false, editable: false }]);
      await expect(
        save(a, 2, { ...basics, name: "Unauthorized" }),
      ).rejects.toThrow();
      await expect(
        db.query(
          `insert into prep_tasks(trip_id,title,category,priority) values($1,'Unauthorized','Other','normal')`,
          [a],
        ),
      ).rejects.toThrow();
    }
    await act(editor);
    expect(
      (await db.query("select id from trips where id=$1", [legacy])).rows,
    ).toEqual([{ id: legacy }]);
    expect(
      (await db.query("select can_edit_trip($1) allowed", [legacy])).rows,
    ).toEqual([{ allowed: true }]);
    await act(owner);
    expect(
      (await db.query("select name from trips where id=$1", [a])).rows,
    ).toEqual([{ name: "Edited draft" }]);
    // Legacy atomic creation still works unchanged after migration.
    const oldInput = {
      name: "Legacy creation",
      start_date: "2027-07-01",
      end_date: "2027-07-02",
      timezone: "UTC",
      travelers: 1,
      style: "Comfort",
      currency: "EUR",
      budget: null,
    };
    await db.query(
      "select create_trip_with_destinations($1::jsonb,'[]'::jsonb)",
      [JSON.stringify(oldInput)],
    );
    expect(
      (
        await db.query(
          "select creation_state from trips where name='Legacy creation'",
        )
      ).rows,
    ).toEqual([{ creation_state: "finalized" }]);
    // Simulate an ALREADY-nullable legacy schema only inside this fixture.
    // Reapplying revised 010 must neither repair nor overwrite those old rows.
    await db.exec(
      "reset role;alter table trips alter column start_date drop not null;alter table trips alter column end_date drop not null",
    );
    await db.exec(sql);
    expect(
      (
        await db.query(
          "select attnotnull from pg_attribute where attrelid='public.trips'::regclass and attname in ('start_date','end_date') order by attname",
        )
      ).rows,
    ).toEqual([{ attnotnull: false }, { attnotnull: false }]);
    await act(owner);
    for (const dates of [
      [null, null],
      ["2027-08-01", null],
      [null, "2027-08-10"],
      ["2027-08-01", "2027-08-10"],
    ]) {
      const target = (
        await db.query<{ id: string }>(
          "insert into trips(owner_id,name,start_date,end_date,timezone,style,currency) values($1,'Legacy date fixture',$2,$3,'UTC','Comfort','EUR') returning id",
          [owner, ...dates],
        )
      ).rows[0].id;
      const idea = (
        await db.query<{ id: string }>(
          "insert into ai_suggestions(trip_id,title,note,category,source) values($1,'Saved possibility','Fixture only','activity','mock') returning id",
          [target],
        )
      ).rows[0].id;
      if (!dates[0] || !dates[1]) {
        await expect(
          db.query("select accept_ai_idea($1)", [idea]),
        ).rejects.toThrow(/IDEA_DATE_REQUIRED/);
        expect(
          (
            await db.query(
              "select accepted_segment_id from ai_suggestions where id=$1",
              [idea],
            )
          ).rows,
        ).toEqual([{ accepted_segment_id: null }]);
        expect(
          (
            await db.query("select id from trip_segments where trip_id=$1", [
              target,
            ])
          ).rows,
        ).toEqual([]);
        expect(
          (
            await db.query(
              "select start_date::text,end_date::text from trips where id=$1",
              [target],
            )
          ).rows,
        ).toEqual([{ start_date: dates[0], end_date: dates[1] }]);
        await db.query(
          "update trips set start_date='2027-08-01',end_date='2027-08-10' where id=$1",
          [target],
        );
      }
      const accepted = await db.query("select accept_ai_idea($1) id", [idea]);
      expect(
        (await db.query("select accept_ai_idea($1) id", [idea])).rows,
      ).toEqual(accepted.rows);
      expect(
        (
          await db.query(
            "select status,start_date::text,end_date::text from trip_segments where trip_id=$1",
            [target],
          )
        ).rows,
      ).toEqual([
        { status: "idea", start_date: "2027-08-01", end_date: "2027-08-01" },
      ]);
      await act(stranger);
      await expect(
        db.query("select accept_ai_idea($1)", [idea]),
      ).rejects.toThrow(/unavailable/);
      await act(owner);
    }
    await expect(
      save(crypto.randomUUID(), 0, { ...basics, start_date: null }),
    ).rejects.toThrow(/dates/);
  } finally {
    await db.close();
  }
}, 30000);
