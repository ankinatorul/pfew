import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { reusableLinkFixture } from "./fixtures/reusable-link-database";
import { owner, other } from "./fixtures/review-database";
import { geographicLocation } from "../lib/geographic-location";
it("owner and editor atomically reorder existing saved/dated destinations while foreign users, drafts, stale revisions and metadata changes are denied", async () => {
  const f = await reusableLinkFixture(true, false),
    { db, act, trip, draft, third } = f;
  try {
    await db.exec("reset role");
    const baseline = await db.query(
      "select to_jsonb(t) x from trips t order by id",
    );
    await db.exec(
      readFileSync("supabase/migrations/023_destination_order.sql", "utf8"),
    );
    expect(
      (await db.query("select to_jsonb(t) x from trips t order by id")).rows,
    ).toEqual(baseline.rows);
    await act();
    const d = [
      geographicLocation("Paris", "France", 48, 2, "FR"),
      geographicLocation("Bali", "Indonesia", -8, 115, "ID"),
    ];
    await db.query(
      "update trips set draft_data=jsonb_set(draft_data,'{destinations}',$2::jsonb) where id=$1",
      [trip, JSON.stringify(d)],
    );
    const revision = async () =>
      (
        await db.query<{ r: number }>(
          "select trip_revision r from trips where id=$1",
          [trip],
        )
      ).rows[0].r;
    const reorder = (rev: number, ids: string[], versions: unknown[] = []) =>
      db.query("select reorder_trip_destinations($1,$2,$3::jsonb,$4::jsonb)", [
        trip,
        rev,
        JSON.stringify(ids),
        JSON.stringify(versions),
      ]);
    const r = await revision();
    await act(other);
    await reorder(r, ["1", "0"]);
    expect(
      (
        await db.query<{ d: unknown[] }>(
          "select draft_data->'destinations' d from trips where id=$1",
          [trip],
        )
      ).rows[0].d,
    ).toEqual([d[1], d[0]]);
    await expect(reorder(r, ["0", "1"])).rejects.toThrow(/changed/);
    await expect(
      db.query(
        "update trips set draft_data=draft_data||'{\"injected\":true}' where id=$1",
        [trip],
      ),
    ).rejects.toThrow(/Only the owner/);
    await expect(
      db.query(
        "update trips set draft_data=jsonb_set(draft_data,'{destinations}','[]') where id=$1",
        [trip],
      ),
    ).rejects.toThrow(/Only the owner/);
    await expect(
      db.query("update trips set owner_id=$1 where id=$2", [other, trip]),
    ).rejects.toThrow();
    const a = crypto.randomUUID(),
      b = crypto.randomUUID();
    await db.query(
      "insert into trip_segments(id,trip_id,kind,title,start_date,end_date,timezone,position) values($1,$3,'destination','A','2027-06-01','2027-06-02','Europe/Paris',0),($2,$3,'destination','B','2027-06-03','2027-06-04','Europe/Paris',1)",
      [a, b, trip],
    );
    const current = await revision(),
      versions = [
        { id: a, revision: 0 },
        { id: b, revision: 0 },
      ];
    await reorder(current, [b, a], versions);
    expect(
      (
        await db.query<{ id: string }>(
          "select id from trip_segments where kind='destination' and trip_id=$1 order by position",
          [trip],
        )
      ).rows.map((x) => x.id),
    ).toEqual([b, a]);
    await expect(reorder(current, [a, b], versions)).rejects.toThrow(/changed/);
    await act(third);
    await expect(reorder(current, [a, b], versions)).rejects.toThrow(
      /permission/,
    );
    expect(
      (await db.query("select id from trips where id=$1", [trip])).rows,
    ).toHaveLength(0);
    await act();
    await expect(
      db.query("select reorder_trip_destinations($1,0,'[\"0\"]','[]')", [
        draft,
      ]),
    ).rejects.toThrow(/permission/);
    await db.exec("reset role;set role anon;set request.jwt.claim.sub=''");
    await expect(reorder(current, [a, b], versions)).rejects.toThrow(
      /permission/,
    );
    await act();
    expect(
      (await db.query("select owner_id from trips where id=$1", [trip])).rows,
    ).toEqual([{ owner_id: owner }]);
  } finally {
    await db.close();
  }
}, 30000);
