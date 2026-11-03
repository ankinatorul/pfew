import { expect, it, vi } from "vitest";
import { searchWorldwideLocations } from "../lib/worldwide-locations";
import {
  geographicLocation,
  coordinatesFromInput,
} from "../lib/geographic-location";
import { resolveLocation } from "../lib/locations";
import { destinationSchema } from "../lib/domain";
import { sourcesForLocation } from "../lib/research-catalog";
import { POST } from "../app/api/locations/route";
const island = (name: string, latitude: number, longitude: number) => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: [longitude, latitude] },
  properties: {
    name,
    country: "Thailand",
    countrycode: "th",
    state: "Surat Thani",
    osm_value: "island",
  },
});
it("finds Thai islands without a city-only filter and persists their geographic point", async () => {
  const fetcher = vi.fn().mockResolvedValue(
    Response.json({
      features: [
        island("Ko Pha Ngan", 9.73, 100.01),
        island("Ko Tao", 10.1, 99.84),
      ],
    }),
  );
  const result = await searchWorldwideLocations(
    "Koh Phangan Thailand",
    fetcher,
  );
  expect(result.worldwideAvailable).toBe(true);
  expect(result.results).toHaveLength(2);
  expect(String(fetcher.mock.calls[0][0])).toContain("photon.komoot.io");
  expect(String(fetcher.mock.calls[0][0])).not.toMatch(/layer|city=/);
  for (const place of result.results) {
    expect(place.timezone).toBe("Asia/Bangkok");
    expect(sourcesForLocation(place.id)).toHaveLength(2);
    expect(resolveLocation(place.id)).toEqual(place);
    expect(
      destinationSchema.safeParse({
        title: place.label,
        location_id: place.id,
        timezone: place.timezone,
        start_date: "2027-05-01",
        end_date: "2027-05-10",
      }).success,
    ).toBe(true);
  }
});
it("retains local cities and allows manual points when worldwide search is down", async () => {
  const result = await searchWorldwideLocations(
    "Tokyo",
    vi.fn().mockRejectedValue(new Error("offline")),
  );
  expect(result.worldwideAvailable).toBe(false);
  expect(result.results[0].timezone).toBe("Asia/Tokyo");
});
it("ignores malformed provider features and never guesses coordinates", async () => {
  const result = await searchWorldwideLocations(
    "Unlisted island",
    vi.fn().mockResolvedValue(
      Response.json({
        features: [
          island("Broken", 999, 100),
          { properties: { name: "Missing point" } },
        ],
      }),
    ),
  );
  expect(result.results).toEqual([]);
});
it("round-trips Unicode names and rejects forged zones or invalid geographic IDs", () => {
  const place = geographicLocation("เกาะพะงัน", "Thailand", 9.73, 100.01);
  expect(resolveLocation(place.id)).toEqual(place);
  const fake =
    "geo:ZZ:" +
    Buffer.from(JSON.stringify(["Fake", "", 1000, 0])).toString("base64url");
  expect(resolveLocation(fake)).toBeNull();
  expect(resolveLocation("geo:broken")).toBeNull();
  expect(() => geographicLocation("Fake", "", 0, 181)).toThrow();
});
it("accepts explicit map pins and coordinates, not short links or viewport centers", () => {
  expect(coordinatesFromInput("9.73, 100.01")).toEqual([9.73, 100.01]);
  expect(
    coordinatesFromInput(
      "https://www.google.com/maps/search/?api=1&query=9.73,100.01",
    ),
  ).toEqual([9.73, 100.01]);
  expect(
    coordinatesFromInput(
      "https://www.google.com/maps/place/Island/@1,2,10z/data=!4m2!3d9.73!4d100.01",
    ),
  ).toEqual([9.73, 100.01]);
  expect(
    coordinatesFromInput(
      "https://www.openstreetmap.org/?mlat=9.73&mlon=100.01",
    ),
  ).toEqual([9.73, 100.01]);
  for (const input of [
    "Koh Phangan",
    "https://maps.app.goo.gl/example",
    "https://www.google.com/maps/@9.73,100.01,12z",
    "https://evil.test/?q=9.73,100.01",
    "91,0",
  ])
    expect(coordinatesFromInput(input)).toBeNull();
});
it("manual location endpoint derives the zone and rejects an unknown map position", async () => {
  const req = (position: string) =>
    new Request("https://pfew.vercel.app/api/locations", {
      method: "POST",
      body: JSON.stringify({
        name: "Koh Phangan",
        position,
        timezone: "America/New_York",
      }),
    });
  const response = await POST(req("9.73,100.01"));
  expect(response.status).toBe(200);
  const { location } = await response.json();
  expect(location.timezone).toBe("Asia/Bangkok");
  expect(resolveLocation(location.id)).toEqual(location);
  expect((await POST(req("Koh Phangan"))).status).toBe(400);
});
