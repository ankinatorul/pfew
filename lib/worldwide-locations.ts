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
    extra: z.object({ wikidata: optionalText }).passthrough().nullish(),
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
  context: string;
  countryCode: string;
  equivalent?: string;
  extraContext?: string;
  countryName?: string;
};
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
  const a = compact(name),
    b = compact(query.split(",")[0]);
  if (a === b) return 0;
  // Names plus geographic context, including accent/Ko/Koh variants.
  if (a.length >= 2 && b.startsWith(a) && b.length - a.length > 0) return 1;
  if (b.length >= 2 && a.startsWith(b)) return 2;
  if (/[^\p{Script=Latin}\p{N}\s]/u.test(folded(query))) return 2;
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
const placeKinds: Record<string, string> = {
  country: "Country",
  state: "Region",
  province: "Region",
  region: "Region",
  county: "County",
  district: "District",
  city: "City",
  town: "Town",
  village: "Village",
  hamlet: "Village",
  municipality: "Municipality",
  island: "Island",
  islet: "Island",
  archipelago: "Archipelago",
  locality: "Locality",
  suburb: "Neighborhood",
  neighbourhood: "Neighborhood",
  quarter: "Neighborhood",
  beach: "Beach",
  resort: "Resort",
  hotel: "Hotel",
  national_park: "National park",
  protected_area: "Protected area",
  nature_reserve: "Nature reserve",
  park: "Park",
};
function kindOf(p: Feature["properties"]) {
  return (
    placeKinds[p.osm_value || ""] ||
    (p.osm_value === "administrative" || !p.osm_value
      ? placeKinds[p.type || ""]
      : undefined)
  );
}
function destinationRank(p: Feature["properties"]) {
  // A resort, island or administrative place may legitimately be layer=house.
  if (kindOf(p))
    return p.osm_value === "hotel"
      ? 4
      : ["suburb", "neighbourhood", "quarter", "district"].includes(
            p.osm_value || "",
          ) || ["district", "county"].includes(p.type || "")
        ? 1
        : 0;
  if (p.osm_key === "boundary" || p.osm_key === "place" || isGeographic(p))
    return 1;
  if (
    p.osm_key === "highway" ||
    ["street", "house"].includes(p.type || "") ||
    p.osm_key === "building"
  )
    return 9;
  return 5;
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
    destinationRank: destinationRank(p),
    context: description,
    countryName: p.country || "",
    extraContext:
      [p.county, p.city, p.district].find(
        (value) =>
          value &&
          ![name, p.state, p.country].some(
            (other) => other && folded(other) === folded(value),
          ),
      ) || undefined,
    countryCode: p.countrycode?.toUpperCase() || "ZZ",
    equivalent: /^Q[1-9]\d*$/.test(p.extra?.wikidata || "")
      ? p.extra!.wikidata!
      : undefined,
    order,
    object:
      p.osm_type && p.osm_id != null ? p.osm_type + ":" + p.osm_id : undefined,
    kind: kindOf(p),
  };
}

