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
it("requests worldwide discovery without upstream geographic layer restrictions", async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ features: [] }));
  await searchWorldwideLocations("National Park", fetcher, "destination");
  const url = new URL(String(fetcher.mock.calls[0][0]));
  expect(url.searchParams.get("limit")).toBe("30");
  expect(url.searchParams.getAll("layer")).toEqual([]);
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
    vi.fn().mockResolvedValue(
      Response.json({
        features: [...Array.from({ length: 12 }, (_, i) => poi(i)), city, city],
      }),
    ),
    "destination",
  );
  expect(result.results[0].city).toBe("Kyoto");
  expect(result.results).toHaveLength(1); // streets are excluded from destination results
  expect(result.results.filter((item) => item.city === "Kyoto")).toHaveLength(
    1,
  );
});
it("ranks exact accented place names ahead of containing names with concise regional context", async () => {
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
    vi.fn().mockResolvedValue(
      Response.json({
        features: [same("São Tomé and Príncipe", 6.7), same("São Tomé", 6.73)],
      }),
    ),
    "destination",
  );
  expect(result.results[0].city).toBe("São Tomé");
  expect(result.results[0].label).toContain(
    "Água Grande, São Tomé and Príncipe",
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
  expect(result.worldwideAvailable).toBe(false);
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

it("Ao Nang favors traveler destinations over streets/subdivisions and keeps namesakes distinct", async () => {
  const features = [
    {
      name: "Ao Nang Road",
      type: "street",
      osm_key: "highway",
      osm_value: "residential",
      osm_id: 1,
    },
    {
      name: "Ao Nang",
      type: "district",
      osm_key: "boundary",
      osm_value: "administrative",
      osm_id: 2,
    },
    {
      name: "Ao Nang",
      type: "city",
      osm_key: "place",
      osm_value: "town",
      osm_id: 3,
    },
    {
      name: "Ao Nang",
      type: "city",
      osm_key: "place",
      osm_value: "town",
      osm_id: 3,
    },
  ].map((p, i) => ({
    geometry: { type: "Point", coordinates: [98.82 + i * 0.001, 8.03] },
    properties: {
      country: "Thailand",
      state: "Krabi",
      county: "Mueang Krabi",
      district: "Minor subdivision",
      osm_type: "N",
      ...p,
    },
  }));
  const result = await searchWorldwideLocations(
    "Ao Nang",
    vi.fn().mockResolvedValue(Response.json({ features })),
    "destination",
  );
  expect(result.results[0].label).toBe("Ao Nang, Krabi, Thailand");
  expect(result.results[0].providerId).toBe("osm:N:3");
  expect(result.results.some((r) => r.city === "Ao Nang Road")).toBe(false);
  expect(result.results.filter((r) => r.providerId === "osm:N:3")).toHaveLength(
    1,
  );
  const namesakes = await searchWorldwideLocations(
    "Springfield",
    vi.fn().mockResolvedValue(
      Response.json({
        features: [
          {
            geometry: { type: "Point", coordinates: [-89.65, 39.78] },
            properties: {
              name: "Springfield",
              type: "city",
              country: "United States",
              state: "Illinois",
            },
          },
          {
            geometry: { type: "Point", coordinates: [-72.59, 42.1] },
            properties: {
              name: "Springfield",
              type: "city",
              country: "United States",
              state: "Massachusetts",
            },
          },
        ],
      }),
    ),
    "destination",
  );
  expect(namesakes.results.some((r) => r.label.includes("Illinois"))).toBe(
    true,
  );
  expect(namesakes.results.some((r) => r.label.includes("Massachusetts"))).toBe(
    true,
  );
  expect(
    namesakes.results.filter((r) => r.city === "Springfield").length,
  ).toBeGreaterThanOrEqual(2);
  expect(new Set(namesakes.results.map((r) => r.label)).size).toBe(
    namesakes.results.length,
  );
});

it.each([
  [
    "Koh Lanta, Thailand",
    "Ko Lanta",
    "island",
    8.1,
    98.95,
    "Thailand",
    "Krabi",
  ],
  ["Ao Nang, Thailand", "Ao Nang", "town", 8.03, 98.82, "Thailand", "Krabi"],
  ["Bangkok, Thailand", "Bangkok", "city", 13.75, 100.5, "Thailand", "Bangkok"],
  ["Phuket, Thailand", "Phuket", "island", 7.88, 98.39, "Thailand", "Phuket"],
  ["Ubud, Indonesia", "Ubud", "village", -8.5, 115.26, "Indonesia", "Bali"],
  ["Positano, Italy", "Positano", "town", 40.63, 14.48, "Italy", "Campania"],
  [
    "Santorini, Greece",
    "Santorini",
    "island",
    36.39,
    25.46,
    "Greece",
    "South Aegean",
  ],
  [
    "Zermatt, Switzerland",
    "Zermatt",
    "village",
    46.02,
    7.75,
    "Switzerland",
    "Valais",
  ],
])(
  "keeps supplied worldwide destination %s discoverable with clean metadata",
  async (query, name, value, lat, lon, country, state) => {
    const feature = {
      geometry: { type: "Point", coordinates: [lon, lat] },
      properties: {
        name,
        osm_key: "place",
        osm_value: value,
        type: "house",
        state,
        country,
        osm_type: "R",
        osm_id: 1234,
      },
    };
    const fetcher = vi
      .fn()
      .mockResolvedValue(Response.json({ features: [feature] }));
    const result = await searchWorldwideLocations(
      String(query),
      fetcher,
      "destination",
    );
    expect(result.status).toBe("ok");
    expect(result.results[0].city).toBe(name);
    expect(result.results[0].providerId).toBe("osm:R:1234");
    expect(
      result.presentations[result.results[0].id].context.split(",").length,
    ).toBeLessThanOrEqual(2);
    expect(resolveLocation(result.results[0].id)).toEqual(result.results[0]);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(
      new URL(String(fetcher.mock.calls[0][0])).searchParams.has("layer"),
    ).toBe(false);
  },
);
it("keeps administrative Koh Lanta and house-layer resorts, ranks name ahead of type", async () => {
  const features = [
    {
      geometry: { type: "Point", coordinates: [98.95, 8.1] },
      properties: {
        name: "Ko Lanta",
        type: "house",
        osm_key: "boundary",
        osm_value: "administrative",
        country: "Thailand",
        state: "Krabi",
        osm_type: "R",
        osm_id: 100,
      },
    },
    {
      geometry: { type: "Point", coordinates: [98.96, 8.2] },
      properties: {
        name: "Ko Lanta Beach",
        type: "other",
        osm_key: "natural",
        osm_value: "beach",
        country: "Thailand",
        state: "Krabi",
        osm_type: "N",
        osm_id: 101,
      },
    },
    {
      geometry: { type: "Point", coordinates: [98.94, 8.1] },
      properties: {
        name: "Ko Lanta Resort",
        type: "house",
        osm_key: "tourism",
        osm_value: "resort",
        country: "Thailand",
        state: "Krabi",
        osm_type: "W",
        osm_id: 102,
      },
    },
  ];
  const result = await searchWorldwideLocations(
    "Koh Lanta",
    vi.fn().mockResolvedValue(Response.json({ features })),
    "destination",
  );
  expect(result.results[0].providerId).toBe("osm:R:100");
  expect(result.results.map((r) => r.providerId)).toContain("osm:W:102");
  expect(result.presentations[result.results[0].id].type).toBeUndefined(); // not falsely called an island
});
it("does not merge a city, island and district; merges only explicit equivalent identities", async () => {
  const feature = (id: number, value: string, wikidata?: string) => ({
    geometry: { type: "Point", coordinates: [25.46, 36.39] },
    properties: {
      name: "Same name",
      type: value === "administrative" ? "district" : "other",
      osm_key: value === "administrative" ? "boundary" : "place",
      osm_value: value,
      country: "Greece",
      state: "Region",
      osm_type: "R",
      osm_id: id,
      ...(wikidata ? { extra: { wikidata } } : {}),
    },
  });
  const result = await searchWorldwideLocations(
    "Same name",
    vi.fn().mockResolvedValue(
      Response.json({
        features: [
          feature(1, "city"),
          feature(2, "island"),
          feature(3, "administrative"),
          feature(4, "village", "Q123"),
          feature(5, "village", "Q123"),
        ],
      }),
    ),
    "destination",
  );
  expect(result.results).toHaveLength(4);
  expect(new Set(result.results.map((r) => r.id)).size).toBe(4);
  const anonymous = [feature(10, "city"), feature(11, "island")].map((f) => ({
    ...f,
    properties: { ...f.properties, osm_type: undefined, osm_id: undefined },
  }));
  const points = await searchWorldwideLocations(
    "Same name",
    vi.fn().mockResolvedValue(Response.json({ features: anonymous })),
    "destination",
  );
  expect(new Set(points.results.map((r) => r.id)).size).toBe(2);
  expect(points.results.map((r) => points.presentations[r.id].type)).toEqual([
    "City",
    "Island",
  ]);
  for (const location of points.results) {
    expect(location.providerId).toBeUndefined();
    expect(resolveLocation(location.id)).toEqual(location);
  }
});
it("uses county context to distinguish genuinely different villages in one region", async () => {
  const features = ["First county", "Second county"].map((county, i) => ({
    geometry: { type: "Point", coordinates: [20 + i, 40] },
    properties: {
      name: "Namesake",
      type: "city",
      osm_key: "place",
      osm_value: "village",
      country: "Country",
      state: "Same region",
      county,
      osm_type: "N",
      osm_id: i + 1,
    },
  }));
  const result = await searchWorldwideLocations(
    "Namesake",
    vi.fn().mockResolvedValue(Response.json({ features })),
    "destination",
  );
  expect(result.results).toHaveLength(2);
  expect(result.results[0].label).not.toBe(result.results[1].label);
  expect(result.results.map((r) => r.label)).toContain(
    "Namesake, First county, Country",
  );
});
it("honors rate limiting without alternate-query storms and coalesces repeated searches", async () => {
  const limited = vi
    .fn()
    .mockResolvedValue(
      Response.json(
        { error: "busy" },
        { status: 429, headers: { "Retry-After": "60" } },
      ),
    );
  const first = await searchWorldwideLocations(
    "Koh Lanta",
    limited,
    "destination",
  );
  const second = await searchWorldwideLocations(
    "Ao Nang",
    limited,
    "destination",
  );
  expect(first.status).toBe("rate_limited");
  expect(second.status).toBe("rate_limited");
  expect(limited).toHaveBeenCalledOnce();
  const available = vi
    .fn()
    .mockResolvedValue(
      Response.json({ features: [island("Ko Lanta", 8.1, 98.95)] }),
    );
  await Promise.all([
    searchWorldwideLocations("Koh Lanta", available, "destination"),
    searchWorldwideLocations("Koh Lanta", available, "destination"),
  ]);
  await searchWorldwideLocations("Koh Lanta", available, "destination");
  expect(available).toHaveBeenCalledOnce();
});
it("distinguishes successful emptiness, malformed responses and timeouts", async () => {
  const empty = await searchWorldwideLocations(
    "Unlisted fictional cove",
    vi.fn().mockResolvedValue(Response.json({ features: [] })),
    "destination",
  );
  expect(empty.status).toBe("ok");
  expect(empty.worldwideAvailable).toBe(true);
  expect(empty.results).toHaveLength(0);
  for (const fetcher of [
    vi.fn().mockRejectedValue(new DOMException("timeout", "TimeoutError")),
    vi.fn().mockResolvedValue(Response.json({ features: "bad" })),
  ]) {
    const result = await searchWorldwideLocations(
      "Koh Lanta",
      fetcher,
      "destination",
    );
    expect(result.status).toBe("unavailable");
    expect(result.worldwideAvailable).toBe(false);
    expect(fetcher).toHaveBeenCalledOnce();
  }
});
it("bounds provider concurrency while preserving coalesced requests", async () => {
  const replies: ((value: Response) => void)[] = [];
  const fetcher = vi
    .fn()
    .mockImplementation(
      () => new Promise<Response>((resolve) => replies.push(resolve)),
    );
  const pending = Array.from({ length: 4 }, (_, i) =>
    searchWorldwideLocations("Fixture cove " + i, fetcher, "destination"),
  );
  const busy = await searchWorldwideLocations(
    "Fifth cove",
    fetcher,
    "destination",
  );
  expect(busy.status).toBe("rate_limited");
  expect(fetcher).toHaveBeenCalledTimes(4);
  replies.forEach((resolve) => resolve(Response.json({ features: [] })));
  await Promise.all(pending);
});
