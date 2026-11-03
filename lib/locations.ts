import { cityMapping } from "city-timezones";
import tzLookup from "tz-lookup";
import { resolveGeographicLocation } from "./geographic-location";
import type { ResolvedLocation } from "./location-types";
function normalized(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
const records = cityMapping.map((city) => ({
  city,
  id: `city:${city.iso2}:${city.lat.toFixed(6)}:${city.lng.toFixed(6)}`,
  text: normalized(
    [
      city.city,
      city.city_ascii,
      city.province,
      city.country,
      city.iso2,
      city.iso3,
      city.state_ansi,
    ].join(" "),
  ),
}));
const byId = new Map(records.map((r) => [r.id, r.city]));
export function resolveLocation(id: string): ResolvedLocation | null {
  if (id.startsWith("geo:")) return resolveGeographicLocation(id);
  const c = byId.get(id);
  if (!c) return null;
  let timezone = c.timezone;
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
  } catch {
    timezone = tzLookup(c.lat, c.lng);
  }
  return {
    id,
    label: [c.city, c.province !== c.city ? c.province : null, c.country]
      .filter(Boolean)
      .join(", "),
    city: c.city,
    country: c.country,
    latitude: c.lat,
    longitude: c.lng,
    timezone,
    source: "city-timezones",
  };
}
export function searchLocations(query: string) {
  const q = normalized(query);
  if (q.length < 2 || q.length > 100) return [];
  const tokens = q.split(" ");
  return records
    .filter((r) => tokens.every((t) => r.text.includes(t)))
    .sort((a, b) => {
      const rank = (r: typeof a) =>
        normalized(r.city.city) === q
          ? 0
          : normalized(r.city.city).startsWith(q)
            ? 1
            : 2;
      return rank(a) - rank(b) || (b.city.pop || 0) - (a.city.pop || 0);
    })
    .slice(0, 8)
    .map((r) => resolveLocation(r.id)!);
}
export { coordinateTimezone } from "./coordinate-timezone";
