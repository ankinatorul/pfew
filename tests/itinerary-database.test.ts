import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { reviewDatabase, other } from "./fixtures/review-database";
const sql = readFileSync(
  "supabase/migrations/014_itinerary_planning.sql",
  "utf8",
);
it("preserves baseline rows and enforces atomic activity CRUD, optimistic revisions, untimed order, booking links and RLS", async () => {
  const { db, act, create, finalize } = await reviewDatabase();
  try {
    const trip = await create();
    await finalize(trip);
    const before = (
      await db.query("select to_jsonb(t) value from trips t where id=$1", [
        trip,
      ])
    ).rows;
    await db.exec("reset role");
    await db.exec(sql);
    await act();
    expect(
      (
        await db.query("select to_jsonb(t) value from trips t where id=$1", [
          trip,
        ])
      ).rows,
    ).toEqual(before);
    const command = async (c: unknown) =>
      (
        await db.query<{ r: { id?: string; message?: string } }>(
          "select change_itinerary($1,$2::jsonb) r",
          [trip, JSON.stringify(c)],
        )
      ).rows[0].r;
    const one = {
      id: crypto.randomUUID(),
      revision: 0,
      title: "First saved plan",
      day: "2027-06-01",
      start: "",
      end: "",
      notes: "Keep me",
      location: "",
      category: "Sightseeing",
      destination: "",
    };
    expect((await command({ op: "save", input: one })).id).toBe(one.id);
    await command({ op: "save", input: one });
    expect(
      (
        await db.query(
          "select count(*)::int n from trip_segments where trip_id=$1",
          [trip],
        )
      ).rows[0],
    ).toEqual({ n: 1 });
    await expect(
      command({ op: "save", input: { ...one, day: "2027-07-01" } }),
    ).rejects.toThrow(/within/);
    await expect(
      command({ op: "save", input: { ...one, start: "12:00", end: "11:00" } }),
    ).rejects.toThrow(/after/);
    await command({ op: "save", input: { ...one, title: "Changed" } });
    await expect(
      command({ op: "save", input: { ...one, title: "Stale" } }),
    ).rejects.toThrow(/changed/);
    const two = { ...one, id: crypto.randomUUID(), title: "Second saved plan" };
    await command({ op: "save", input: two });
    await command({
      op: "reorder",
      day: one.day,
      order: [
        { id: two.id, revision: 0 },
        { id: one.id, revision: 1 },
      ],
    });
    expect(
      (
        await db.query<{ id: string }>(
          "select id from trip_segments where trip_id=$1 order by position",
          [trip],
        )
      ).rows.map((r) => r.id),
    ).toEqual([two.id, one.id]);
    await expect(
      command({
        op: "reorder",
        day: one.day,
        order: [{ id: one.id, revision: 1 }],
      }),
    ).rejects.toThrow(/changed/);
    const rev = async (id: string) =>
      (
        await db.query<{ r: number }>(
          "select itinerary_revision r from trip_segments where id=$1",
          [id],
        )
      ).rows[0].r;
    await command({
      op: "save",
      input: {
        ...one,
        revision: await rev(one.id),
        day: "2027-06-02",
        start: "10:00",
        end: "11:00",
      },
    });
    expect(
      (
        await db.query(
          "select start_date::text,local_time,duration_minutes from trip_segments where id=$1",
          [one.id],
        )
      ).rows[0],
    ).toEqual({
      start_date: "2027-06-02",
      local_time: "10:00",
      duration_minutes: 60,
    });
    const booking = crypto.randomUUID();
    await db.query(
      "insert into bookings(id,trip_id,segment_id,title,category,start_date,end_date,timezone,currency) values($1,$2,$3,'Preserved booking','activity','2027-06-02','2027-06-02','Europe/Paris','EUR')",
      [booking, trip, one.id],
    );
    await command({ op: "unlink", id: booking, segment: one.id });
    expect(
      (await db.query("select segment_id from bookings where id=$1", [booking]))
        .rows,
    ).toEqual([{ segment_id: null }]);
    await db.query("update bookings set segment_id=$1 where id=$2", [
      one.id,
      booking,
    ]);
    await act(other);
    await expect(
      command({ op: "delete", id: one.id, revision: 0 }),
    ).rejects.toThrow();
    expect(
      (await db.query("select id from trip_segments where trip_id=$1", [trip]))
        .rows,
    ).toEqual([]);
    await act();
    await command({ op: "delete", id: one.id, revision: await rev(one.id) });
    expect(
      (
        await db.query("select id,segment_id from bookings where id=$1", [
          booking,
        ])
      ).rows,
    ).toEqual([{ id: booking, segment_id: null }]);
    await db.exec("reset role");
    await db.exec(sql); // completed rerun is additive
    expect(
      (
        await db.query(
          "select has_function_privilege('anon','public.change_itinerary(uuid,jsonb)','EXECUTE') allowed",
        )
      ).rows[0],
    ).toEqual({ allowed: false });
  } finally {
    await db.close();
  }
}, 30000);
it("saves suggestions once to an explicit day, preserves them after validation failure, and persists dismissal and source", async () => {
  const { db, act, create, finalize } = await reviewDatabase();
  try {
    const trip = await create();
    await finalize(trip);
    await db.exec("reset role");
    await db.exec(sql);
    await act();
    const idea = crypto.randomUUID();
    await db.query(
      "insert into ai_suggestions(id,trip_id,title,note,category,source,context) values($1,$2,'An idea','Check details yourself','activity','ai','{\"day\":\"2027-06-01\"}')",
      [idea, trip],
    );
    const command = async (c: unknown) =>
      (
        await db.query<{ r: { id: string } }>(
          "select change_itinerary($1,$2::jsonb) r",
          [trip, JSON.stringify(c)],
        )
      ).rows[0].r;
    await expect(
      command({ op: "add-idea", id: idea, day: "2027-07-01", destination: "" }),
    ).rejects.toThrow(/within/);
    expect(
      (
        await db.query(
          "select accepted_segment_id from ai_suggestions where id=$1",
          [idea],
        )
      ).rows[0],
    ).toEqual({ accepted_segment_id: null });
    const [a, b] = await Promise.all([
      command({ op: "add-idea", id: idea, day: "2027-06-03", destination: "" }),
      command({ op: "add-idea", id: idea, day: "2027-06-04", destination: "" }),
    ]);
    expect(a.id).toBe(b.id);
    expect(
      (
        await db.query(
          "select start_date::text,status,local_time from trip_segments where id=$1",
          [a.id],
        )
      ).rows[0],
    ).toEqual({ start_date: "2027-06-03", status: "planned", local_time: "" });
    const dismiss = crypto.randomUUID();
    await db.query(
      "insert into ai_suggestions(id,trip_id,title,note,category,source) values($1,$2,'Another idea','','other','mock')",
      [dismiss, trip],
    );
    await command({
      op: "dismiss-idea",
      id: dismiss,
      day: "2027-06-03",
      destination: "",
    });
    await expect(
      command({
        op: "add-idea",
        id: dismiss,
        day: "2027-06-03",
        destination: "",
      }),
    ).rejects.toThrow(/dismissed/);
    expect(
      (
        await db.query(
          "select source,context->>'day' as saved_day from ai_suggestions where id=$1",
          [idea],
        )
      ).rows[0],
    ).toEqual({ source: "ai", saved_day: "2027-06-01" });
  } finally {
    await db.close();
  }
}, 30000);
it("uses existing quota reservations idempotently and atomically persists suggestions without duplicate titles", async () => {
  const { db, act, create, finalize } = await reviewDatabase();
  try {
    const trip = await create();
    await finalize(trip);
    await db.exec("reset role");
    await db.exec(sql);
    await act();
    const request = crypto.randomUUID();
    const reserve = async () =>
      (
        await db.query<{
          r: { id: string; created: boolean; outcome: string };
        }>("select reserve_itinerary_ideas($1,$2) r", [trip, request])
      ).rows[0].r;
    const first = await reserve(),
      retry = await reserve();
    expect(first.created).toBe(true);
    expect(retry).toEqual({ ...first, created: false });
    const persist = async (ideas: unknown) =>
      db.query(
        'select persist_itinerary_ideas($1,$2,$3,\'{"day":"2027-06-01"}\',$4::jsonb)',
        [trip, first.id, request, JSON.stringify(ideas)],
      );
    await expect(
      persist([{ title: "Broken", note: "x", category: "invalid" }]),
    ).rejects.toThrow(/Unsupported/);
    expect((await reserve()).outcome).toBe("reserved");
    await persist([
      {
        title: "Quiet morning",
        note: "Consider a walk; details unverified.",
        category: "relaxation",
      },
      { title: "Quiet morning", note: "Duplicate", category: "relaxation" },
    ]);
    await persist([]);
    expect((await reserve()).outcome).toBe("succeeded");
    expect(
      (
        await db.query(
          "select count(*)::int n from ai_suggestions where trip_id=$1",
          [trip],
        )
      ).rows[0],
    ).toEqual({ n: 1 });
    await act(other);
    await expect(reserve()).rejects.toThrow(/permission/);
  } finally {
    await db.close();
  }
}, 30000);
it("keeps draft planning private, permits shared editors, rejects viewers and persists explicit completion", async () => {
  const { db, act, create, finalize, basics } = await reviewDatabase();
  try {
    const trip = await create(),
      draft = await create();
    await finalize(trip);
    await db.exec("reset role");
    await db.exec(sql);
    await act();
    const item = {
      id: crypto.randomUUID(),
      revision: 0,
      title: "Shared saved plan",
      day: "2027-06-01",
      start: "",
      end: "",
      notes: "",
      location: "",
      category: "Other",
      destination: basics.destinations[0].id,
    };
    const call = async (target: string, c: unknown) =>
      db.query("select change_itinerary($1,$2::jsonb)", [
        target,
        JSON.stringify(c),
      ]);
    await expect(call(draft, { op: "save", input: item })).rejects.toThrow(
      /Finalized/,
    );
    await db.query(
      "insert into trip_members(trip_id,user_id,role) values($1,$2,'viewer')",
      [trip, other],
    );
    await act(other);
    await expect(call(trip, { op: "save", input: item })).rejects.toThrow(
      /permission/,
    );
    await act();
    await db.query(
      "update trip_members set role='editor' where trip_id=$1 and user_id=$2",
      [trip, other],
    );
    await act(other);
    await call(trip, { op: "save", input: item });
    await expect(
      call(trip, { op: "complete", id: item.id, revision: 0 }),
    ).rejects.toThrow(/scheduled day/);
    // The fixture is dated in the future. Move only the synthetic trip and item
    // to a past date as the administrator, never a connected project.
    await db.exec("reset role");
    await db.query(
      "update trips set start_date='2020-01-01',end_date='2027-06-06' where id=$1",
      [trip],
    );
    await db.query(
      "update trip_segments set start_date='2020-01-01',end_date='2020-01-01' where id=$1",
      [item.id],
    );
    await act(other);
    await call(trip, { op: "complete", id: item.id, revision: 1 });
    expect(
      (
        await db.query<{ done: boolean }>(
          "select completed_at is not null done from trip_segments where id=$1",
          [item.id],
        )
      ).rows[0].done,
    ).toBe(true);
    await expect(
      call(trip, { op: "delete", id: item.id, revision: 1 }),
    ).rejects.toThrow(/changed/);
    await act();
    expect(
      (
        await db.query(
          "select destination_location_id from trip_segments where id=$1",
          [item.id],
        )
      ).rows[0],
    ).toEqual({ destination_location_id: basics.destinations[0].id });
    await expect(
      call(trip, {
        op: "save",
        input: {
          ...item,
          id: crypto.randomUUID(),
          destination: "another-trip-location",
        },
      }),
    ).rejects.toThrow(/destination/);
  } finally {
    await db.close();
  }
}, 30000);
it("runs the read-only handoff report before and after 014 without changing original records", async () => {
  const { db, act, create, finalize } = await reviewDatabase();
  try {
    const trip = await create();
    await finalize(trip);
    await db.query(
      "insert into trip_segments(trip_id,kind,title,start_date,end_date,timezone) values($1,'activity','Existing saved plan','2027-06-01','2027-06-01','Europe/Paris')",
      [trip],
    );
    await db.exec("reset role");
    const inspection = readFileSync(
      "supabase/VERIFY_PHASE8_READ_ONLY.sql",
      "utf8",
    );
    const report = async () => {
      const results = await db.exec(inspection);
      return JSON.parse(
        (
          results.find((r) => r.rows.some((row) => "phase8_report" in row))!
            .rows[0] as { phase8_report: string }
        ).phase8_report,
      ) as {
        read_only: string;
        columns: { present: boolean }[];
        baselines: unknown[];
        broken_booking_links: { count: number };
      };
    };
    const before = await report();
    expect(before.read_only).toBe("on");
    expect(before.columns.every((c) => !c.present)).toBe(true);
    await db.exec(sql);
    const after = await report();
    expect(after.columns.every((c) => c.present)).toBe(true);
    expect(after.baselines).toEqual(before.baselines);
    expect(after.broken_booking_links.count).toBe(0);
    await act();
  } finally {
    await db.close();
  }
}, 30000);
