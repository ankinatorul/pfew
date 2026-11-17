import { it, expect } from "vitest";
import {
  tripMapData,
  coordinates,
  mapGeoJSON,
  mapBounds,
  associatedPlaces,
  unwrap,
} from "../lib/trip-map";
import {
  overviewTrip,
  overviewSegment,
  overviewBooking,
} from "./fixtures/trip-overview";
import { geographicLocation } from "../lib/geographic-location";
it("uses saved order, actual coordinates and compact record links without inventing missing locations", () => {
  const trip = {
    ...overviewTrip,
    draft_data: {
      destinations: [
        geographicLocation("Bali", "Indonesia", -8.3, 115, "ID"),
        geographicLocation("Paris", "France", 48, 2, "FR"),
      ],
    },
  };
  const b = { ...overviewBooking(), latitude: 1, longitude: 2 };
  const m = tripMapData(
    trip,
    [],
    [b],
    [
      {
        id: "cafe",
        title: "Cafe",
        category: "food",
        latitude: null,
        longitude: null,
      },
    ],
  );
  expect(m.destinations.map((p) => [p.order, p.title, p.coordinates])).toEqual([
    [1, "Bali, Indonesia", [115, -8.3]],
    [2, "Paris, France", [2, 48]],
  ]);
  expect(m.places[0].href).toContain("view=bookings&edit=");
  expect(m.places[1].coordinates).toBeNull();
  expect(coordinates(null, null)).toBeNull();
  expect(coordinates(0, 0)).toEqual([0, 0]);
  expect(coordinates(NaN, 0)).toBeNull();
  expect(coordinates(95, 1)).toBeNull();
});
it("numbers dated stops by stored positions, falls back to dates for equal legacy positions and keeps missing intermediate legs disconnected", () => {
  const a = overviewSegment({
      id: "a",
      kind: "destination",
      position: 1,
      start_date: "2027-05-01",
      latitude: 0,
      longitude: 170,
    }),
    b = overviewSegment({
      id: "b",
      kind: "destination",
      position: 0,
      start_date: "2027-05-03",
      latitude: 1,
      longitude: -170,
    });
  const m = tripMapData(overviewTrip, [a, b], [], []);
  expect(m.destinations.map((p) => p.id)).toEqual(["b", "a"]);
  const geo = mapGeoJSON(m.destinations, []);
  expect(geo.route.features[0].geometry.coordinates).toEqual([
    [-170, 1],
    [-190, 0],
  ]);
  expect(mapGeoJSON([m.destinations[0]], []).route.features).toHaveLength(0);
  expect(
    mapGeoJSON(
      [
        ...m.destinations,
        { ...m.destinations[0], coordinates: null },
        m.destinations[0],
      ],
      [],
    ).route.features,
  ).toHaveLength(1);
  expect(mapGeoJSON(m.destinations, [], false).route.features).toEqual([]);
  expect(
    unwrap([
      [170, 0],
      [-170, 0],
      [-160, 0],
    ]),
  ).toEqual([
    [170, 0],
    [190, 0],
    [200, 0],
  ]);
  const bounds = mapBounds([
    [170, 0],
    [-170, 10],
    [175, 5],
  ])!;
  expect(bounds[1][0] - bounds[0][0]).toBe(20);
});
it("maps stays, transport endpoints and saved food, associates only stored destination relationships and suppresses linked segment duplicates", () => {
  const stop = overviewSegment({
    id: "stop",
    kind: "destination",
    latitude: 1,
    longitude: 2,
  });
  const activity = overviewSegment({
    id: "activity",
    kind: "activity",
    destination_id: "stop",
    latitude: 2,
    longitude: 3,
  });
  const transport = {
    ...overviewBooking(),
    id: "flight",
    category: "flight" as const,
    latitude: 3,
    longitude: 4,
    end_latitude: 5,
    end_longitude: 6,
  };
  const m = tripMapData(
    overviewTrip,
    [stop, activity],
    [transport],
    [
      {
        id: "cafe",
        title: "Cafe",
        category: "food",
        latitude: 4,
        longitude: 5,
      },
    ],
  );
  expect(m.places.map((p) => p.category)).toEqual([
    "activity",
    "transport",
    "transport",
    "food",
  ]);
  expect(
    associatedPlaces(m.destinations[0], m.places).map((p) => p.id),
  ).toEqual(["segment:activity"]);
  const linked = tripMapData(
    overviewTrip,
    [activity],
    [{ ...transport, segment_id: "activity" }],
    [],
  );
  expect(linked.places.filter((p) => p.id === "segment:activity")).toHaveLength(
    1,
  );
  const duplicate = tripMapData(
    overviewTrip,
    [activity],
    [{ ...transport, segment_id: "activity", latitude: 2, longitude: 3 }],
    [],
  );
  expect(
    duplicate.places.filter((p) => p.id === "segment:activity"),
  ).toHaveLength(0);
});
it("large saved collections use one GeoJSON collection with stable IDs and no per-marker requests", () => {
  const places = Array.from({ length: 5000 }, (_, i) => ({
    id: String(i),
    title: "Place " + i,
    category: "activity",
    latitude: i % 80,
    longitude: i % 170,
  }));
  const m = tripMapData(overviewTrip, [], [], places),
    geo = mapGeoJSON([], m.places);
  expect(geo.places.features).toHaveLength(5000);
  expect(new Set(geo.places.features.map((f) => f.id)).size).toBe(5000);
  expect(
    mapBounds(m.places.flatMap((p) => (p.coordinates ? [p.coordinates] : []))),
  ).not.toBeNull();
});

it("legacy named destinations without coordinates remain visible and mixed sources do not invent a connecting route", () => {
  const t = {
    ...overviewTrip,
    draft_data: {
      destinations: [
        { id: "one", label: "Unmapped stop" },
        { id: "two", label: "Saved island", latitude: 7.5, longitude: 99 },
      ],
    },
  };
  const m = tripMapData(t, [], [], []);
  expect(m.destinations).toHaveLength(2);
  expect(m.destinations[0].coordinates).toBeNull();
  expect(m.destinations[1].coordinates).toEqual([99, 7.5]);
  const mixed = tripMapData(
    t,
    [
      overviewSegment({
        id: "dated",
        kind: "destination",
        latitude: 1,
        longitude: 2,
      }),
    ],
    [],
    [],
  );
  expect(mixed.destinations).toHaveLength(3);
  expect(mixed.orderAmbiguous).toBe(true);
  expect(mapGeoJSON(mixed.destinations, []).route.features).toEqual([]);
});
