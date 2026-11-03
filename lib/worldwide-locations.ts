import { z } from "zod";
import { geographicLocation } from "./geographic-location";
import { searchLocations } from "./locations";
import type { ResolvedLocation } from "./location-types";
const featureSchema = z.object({
  geometry: z.object({
    type: z.literal("Point"),
    coordinates: z.tuple([
      z.number().min(-180).max(180),
      z.number().min(-90).max(90),
    ]),
  }),
  properties: z.object({
    name: z.string().min(1).max(200),
    country: z.string().max(200).optional(),
    countrycode: z
      .string()
      .regex(/^[a-zA-Z]{2}$/)
      .optional(),
    state: z.string().max(200).optional(),
    city: z.string().max(200).optional(),
  }),
});
export async function searchWorldwideLocations(
  query: string,
  fetcher: typeof fetch = fetch,
) {
  const local = searchLocations(query);
  if (query.trim().length < 2 || query.length > 100)
    return { results: [], worldwideAvailable: false };
  try {
    // Photon indexes OpenStreetMap places without restricting results to cities.
    // Only the typed place query is sent, never trip or booking details.
    const url = new URL("https://photon.komoot.io/api/");
    url.searchParams.set("q", query.trim());
    url.searchParams.set("limit", "8");
    url.searchParams.set("lang", "en");
    const response = await fetcher(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(4000),
      next: { revalidate: 86400 },
    });
    if (!response.ok) throw new Error("Place search unavailable");
    const data = z
      .object({ features: z.array(z.unknown()).max(100) })
      .parse(await response.json());
    const remote: ResolvedLocation[] = [];
    for (const entry of data.features) {
      const parsed = featureSchema.safeParse(entry);
      if (!parsed.success) continue;
      const { properties: p, geometry: g } = parsed.data;
      const country = [p.state, p.country]
        .filter((v, i, values) => v && v !== p.name && values.indexOf(v) === i)
        .join(", ");
      // Bound the display label; stored trip names have a separate 200-char limit.
      remote.push(
        geographicLocation(
          p.name,
          country.slice(0, 200),
          g.coordinates[1],
          g.coordinates[0],
          p.countrycode?.toUpperCase(),
        ),
      );
    }
    const seen = new Set<string>();
    const results = [...remote, ...local]
      .filter((r) => {
        const key = `${r.city.toLowerCase()}:${r.latitude.toFixed(2)}:${r.longitude.toFixed(2)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 8);
    return { results, worldwideAvailable: true };
  } catch {
    return { results: local, worldwideAvailable: false };
  }
}
