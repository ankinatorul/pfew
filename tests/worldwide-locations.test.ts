import { expect, it, vi } from "vitest";
import { searchWorldwideLocations } from "../lib/worldwide-locations";
import {
  geographicLocation,
  coordinatesFromInput,
} from "../lib/geographic-location";
import { resolveLocation } from "../lib/locations";
import { destinationSchema } from "../lib/domain";
import { sourcesForLocation } from "../lib/research-catalog";
import { POST, GET } from "../app/api/locations/route";
import { canSearchLocation, locationQuery } from "../lib/location-search";
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
it("uses worldwide geographic layers only for destination inputs, retaining broad place search elsewhere", async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ features: [] }));
  await searchWorldwideLocations("National Park", fetcher, "destination");
  const url = new URL(String(fetcher.mock.calls[0][0]));
  expect(url.searchParams.get("limit")).toBe("30");
  expect(url.searchParams.getAll("layer")).toEqual([
    "country",
    "state",
    "county",
    "city",
    "district",
    "locality",
    "other",
  ]);
  for (const parameter of ["countrycode", "bbox", "lat", "lon", "osm_tag"])
    expect(url.searchParams.has(parameter)).toBe(false);
});
it("promotes real geographic candidates beyond the old eight-result window and removes duplicate OSM objects", async () => {
  const poi = (i: number) => ({
    ...island("京都駅 " + i, 35.01, 135.76),
    properties: {
      name: "京都駅 " + i,
      type: "house",
      osm_key: "railway",
      osm_value: "station",
      country: "Japan",
    },
  });
  const city = {
    ...island("Kyoto", 35.02, 135.75),
    properties: {
      name: "Kyoto",
      type: "city",
      osm_type: "R",
      osm_id: 123,
      osm_key: "place",
      osm_value: "city",
      country: "Japan",
      state: "Kyoto Prefecture",
    },
  };
  const result = await searchWorldwideLocations(
    "京都",
    vi
      .fn()
      .mockResolvedValue(
        Response.json({
          features: [
            ...Array.from({ length: 12 }, (_, i) => poi(i)),
            city,
            city,
          ],
        }),
      ),
    "destination",
  );
  expect(result.results[0].city).toBe("Kyoto");
  expect(result.results).toHaveLength(12);
  expect(result.results.filter((item) => item.city === "Kyoto")).toHaveLength(
    1,
  );
});
it("ranks exact accented place names ahead of containing names and includes city/county/state/country context", async () => {
  const same = (name: string, lon: number) => ({
    ...island(name, 0.34, lon),
    properties: {
      name,
      osm_key: "place",
      osm_value: "city",
      district: "Centre",
      city: name,
      county: "Água Grande",
      state: null,
      country: "São Tomé and Príncipe",
      countrycode: "ST",
    },
  });
  const result = await searchWorldwideLocations(
    "Sao Tome",
    vi
      .fn()
      .mockResolvedValue(
        Response.json({
          features: [
            same("São Tomé and Príncipe", 6.7),
            same("São Tomé", 6.73),
          ],
        }),
      ),
    "destination",
  );
  expect(result.results[0].city).toBe("São Tomé");
  expect(result.results[0].label).toContain(
    "Centre, Água Grande, São Tomé and Príncipe",
  );
  expect(resolveLocation(result.results[0].id)).toEqual(result.results[0]);
});
it("uses one bounded alternate spelling only when Koh has no geographic name match", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({
        features: [island("Koh Phangan Public Park", 9.71, 99.98)],
      }),
    )
    .mockResolvedValueOnce(
      Response.json({ features: [island("Ko Pha-ngan", 9.73, 100.01)] }),
    );
  const result = await searchWorldwideLocations(
    "Koh Phangan Thailand",
    fetcher,
    "destination",
  );
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(new URL(String(fetcher.mock.calls[1][0])).searchParams.get("q")).toBe(
    "Ko Phangan Thailand",
  );
  expect(result.results[0].city).toBe("Ko Pha-ngan");
  const exact = vi
    .fn()
    .mockResolvedValue(
      Response.json({ features: [island("Koh Tao", 10.1, 99.84)] }),
    );
  await searchWorldwideLocations("Koh Tao", exact, "destination");
  expect(exact).toHaveBeenCalledOnce();
});
it("does not let a failed alternate spelling hide successful original results", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({
        features: [island("A beach on Koh Phangan", 9.73, 100.01)],
      }),
    )
    .mockRejectedValueOnce(new Error("offline"));
  const result = await searchWorldwideLocations(
    "Koh Phangan",
    fetcher,
    "destination",
  );
  expect(result.worldwideAvailable).toBe(true);
  expect(result.results).toHaveLength(1);
});
it("accepts short non-English names and normalizes input without making broad single-letter requests", async () => {
  for (const query of ["津", "Å", "京都", "São Tomé"])
    expect(canSearchLocation(query)).toBe(true);
  for (const query of ["a", " ", "🌎", "x".repeat(101)])
    expect(canSearchLocation(query)).toBe(false);
  expect(locationQuery("  Sa\u0303o   Tome  ")).toBe("São Tome");
  const invalid = vi.fn();
  await searchWorldwideLocations("x".repeat(101), invalid, "destination");
  expect(invalid).not.toHaveBeenCalled();
  expect(
    (
      await GET(
        new Request("http://localhost/api/locations?q=" + "x".repeat(101)),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await GET(
        new Request("http://localhost/api/locations?q=Paris&scope=invalid"),
      )
    ).status,
  ).toBe(400);
});
