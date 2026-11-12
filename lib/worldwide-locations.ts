import { z } from "zod";
import { geographicLocation } from "./geographic-location";
import { searchLocations } from "./locations";
import type { ResolvedLocation } from "./location-types";
import {
  canSearchLocation,
  locationQuery,
  LOCATION_RESULT_LIMIT,
  type LocationSearchScope,
} from "./location-search";

const optionalText = z.string().max(500).nullish();
const featureSchema = z.object({
  geometry: z.object({
    type: z.literal("Point"),
    coordinates: z.tuple([
      z.number().min(-180).max(180),
      z.number().min(-90).max(90),
    ]),
  }),
  properties: z.object({
    name: z.string().trim().min(1).max(500),
    country: optionalText,
    countrycode: z
      .string()
      .regex(/^[a-zA-Z]{2}$/)
      .nullish(),
    state: optionalText,
    county: optionalText,
    city: optionalText,
    district: optionalText,
    type: optionalText,
    osm_key: optionalText,
    osm_value: optionalText,
    osm_type: z.string().nullish(),
    osm_id: z.union([z.number(), z.string()]).nullish(),
  }),
});
type Feature = z.infer<typeof featureSchema>;
type Candidate = {
  location: ResolvedLocation;
  geographic: boolean;
  order: number;
  object?: string;
  kind?: string;
  destinationRank: number;
};
const layers = [
  "country",
  "state",
  "county",
  "city",
  "district",
  "locality",
  "other",
];
const settlements = new Set([
  "country",
  "state",
  "province",
  "region",
  "county",
  "city",
  "town",
  "village",
  "hamlet",
  "municipality",
  "island",
  "islet",
  "archipelago",
  "locality",
  "suburb",
  "neighbourhood",
  "quarter",
]);
const folded = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
const compact = (value: string) =>
  folded(value)
    .replace(/^koh\s/, "ko ")
    .replace(/\s/g, "");
function nameRank(name: string, query: string) {
  // Keep Photon's multilingual relevance when display labels use another script.
  if (/[^\p{Script=Latin}\p{N}\s]/u.test(folded(query))) return 0;
  const a = compact(name),
    b = compact(query);
  if (a === b) return 0;
  if (a.length >= 2 && b.startsWith(a)) return 1; // place plus country/context
  if (b.length >= 2 && a.startsWith(b)) return 2;
  return 3; // keep the provider's multilingual/fuzzy order otherwise
}
function isGeographic(p: Feature["properties"]) {
  return (
    ["country", "state", "county", "city", "district"].includes(p.type || "") ||
    settlements.has(p.osm_value || "") ||
    p.osm_key === "natural" ||
    ["national_park", "protected_area", "nature_reserve"].includes(
      p.osm_value || "",
    ) ||
    (p.osm_key === "leisure" && p.osm_value === "park")
  );
}
function candidate(
  feature: Feature,
  order: number,
  scope: LocationSearchScope,
): Candidate {
  const p = feature.properties;
  const name = p.name.slice(0, 200);
  const seen = new Set([folded(name)]);
  const context = (
    scope === "destination"
      ? [p.state || p.county || p.city, p.country]
      : [p.city, p.state || p.county, p.country]
  ).filter((value): value is string => {
    if (!value?.trim() || seen.has(folded(value))) return false;
    seen.add(folded(value));
    return true;
  });
  // Keep the country visible within the existing 200-character saved-label limit.
  const country = context.at(-1) || "";
  const room = Math.max(0, 198 - name.length);
  let description = context.join(", ");
  while (description.length > room && context.length > 1) {
    context.shift();
    description = context.join(", ");
  }
  description =
    description.slice(0, Math.min(200, room)) || country.slice(0, room);
  return {
    location: geographicLocation(
      name,
      description,
      feature.geometry.coordinates[1],
      feature.geometry.coordinates[0],
      p.countrycode?.toUpperCase() || "ZZ",
      p.osm_type &&
        /^[NRW]$/.test(p.osm_type) &&
        /^[1-9]\d*$/.test(String(p.osm_id))
        ? `osm:${p.osm_type}:${p.osm_id}`
        : undefined,
    ),
    geographic: isGeographic(p),
    destinationRank:
      ["highway", "building", "addr:housenumber"].includes(p.osm_key || "") ||
      ["street", "house"].includes(p.type || "")
        ? 9
        : ["suburb", "neighbourhood", "quarter", "district"].includes(
              p.osm_value || "",
            ) || p.type === "district"
          ? 2
          : isGeographic(p)
            ? 0
            : 3,
    order,
    object:
      p.osm_type && p.osm_id != null ? p.osm_type + ":" + p.osm_id : undefined,
    kind: (p.osm_value === "administrative"
      ? p.type
      : p.osm_value || p.type
    )?.replaceAll("_", " "),
  };
}

