import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { reviewDatabase, owner, other } from "./fixtures/review-database";
it("member details use current verified accounts and exclude pending/removed people without exposing profiles", async () => {
  const f = await reviewDatabase(),
    { db, act } = f;
  try {
    const trip = await f.create();
    await f.finalize(trip);
    const draft = await f.create();
    const foreign = await f.create();
    await f.finalize(foreign);
    await db.exec(
      "reset role;alter table auth.users add raw_user_meta_data jsonb default '{}'::jsonb;",
    );
    await db.query(
      "update auth.users set email=case when id=$1 then 'anna@example.com' else 'original-invite@example.com' end,email_confirmed_at=now()",
      [owner],
    );
    await db.query("insert into profiles(id,display_name) values($1,'Anna')", [
      owner,
    ]);
    const stranger = crypto.randomUUID();
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at) values($1,'pending@example.com',now())",
      [stranger],
    );
    for (const file of [
      "014_itinerary_planning.sql",
      "015_bookings_and_budget.sql",
      "016_packing_and_documents.sql",
      "017_booking_payment_due.sql",
      "018_unified_booking_editor.sql",
      "019_trip_collaboration_v1a.sql",
    ])
      await db.exec(readFileSync("supabase/migrations/" + file, "utf8"));
    const before = (
      await db.query("select to_jsonb(t) x from trips t order by id")
    ).rows;
    await db.exec(
      readFileSync("supabase/migrations/020_trip_people.sql", "utf8"),
    );
    expect(
      (await db.query("select to_jsonb(t) x from trips t order by id")).rows,
    ).toEqual(before);
    await act();
    const people = async () =>
      (
        await db.query<{
          x: {
            user_id: string;
            membership_id: string | null;
            role: string;
            email: string | null;
            name: string | null;
          }[];
        }>("select trip_people($1) x", [trip])
      ).rows[0].x;
    expect(await people()).toMatchObject([
      {
        user_id: owner,
        role: "owner",
        name: "Anna",
        email: "anna@example.com",
      },
    ]);
    await expect(db.query("select trip_people($1)", [draft])).rejects.toThrow(
      /unavailable/,
    );
    await db.query(
      "select create_trip_invitation($1,'original-invite@example.com',$2)",
      [trip, "a".repeat(64)],
    );
    await db.query(
      "select create_trip_invitation($1,'pending@example.com',$2)",
      [trip, "b".repeat(64)],
    );
    expect(await people()).toHaveLength(1);
    await act(other);
    await db.query("select accept_trip_invitation($1)", ["a".repeat(64)]);
    await db.exec("reset role");
    await db.query(
      "update auth.users set email='current@example.com',raw_user_meta_data=$1::jsonb where id=$2",
      [
        JSON.stringify({
          name: "Mark",
          email: "fake@example.com",
          avatar_url: "https://lh3.googleusercontent.com/fixture",
        }),
        other,
      ],
    );
    // An expired accepted link does not expire a current membership.
    await db.query(
      "update trip_invitations set expires_at=now()-interval '1 second' where accepted_by=$1",
      [other],
    );
    await act(other);
    await expect(db.query("select trip_people($1)", [foreign])).rejects.toThrow(
      /unavailable/,
    );
    const list = await people();
    expect(list).toHaveLength(2);
    expect(list[1]).toMatchObject({
      user_id: other,
      email: "current@example.com",
      name: "Mark",
      role: "editor",
    });
    expect(JSON.stringify(list)).not.toContain("fake@example.com");
    expect(JSON.stringify(list)).not.toContain("original-invite@example.com");
    expect(
      (await db.query("select * from profiles where id=$1", [owner])).rows,
    ).toHaveLength(0);
    await act(stranger);
    await expect(people()).rejects.toThrow(/unavailable/);
    await db.query("select decline_trip_invitation($1)", ["b".repeat(64)]);
    await act();
    expect(await people()).toHaveLength(2);
    await db.query(
      "select create_trip_invitation($1,'pending@example.com',$2)",
      [trip, "c".repeat(64)],
    );
    await db.exec("reset role");
    await db.query(
      "update trip_invitations set expires_at=now()-interval '1 second' where token_hash=$1",
      ["c".repeat(64)],
    );
    await db.query(
      "update auth.users set email_confirmed_at=null where id=$1",
      [other],
    );
    await act();
    expect((await people()).find((p) => p.user_id === other)?.email).toBeNull();
    expect(await people()).toHaveLength(2);
    const member = list[1].membership_id;
    await db.query("select manage_trip_member($1,$2,0,true)", [trip, member]);
    expect(await people()).toHaveLength(1);
    await act(other);
    await expect(people()).rejects.toThrow(/unavailable/);
    await db.exec("reset role;set role anon;set request.jwt.claim.sub=''");
    await expect(people()).rejects.toThrow(/permission/);
  } finally {
    await db.close();
  }
}, 30000);
