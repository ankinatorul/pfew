import { it, expect, vi } from "vitest";
import { searchWorldwideLocations } from "../lib/worldwide-locations";
import { resolveLocation } from "../lib/locations";
import { bookingSearchCenters } from "../lib/booking-place-search";
import { overviewTrip } from "./fixtures/trip-overview";
const poi = (
  name: string,
  id: number,
  value: string,
  key = "tourism",
  lat = 48.86,
  lon = 2.33,
) => ({
  geometry: { type: "Point", coordinates: [lon, lat] },
  properties: {
    name,
    city: "Paris",
    country: "France",
    countrycode: "fr",
    osm_type: "N",
    osm_id: id,
    osm_key: key,
    osm_value: value,
  },
});
it("returns lodging POIs with real metadata, biases by saved destination and retains distinct same-name properties", async () => {
  const near = poi("Grand Hotel", 1, "hotel"),
    far = poi("Grand Hotel", 2, "hotel", "tourism", 35, 139);
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      Response.json({
        features: [far, poi("Grand Hotel", 3, "street", "highway"), near, near],
      }),
    );
  const result = await searchWorldwideLocations(
    "Grand Hotel",
    fetcher,
    "place",
    { kind: "Stay", centers: [{ latitude: 48.85, longitude: 2.35 }] },
  );
  expect(result.results).toHaveLength(2);
  expect(result.results[0].providerId).toBe("osm:N:1");
  expect(resolveLocation(result.results[0].id)).toEqual(result.results[0]);
  expect(result.presentations[result.results[0].id]).toMatchObject({
    type: "Hotel",
    context: "Paris, France",
  });
  const url = new URL(String(fetcher.mock.calls[0][0]));
  expect(url.searchParams.get("lat")).toBe("48.85");
  expect(url.searchParams.has("bbox")).toBe(false);
});
it("separates attraction and restaurant POIs from lodging and administrative matches", async () => {
  const fetcher = vi
    .fn()
    .mockImplementation(async () =>
      Response.json({
        features: [
          poi("Louvre", 1, "museum"),
          poi("Louvre Café", 2, "cafe", "amenity"),
          poi("Louvre district", 3, "administrative", "boundary"),
          poi("Louvre hotel", 4, "hotel"),
        ],
      }),
    );
  const result = await searchWorldwideLocations("Louvre", fetcher, "place", {
    kind: "Experience",
    centers: [],
  });
  expect(result.results.map((p) => p.city)).toEqual(["Louvre", "Louvre Café"]);
});
it("distinguishes empty POI coverage and provider failure without substituting a city", async () => {
  const empty = vi
    .fn()
    .mockResolvedValue(
      Response.json({ features: [poi("Paris", 1, "city", "place")] }),
    );
  const ok = await searchWorldwideLocations("Paris", empty, "place", {
    kind: "Stay",
    centers: [],
  });
  expect(ok.results).toEqual([]);
  expect(ok.status).toBe("ok");
  const failed = vi
    .fn()
    .mockResolvedValue(
      new Response("limit", { status: 429, headers: { "Retry-After": "60" } }),
    );
  const result = await searchWorldwideLocations("Paris", failed, "place", {
    kind: "Stay",
    centers: [],
  });
  expect(result.results).toEqual([]);
  expect(result.status).toBe("rate_limited");
  await searchWorldwideLocations("Another hotel", failed, "place", {
    kind: "Stay",
    centers: [],
  });
  expect(failed).toHaveBeenCalledTimes(1);
});
it("uses only finite saved destination coordinates and caps bias centers", () => {
  expect(
    bookingSearchCenters({
      ...overviewTrip,
      draft_data: {
        destinations: [
          { latitude: 0, longitude: 0 },
          { latitude: 0, longitude: 0 },
          { latitude: null, longitude: 10 },
          { latitude: NaN, longitude: 1 },
        ],
      },
    }),
  ).toEqual([{ latitude: 0, longitude: 0 }]);
});