export async function searchWorldwideLocations(
  query: string,
  fetcher: typeof fetch = fetch,
  scope: LocationSearchScope = "place",
) {
  query = locationQuery(query);
  if (!canSearchLocation(query))
    return { results: [], worldwideAvailable: false };
  const local = searchLocations(query);
  const deadline = Date.now() + 6000;
  async function request(term: string) {
    const url = new URL("https://photon.komoot.io/api/");
    url.searchParams.set("q", term);
    url.searchParams.set("limit", "30");
    // lang controls display labels, not a country or query-language restriction.
    url.searchParams.set("lang", "en");
    if (scope === "destination")
      for (const layer of layers) url.searchParams.append("layer", layer);
    const response = await fetcher(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(
        Math.max(1, Math.min(4000, deadline - Date.now())),
      ),
      next: { revalidate: 86400 },
    });
    if (!response.ok) throw new Error("Place search unavailable");
    const data = z
      .object({ features: z.array(z.unknown()).max(100) })
      .parse(await response.json());
    return data.features.flatMap((entry, order) => {
      const parsed = featureSchema.safeParse(entry);
      if (!parsed.success) return [];
      try {
        return [candidate(parsed.data, order, scope)];
      } catch {
        return [];
      } // malformed coordinates must not hide other valid results
    });
  }
  try {
    const remote = await request(query);
    // Photon has a real romanization gap: "Koh Phangan" can miss Ko Pha-ngan.
    // Try only this common spelling variant, only when no geographic name matches.
    // Merge genuine provider records; never synthesize a place or coordinates.
    if (
      scope === "destination" &&
      /^koh\s/iu.test(query) &&
      !remote.some(
        (item) => item.geographic && nameRank(item.location.city, query) <= 1,
      ) &&
      Date.now() < deadline
    ) {
      try {
        remote.push(...(await request(query.replace(/^koh(?=\s)/iu, "Ko"))));
      } catch {
        /* The original successful results remain useful if retry fails. */
      }
    }
    const candidates: Candidate[] = [
      ...remote,
      ...local.map((location, order) => ({
        location,
        geographic: true,
        destinationRank: 0,
        order: remote.length + order,
      })),
    ];
    candidates.sort((a, b) => {
      const name =
        nameRank(a.location.city, query) - nameRank(b.location.city, query);
      const geography = Number(!a.geographic) - Number(!b.geographic);
      return (
        (scope === "destination"
          ? a.destinationRank - b.destinationRank || geography || name
          : name || geography) || a.order - b.order
      );
    });
    const objects = new Set<string>(),
      points = new Set<string>();
    const unique = candidates
      .filter((item) => {
        if (scope === "destination" && item.destinationRank === 9) return false;
        const r = item.location;
        // City-timezones is a fallback representation, not another provider
        // place. Prefer the matching Photon settlement with the same full
        // region/country label and nearby center; keep other namesakes.
        if (
          r.source === "city-timezones" &&
          remote.some(
            (other) =>
              other.geographic &&
              folded(other.location.label) === folded(r.label) &&
              Math.abs(other.location.latitude - r.latitude) < 0.03 &&
              Math.abs(other.location.longitude - r.longitude) < 0.03,
          )
        )
          return false;
        const point = `${folded(r.city)}:${r.latitude.toFixed(3)}:${r.longitude.toFixed(3)}`;
        if ((item.object && objects.has(item.object)) || points.has(point))
          return false;
        if (item.object) objects.add(item.object);
        points.add(point);
        return true;
      })
      .slice(0, LOCATION_RESULT_LIMIT);
    const results = unique.map((item) => {
      const r = item.location;
      if (
        item.kind &&
        unique.find((other) => other.location.label === r.label) !== item
      )
        return geographicLocation(
          r.city,
          [item.kind, r.country].filter(Boolean).join(" · ").slice(0, 200),
          r.latitude,
          r.longitude,
          r.id.split(":")[1],
          r.providerId,
        );
      return r;
    });
    return { results, worldwideAvailable: true };
  } catch {
    return { results: local, worldwideAvailable: false };
  }
}