export type LocationSearchResult = {
  results: ResolvedLocation[];
  presentations: Record<string, { context: string; type?: string }>;
  worldwideAvailable: boolean;
  status: "ok" | "unavailable" | "rate_limited";
  retryAfterSeconds?: number;
};
class ProviderFailure extends Error {
  constructor(
    public status: "unavailable" | "rate_limited",
    public seconds = 5,
  ) {
    super(status);
  }
}
type ProviderState = {
  until: number;
  failure?: ProviderFailure;
  cache: Map<string, { until: number; result: LocationSearchResult }>;
  pending: Map<string, Promise<LocationSearchResult>>;
};
const states = new WeakMap<typeof fetch, ProviderState>();
function localResult(
  query: string,
  failure?: ProviderFailure,
): LocationSearchResult {
  const results = searchLocations(query);
  return {
    results,
    presentations: Object.fromEntries(
      results.map((r) => [
        r.id,
        {
          context: r.label.startsWith(r.city + ", ")
            ? r.label.slice(r.city.length + 2)
            : r.country,
          type: "City",
        },
      ]),
    ),
    worldwideAvailable: !failure,
    status: failure?.status || "ok",
    ...(failure ? { retryAfterSeconds: failure.seconds } : {}),
  };
}
export async function searchWorldwideLocations(
  query: string,
  fetcher: typeof fetch = fetch,
  scope: LocationSearchScope = "place",
): Promise<LocationSearchResult> {
  query = locationQuery(query);
  if (!canSearchLocation(query))
    return {
      results: [],
      presentations: {},
      worldwideAvailable: false,
      status: "ok",
    };
  let state = states.get(fetcher);
  if (!state) {
    state = { until: 0, cache: new Map(), pending: new Map() };
    states.set(fetcher, state);
  }
  const key = scope + ":" + query.toLocaleLowerCase();
  const saved = state.cache.get(key);
  if (saved && saved.until > Date.now()) return saved.result;
  if (state.until > Date.now())
    return localResult(
      query,
      new ProviderFailure(
        state.failure?.status || "unavailable",
        Math.max(1, Math.ceil((state.until - Date.now()) / 1000)),
      ),
    );
  const pending = state.pending.get(key);
  if (pending) return pending;
  if (state.pending.size >= 4)
    return localResult(query, new ProviderFailure("rate_limited", 2));
  const operation = performSearch(query, fetcher, scope, state)
    .then((result) => {
      if (result.worldwideAvailable) {
        if (state.cache.size >= 60)
          state.cache.delete(state.cache.keys().next().value!);
        state.cache.set(key, {
          result,
          until: Date.now() + (result.results.length ? 300000 : 30000),
        });
      }
      return result;
    })
    .finally(() => state.pending.delete(key));
  state.pending.set(key, operation);
  return operation;
}
async function performSearch(
  query: string,
  fetcher: typeof fetch,
  scope: LocationSearchScope,
  state: ProviderState,
): Promise<LocationSearchResult> {
  const deadline = Date.now() + 8000;
  async function request(term: string) {
    const url = new URL("https://photon.komoot.io/api/");
    url.searchParams.set("q", term);
    url.searchParams.set("limit", "30");
    url.searchParams.set("lang", "en");
    // Broad discovery: no layers, country restrictions or type filters upstream.
    const response = await fetcher(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(
        Math.max(1, Math.min(4000, deadline - Date.now())),
      ),
      next: { revalidate: 300 },
    });
    if (!response.ok) {
      const raw = response.headers.get("retry-after");
      const numeric = raw ? Number(raw) : NaN;
      const seconds = Number.isFinite(numeric)
        ? numeric
        : raw
          ? Math.ceil((Date.parse(raw) - Date.now()) / 1000)
          : response.status === 429
            ? 30
            : 5;
      const failure = new ProviderFailure(
        response.status === 429 ? "rate_limited" : "unavailable",
        Math.min(120, Math.max(1, Number.isFinite(seconds) ? seconds : 30)),
      );
      state.until = Date.now() + failure.seconds * 1000;
      state.failure = failure;
      throw failure;
    }
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
      }
    });
  }
  try {
    const remote = await request(query);
    const usable = (item: Candidate) =>
      scope !== "destination" || item.destinationRank < 9;
    const close = (item: Candidate) =>
      usable(item) && nameRank(item.location.city, query) <= 1;
    let partial: ProviderFailure | undefined;
    if (
      scope === "destination" &&
      !remote.some(close) &&
      Date.now() < deadline
    ) {
      const alternate = /^koh\s/iu.test(query)
        ? query.replace(/^koh(?=\s)/iu, "Ko")
        : query.includes(",")
          ? query.split(",")[0].trim()
          : null;
      if (alternate && alternate !== query && canSearchLocation(alternate))
        try {
          remote.push(...(await request(alternate)));
        } catch (e) {
          partial =
            e instanceof ProviderFailure
              ? e
              : new ProviderFailure("unavailable");
        }
    }
    // The local city dataset is a fallback, not five extra representations of
    // destinations Photon already resolved. It has no islands to substitute.
    const candidates: Candidate[] = [
      ...remote.filter(usable),
      ...(!remote.some(close)
        ? searchLocations(query).map((location, order) => ({
            location,
            geographic: true,
            order: remote.length + order,
            destinationRank: 0,
            context: location.label.slice(location.city.length + 2),
            countryCode: location.id.split(":")[1],
            kind: "City",
          }))
        : []),
    ];
    const queryContext = folded(query.split(",").slice(1).join(" "));
    candidates.sort(
      (a, b) =>
        nameRank(a.location.city, query) - nameRank(b.location.city, query) ||
        (scope === "destination" ? a.destinationRank - b.destinationRank : 0) ||
        Number(!!queryContext && !folded(a.context).includes(queryContext)) -
          Number(!!queryContext && !folded(b.context).includes(queryContext)) ||
        Number(!a.context) - Number(!b.context) ||
        Number(!a.object) - Number(!b.object) ||
        a.order - b.order,
    );
    const objects = new Set<string>(),
      identities = new Set<string>();
    const unique = candidates
      .filter((item) => {
        const r = item.location;
        // Never merge different OSM objects just for nearby centers or equal names.
        // Shared Wikidata explicitly identifies equivalence; anonymous features need
        // identical type/context/name/point. City/island/district remain separate.
        const identity = item.equivalent
          ? "wikidata:" + item.equivalent
          : !item.object
            ? `${folded(r.city)}:${item.kind || ""}:${folded(item.context)}:${r.latitude}:${r.longitude}`
            : undefined;
        if (
          (item.object && objects.has(item.object)) ||
          (identity && identities.has(identity))
        )
          return false;
        if (item.object) objects.add(item.object);
        if (identity) identities.add(identity);
        return true;
      })
      .slice(0, LOCATION_RESULT_LIMIT);
    const qualified = unique.filter(
      (item) =>
        item.extraContext &&
        unique.some(
          (other) =>
            other !== item &&
            other.location.label === item.location.label &&
            other.kind === item.kind &&
            other.extraContext &&
            folded(other.extraContext) !== folded(item.extraContext!),
        ),
    );
    for (const item of qualified) {
      if (item.extraContext) {
        item.context = [item.extraContext, item.countryName]
          .filter(Boolean)
          .join(", ")
          .slice(0, 200);
        item.location = geographicLocation(
          item.location.city,
          item.context,
          item.location.latitude,
          item.location.longitude,
          item.countryCode,
          item.location.providerId,
        );
      }
    }
    const pointIds = new Set<string>();
    const identified = unique.filter((item) => {
      if (pointIds.has(item.location.id)) {
        if (!item.kind) return false;
        // Anonymous provider features can share a point/name but describe
        // distinct types. Qualify our existing geographic ID with that real
        // type; never synthesize an OSM provider ID or move the point.
        const r = item.location;
        item.location = geographicLocation(
          r.city,
          [item.kind, item.context].filter(Boolean).join(" · ").slice(0, 200),
          r.latitude,
          r.longitude,
          item.countryCode,
          r.providerId,
        );
        if (pointIds.has(item.location.id)) return false;
      }
      pointIds.add(item.location.id);
      return true;
    });
    return {
      results: identified.map((item) => item.location),
      presentations: Object.fromEntries(
        identified.map((item) => [
          item.location.id,
          { context: item.context, ...(item.kind ? { type: item.kind } : {}) },
        ]),
      ),
      worldwideAvailable: !partial,
      status: partial?.status || "ok",
      ...(partial ? { retryAfterSeconds: partial.seconds } : {}),
    };
  } catch (e) {
    const failure =
      e instanceof ProviderFailure ? e : new ProviderFailure("unavailable");
    state.until = Math.max(state.until, Date.now() + failure.seconds * 1000);
    state.failure = failure;
    return localResult(query, failure);
  }
}
