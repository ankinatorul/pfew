import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { reusableLinkFixture } from "./fixtures/reusable-link-database";
import { other } from "./fixtures/review-database";
import { geographicLocation } from "../lib/geographic-location";
import { tripMapData } from "../lib/trip-map";
import type { Trip, Segment } from "../lib/domain";
it("saved and dated destination changes preserve coordinates, undated data and bookings, allow Editors and reject stale/unauthorized changes", async () => {
  const f = await reusableLinkFixture(true, false),
    { db, act, trip, third, draft } = f;
  try {
    await db.exec("reset role");
    const before = (
      await db.query("select to_jsonb(t) x from trips t order by id")
    ).rows;
    for (const name of [
      "023_destination_order.sql",
      "024_destination_management.sql",
    ])
      await db.exec(readFileSync("supabase/migrations/" + name, "utf8"));
    expect(
      (await db.query("select to_jsonb(t) x from trips t order by id")).rows,
    ).toEqual(before);
    await act(other);
    const current = async () =>
      (await db.query<Trip>("select * from trips where id=$1", [trip])).rows[0];
    const change = async (
      source: string,
      key: string,
      op: string,
      details: unknown = {},
      revision = 0,
      version?: number,
    ) =>
      db.query("select change_trip_destination($1,$2,$3,$4,$5,$6,$7::jsonb)", [
        trip,
        version ?? (await current()).trip_revision,
        source,
        key,
        revision,
        op,
        JSON.stringify(details),
      ]);
    const old = (await current()).draft_data!.destinations as Record<
      string,
      unknown
    >[];
    const details = {
      title: "Our Paris stop",
      location_id: old[0].id,
      start_date: "",
      end_date: "",
      notes: "Saved note",
      location: null,
    };
    const rev = (await current()).trip_revision!;
    await change("saved", "0", "save", details);
    const changed = (await current()).draft_data!.destinations as Record<
      string,
      unknown
    >[];
    expect(changed[0]).toMatchObject({
      id: old[0].id,
      latitude: old[0].latitude,
      longitude: old[0].longitude,
      title: "Our Paris stop",
      start_date: null,
      end_date: null,
    });
    expect(
      (
        await db.query(
          "select id from trip_segments where kind='destination' and trip_id=$1",
          [trip],
        )
      ).rows,
    ).toHaveLength(0);
    await expect(change("saved", "0", "save", details, 0, rev)).rejects.toThrow(
      /changed/,
    );
    await expect(
      db.query(
        "update trips set draft_data=draft_data||'{\"injected\":true}' where id=$1",
        [trip],
      ),
    ).rejects.toThrow(/Only the owner/);
    const loc = geographicLocation(
      "Lyon",
      "France",
      45.76,
      4.83,
      "FR",
      "osm:N:123",
    );
    await change("saved", "new", "save", {
      ...details,
      title: "Lyon",
      location_id: loc.id,
      location: loc,
      start_date: "2027-06-02",
    });
    expect(
      (await current()).draft_data!.destinations as unknown[],
    ).toHaveLength(2);
    const activity = crypto.randomUUID();
    await db.query(
      "insert into trip_segments(id,trip_id,kind,title,start_date,end_date,timezone,destination_location_id) values($1,$2,'activity','Linked walk','2027-06-02','2027-06-02','Europe/Paris',$3)",
      [activity, trip, loc.id],
    );
    await expect(change("saved", "1", "remove")).rejects.toThrow(
      /linked plans/,
    );
    await db.query(
      "update trip_segments set destination_location_id=null where id=$1",
      [activity],
    );
    const newPlace = geographicLocation("Nice", "France", 43.7, 7.26, "FR");
    await change("saved", "1", "save", {
      ...details,
      title: "Nice",
      location_id: newPlace.id,
      location: newPlace,
    });
    const newItems = (await current()).draft_data!.destinations as Record<
      string,
      unknown
    >[];
    expect(newItems[1]).toMatchObject({
      id: newPlace.id,
      latitude: 43.7,
      longitude: 7.26,
    });
    expect(newItems[1]).not.toHaveProperty("providerId");
    await change("saved", "1", "remove");
    const dated = crypto.randomUUID();
    await db.query(
      "insert into trip_segments(id,trip_id,kind,title,start_date,end_date,timezone,location_id,latitude,longitude) values($1,$2,'destination','Paris','2027-06-01','2027-06-03','Europe/Paris',$3,48.85,2.35)",
      [dated, trip, old[0].id],
    );
    await db.query("update bookings set segment_id=$1 where trip_id=$2", [
      dated,
      trip,
    ]);
    await change("segment", dated, "save", {
      ...details,
      title: "Edited dated stop",
      start_date: "2027-06-01",
      end_date: "2027-06-04",
    });
    expect(
      (
        await db.query<{ title: string }>(
          "select title from trip_segments where id=$1",
          [dated],
        )
      ).rows[0].title,
    ).toBe("Edited dated stop");
    await expect(
      change(
        "segment",
        dated,
        "save",
        { ...details, start_date: "", end_date: "" },
        1,
      ),
    ).rejects.toThrow(/dates/);
    await change("segment", dated, "remove", {}, 1);
    expect(
      (
        await db.query("select segment_id from bookings where trip_id=$1", [
          trip,
        ])
      ).rows[0],
    ).toEqual({ segment_id: null });
    expect(
      (await current()).draft_data!.destinations as unknown[],
    ).toHaveLength(0);
    expect(
      (
        await db.query(
          "select count(*)::int n from bookings where trip_id=$1",
          [trip],
        )
      ).rows[0],
    ).toEqual({ n: 1 });
    await act(third);
    await expect(change("saved", "0", "remove", {}, 0, 0)).rejects.toThrow(
      /permission/,
    );
    await act();
    await expect(
      db.query(
        "select change_trip_destination($1,0,'saved','0',0,'remove','{}')",
        [draft],
      ),
    ).rejects.toThrow(/Finalized/);
  } finally {
    await db.close();
  }
}, 30000);
it("mixed reordering updates canonical positions and the map without losing either source", async () => {
  const f = await reusableLinkFixture(true, false),
    { db, act, trip } = f;
  try {
    await db.exec("reset role");
    for (const name of [
      "023_destination_order.sql",
      "024_destination_management.sql",
    ])
      await db.exec(readFileSync("supabase/migrations/" + name, "utf8"));
    await act();
    const dated = crypto.randomUUID();
    await db.query(
      "insert into trip_segments(id,trip_id,kind,title,start_date,end_date,timezone,latitude,longitude) values($1,$2,'destination','Dated stop','2027-06-01','2027-06-03','Europe/Paris',1,2)",
      [dated, trip],
    );
    await act(other);
    const t = (await db.query<Trip>("select * from trips where id=$1", [trip]))
      .rows[0];
    const payload = {
      ids: ["saved:0", dated],
      segments: [{ id: dated, revision: 0 }],
    };
    await db.query(
      "select change_trip_destination($1,$2,'saved','order',0,'reorder',$3::jsonb)",
      [trip, t.trip_revision, JSON.stringify(payload)],
    );
    const updated = (
        await db.query<Trip>("select * from trips where id=$1", [trip])
      ).rows[0],
      segments = (
        await db.query<Segment>(
          "select * from trip_segments where trip_id=$1",
          [trip],
        )
      ).rows;
    const map = tripMapData(updated, segments, [], []);
    expect(map.orderAmbiguous).toBe(false);
    expect(map.destinations.map((d) => d.title)).toEqual([
      "Paris, France",
      "Dated stop",
    ]);
    expect(map.destinations.map((d) => d.order)).toEqual([1, 2]);
    await expect(
      db.query(
        "select change_trip_destination($1,$2,'saved','order',0,'reorder',$3::jsonb)",
        [trip, t.trip_revision, JSON.stringify(payload)],
      ),
    ).rejects.toThrow(/changed/);
  } finally {
    await db.close();
  }
}, 30000);
