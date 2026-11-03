import { expect, it } from "vitest";
import {
  tripMapEntries,
  filterMapEntries,
  mapBookingColumns,
} from "../lib/trip-map";
import {
  mapTrip,
  mapSegment,
  mapBooking,
  mapPlace,
  freshPlace,
} from "./map-fixtures";
const filter = { kind: "all", day: "", includeUndated: true, category: "all" };
it("keeps departure and arrival as separate city centers on their own saved local dates", () => {
  const entries = tripMapEntries(
    mapTrip.id,
    [
      mapSegment("Journey", {
        kind: "transport",
        end_date: "2027-05-02",
        location_id: "tokyo",
        location_label: "Tokyo",
        latitude: 35.68,
        longitude: 139.69,
        arrival_location_id: "paris",
        arrival_location_label: "Paris",
        arrival_latitude: 48.85,
        arrival_longitude: 2.35,
      }),
    ],
    [
      mapBooking("Flight", {
        category: "flight",
        end_date: "2027-05-02",
        end_location_id: "paris",
        end_location_label: "Paris",
        end_latitude: 48.85,
        end_longitude: 2.35,
      }),
    ],
    [],
  );
  expect(entries.map((e) => [e.source, e.role, e.start, e.precision])).toEqual([
    ["segment", "departure", "2027-05-01", "city"],
    ["segment", "arrival", "2027-05-02", "city"],
    ["booking", "departure", "2027-05-01", "city"],
    ["booking", "arrival", "2027-05-02", "city"],
  ]);
  const arrivals = filterMapEntries(entries, { ...filter, day: "2027-05-02" });
  expect(arrivals).toHaveLength(2);
  expect(arrivals.every((e) => e.role === "arrival")).toBe(true);
  expect(arrivals[0].href).toContain("day=2027-05-02");
  expect(arrivals[1].href).toContain("view=bookings&edit=Flight");
});
it("keeps unknown locations and unscheduled ideas without inventing coordinates or dates", () => {
  const entries = tripMapEntries(
    mapTrip.id,
    [
      mapSegment("Unknown", { address: "My own address" }),
      mapSegment("Idea", { status: "idea" }),
      mapSegment("Invalid", {
        location_id: "city",
        latitude: NaN,
        longitude: 190,
      }),
      mapSegment("Other trip", { trip_id: "other" }),
    ],
    [],
    [],
  );
  expect(entries).toHaveLength(3);
  expect(entries.every((e) => e.point === null)).toBe(true);
  expect(entries[0].mapsUrl).toContain("query=My%20own%20address");
  expect(entries[1]).toMatchObject({ kind: "idea", start: null, end: null });
  expect(
    filterMapEntries(entries, {
      ...filter,
      day: "2027-05-03",
      includeUndated: false,
    }),
  ).toEqual([]);
  expect(
    filterMapEntries(entries, { ...filter, day: "2027-05-03" }).map(
      (e) => e.title,
    ),
  ).toEqual(["Idea"]);
});
it("only uses matching fresh place details transiently and never changes saved data", () => {
  const segments = [
    mapSegment("Own venue label", { google_place_id: freshPlace.id }),
  ];
  const before = JSON.stringify(segments);
  expect(tripMapEntries(mapTrip.id, segments, [], [])[0].point).toBeNull();
  const detail = tripMapEntries(mapTrip.id, segments, [], [], {
    [freshPlace.id]: freshPlace,
  })[0];
  expect(detail).toMatchObject({
    title: "Own venue label",
    precision: "place",
    point: { latitude: freshPlace.latitude, longitude: freshPlace.longitude },
  });
  expect(detail.mapsUrl).toContain("query_place_id=ChIJ12345");
  expect(JSON.stringify(segments)).toBe(before);
  expect(
    tripMapEntries(mapTrip.id, segments, [], [], {
      [freshPlace.id]: { ...freshPlace, id: "different" },
    })[0].point,
  ).toBeNull();
});
it("applies type, day and saved-category filters without changing unrelated trip records", () => {
  const entries = tripMapEntries(
    mapTrip.id,
    [
      mapSegment("Day one"),
      mapSegment("Day two", {
        start_date: "2027-05-02",
        end_date: "2027-05-02",
      }),
    ],
    [mapBooking("Hotel")],
    [mapPlace("Food"), mapPlace("Transport", { category: "transport" })],
  );
  const shown = filterMapEntries(entries, {
    ...filter,
    day: "2027-05-02",
    category: "food",
  });
  expect(shown.map((e) => e.title)).toEqual(["Day two", "Hotel", "Food"]);
  expect(
    filterMapEntries(entries, {
      ...filter,
      kind: "stay",
      day: "2027-05-03",
    }).map((e) => e.title),
  ).toEqual(["Hotel"]);
  expect(
    filterMapEntries(entries, {
      ...filter,
      kind: "saved",
      category: "transport",
    }).map((e) => e.title),
  ).toEqual(["Transport"]);
});
it("accepts real zero coordinates and namespaces colliding record IDs across sources", () => {
  const entries = tripMapEntries(
    mapTrip.id,
    [mapSegment("same", { location_id: "zero", latitude: 0, longitude: 0 })],
    [mapBooking("same")],
    [mapPlace("same")],
  );
  expect(new Set(entries.map((e) => e.id)).size).toBe(3);
  expect(entries[0].point).toEqual({ latitude: 0, longitude: 0 });
  expect(entries[0].precision).toBe("city");
});
it("the map's booking projection excludes references, traveler names, notes, prices and documents", () => {
  const fields = mapBookingColumns.split(",");
  expect(fields).toContain("end_latitude");
  for (const field of [
    "reference",
    "travelers",
    "notes",
    "price",
    "paid_amount",
    "booking_attachments",
    "path",
  ])
    expect(fields).not.toContain(field);
});
