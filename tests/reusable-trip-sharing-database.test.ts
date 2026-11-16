import { assertEditorPermissions } from "./fixtures/assert-editor-permissions";
import { it, expect } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import { reusableLinkFixture } from "./fixtures/reusable-link-database";
import { owner, other } from "./fixtures/review-database";
const digest = (s: string) => createHash("sha256").update(s).digest("hex");
it.each([false, true])(
  "reusable link works after 019 with optional 021=%s; atomic editor joins, reset, disable, privacy and legacy data remain intact",
  async (with021) => {
    const f = await reusableLinkFixture(true, with021),
      { db, act, trip, third, draft } = f;
    const first = randomBytes(32).toString("hex"),
      second = randomBytes(32).toString("hex"),
      last = randomBytes(32).toString("hex");
    const manage = async (
      op: string,
      revision: number,
      candidate: string | null = null,
    ) =>
      (
        await db.query<{
          x: { enabled: boolean; revision: number; secret: string | null };
        }>("select manage_trip_share_link($1,$2,$3,$4) x", [
          trip,
          op,
          revision,
          candidate,
        ])
      ).rows[0].x;
    const preview = async (secret: string) =>
      (
        await db.query<{ x: Record<string, unknown> }>(
          "select preview_trip_share_link($1) x",
          [digest(secret)],
        )
      ).rows[0].x;
    const join = (secret: string) =>
      db.query("select join_trip_share_link($1) id", [digest(secret)]);
    try {
      expect(await manage("read", 0)).toEqual({
        enabled: false,
        revision: 0,
        secret: null,
      });
      await expect(
        db.query("select manage_trip_share_link($1,'enable',0,$2)", [
          draft,
          first,
        ]),
      ).rejects.toThrow(/owner/);
      expect(await manage("enable", 0, first)).toEqual({
        enabled: true,
        revision: 1,
        secret: first,
      });
      expect(await manage("read", 0)).toEqual({
        enabled: true,
        revision: 1,
        secret: first,
      });
      expect(await manage("enable", 1, second)).toEqual({
        enabled: true,
        revision: 1,
        secret: first,
      });
      await expect(
        db.query("select secret from trip_share_links"),
      ).rejects.toThrow(/permission/);
      await expect(
        db.query("select create_trip_invitation($1,'new@example.com',$2)", [
          trip,
          digest(first),
        ]),
      ).rejects.toThrow(/permission/);
      await expect(
        db.query("select accept_trip_invitation($1)", ["a".repeat(64)]),
      ).rejects.toThrow(/permission/);
      const before = (
        await db.query(
          "select to_jsonb(m) x from trip_members m where user_id=$1",
          [other],
        )
      ).rows;
      await act(third);
      expect(await preview(first)).toMatchObject({
        state: "valid",
        trip_name: "Paris weekend",
      });
      expect(
        (await db.query("select id from trips where id=$1", [trip])).rows,
      ).toHaveLength(0);
      await expect(manage("reset", 1, second)).rejects.toThrow(/owner/);
      expect((await join(first)).rows[0]).toEqual({ id: trip });
      const joined = (
        await db.query<{ id: string; role: string; member_revision: number }>(
          "select id,role,member_revision from trip_members where trip_id=$1 and user_id=$2",
          [trip, third],
        )
      ).rows;
      expect(joined[0]).toMatchObject({ role: "editor", member_revision: 0 });
      await join(first);
      expect(
        (
          await db.query(
            "select id,role,member_revision from trip_members where trip_id=$1 and user_id=$2",
            [trip, third],
          )
        ).rows,
      ).toEqual(joined);
      expect(await preview(first)).toEqual({
        state: "already_member",
        trip_id: trip,
      });
      // A second brand-new account joins the same bearer link; no recipient
      // address or confirmation is involved in the database boundary.
      await db.exec("reset role");
      const fourth = crypto.randomUUID();
      await db.query("insert into auth.users(id) values($1)", [fourth]);
      await act(fourth);
      await join(first);
      expect(
        (
          await db.query(
            "select role from trip_members where trip_id=$1 and user_id=$2",
            [trip, fourth],
          )
        ).rows,
      ).toEqual([{ role: "editor" }]);
      // Same reusable link works for a second distinct account, no email match.
      await act(other);
      await join(first);
      expect(
        (
          await db.query(
            "select to_jsonb(m) x from trip_members m where user_id=$1",
            [other],
          )
        ).rows,
      ).toEqual(before);
      await act();
      expect(await manage("reset", 1, second)).toEqual({
        enabled: true,
        revision: 2,
        secret: second,
      });
      await expect(manage("disable", 1)).rejects.toThrow(/changed/);
      await act(third);
      expect(await preview(first)).toEqual({ state: "invalid" });
      await expect(join(first)).rejects.toThrow(/unavailable/);
      expect(
        (await db.query("select id from trips where id=$1", [trip])).rows,
      ).toHaveLength(1);
      // Owner-private original and Storage object are not visible to an editor.
      expect(
        (
          await db.query(
            "select id from booking_attachments where owner_id=$1",
            [owner],
          )
        ).rows,
      ).toHaveLength(0);
      expect(
        (await db.query("select name from storage.objects")).rows,
      ).toHaveLength(0);
      await act();
      await db.query("select manage_trip_member($1,$2,0,true)", [
        trip,
        joined[0].id,
      ]);
      await act(third);
      expect(
        (await db.query("select id from trips where id=$1", [trip])).rows,
      ).toHaveLength(0);
      // Explicitly accepted POC rule: removed members can rejoin an active link.
      await join(second);
      expect(
        (await db.query("select id from trips where id=$1", [trip])).rows,
      ).toHaveLength(1);
      await act();
      await manage("disable", 2);
      await act(third);
      expect(await preview(second)).toEqual({ state: "invalid" });
      await expect(join(second)).rejects.toThrow(/unavailable/);
      expect(
        (await db.query("select id from trips where id=$1", [trip])).rows,
      ).toHaveLength(1);
      await act();
      expect(await manage("enable", 3, last)).toEqual({
        enabled: true,
        revision: 4,
        secret: last,
      });
      await act(third);
      await expect(join(second)).rejects.toThrow(/unavailable/);
      await join(last);
      await db.exec("reset role;set role anon;set request.jwt.claim.sub=''");
      await expect(preview(last)).rejects.toThrow(/permission/);
      await expect(join(last)).rejects.toThrow(/permission/);
      await expect(manage("read", 0)).rejects.toThrow(/permission/);
      // No recipient rows are ever created by enabling/copying/joining/resetting.
      await db.exec("reset role");
      expect(
        (await db.query("select count(*)::integer n from trip_invitations"))
          .rows[0],
      ).toEqual({ n: 1 });
      const anonymous = crypto.randomUUID();
      await db.query(
        "insert into auth.users(id,is_anonymous) values($1,true)",
        [anonymous],
      );
      await act(anonymous);
      await expect(join(last)).rejects.toThrow(/Sign in/);
    } finally {
      await db.close();
    }
  },
  30000,
);

it("reusable-link editor edits owner’s actual records and retains revision, draft and private-file boundaries", async () => {
  const f = await reusableLinkFixture(false, true),
    secret = randomBytes(32).toString("hex");
  try {
    await f.db.query("select manage_trip_share_link($1,'enable',0,$2)", [
      f.trip,
      secret,
    ]);
    await f.act(other);
    await f.db.query("select join_trip_share_link($1)", [digest(secret)]);
    await assertEditorPermissions(f);
  } finally {
    await f.db.close();
  }
}, 30000);
