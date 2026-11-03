export type MapsLink = {
  url: string;
  placeId: string | null;
  query: string | null;
  short: boolean;
};
const googleHosts = new Set([
  "google.com",
  "www.google.com",
  "maps.google.com",
]);
export function parseMapsLink(input: string): MapsLink | null {
  if (input.length > 1000) return null;
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port)
    return null;
  const short = url.hostname === "maps.app.goo.gl" || url.hostname === "goo.gl";
  if (short) {
    if (
      url.hostname === "goo.gl"
        ? !/^\/maps\/[a-zA-Z0-9_-]{4,}\/?$/.test(url.pathname)
        : !/^\/[a-zA-Z0-9_-]{4,}\/?$/.test(url.pathname)
    )
      return null;
    url.search = "";
    url.hash = "";
    return { url: url.href, placeId: null, query: null, short: true };
  }
  if (
    !googleHosts.has(url.hostname) ||
    (url.hostname !== "maps.google.com" &&
      !/^\/maps(?:\/|$)/.test(url.pathname))
  )
    return null;
  const rawId =
    url.searchParams.get("query_place_id") || url.searchParams.get("place_id");
  const placeId = rawId && /^[a-zA-Z0-9_-]{5,300}$/.test(rawId) ? rawId : null;
  const rawQuery = url.searchParams.get("query") || url.searchParams.get("q");
  const query =
    rawQuery && rawQuery.length <= 200 && !/^place_id:/i.test(rawQuery)
      ? rawQuery
      : null;
  const allowed = new Set([
    "api",
    "query",
    "query_place_id",
    "q",
    "place_id",
    "cid",
    "ll",
    "z",
    "origin",
    "destination",
    "travelmode",
    "dir_action",
    "data",
  ]);
  for (const key of [...url.searchParams.keys()])
    if (!allowed.has(key)) url.searchParams.delete(key);
  url.hash = "";
  return { url: url.href, placeId, query, short: false };
}
export function mapsLinkForPlace(placeId: string, label: string) {
  return (
    "https://www.google.com/maps/search/?" +
    new URLSearchParams({ api: "1", query: label, query_place_id: placeId })
  );
}
export function inspectQuickInput(input: string) {
  const value = input.trim();
  if (!value || value.length > 1000)
    throw new Error(
      "Enter a name, address, note or Google Maps link up to 1,000 characters.",
    );
  const maps = parseMapsLink(value);
  if (maps) return { maps, title: maps.query || "", notes: "", address: "" };
  if (/^https?:\/\//i.test(value))
    throw new Error(
      "Use a supported HTTPS Google Maps link, or enter your own place name or note.",
    );
  const [first, ...rest] = value.split(/\r?\n/);
  return {
    maps: null,
    title: first.length <= 200 ? first : "",
    notes: rest.join("\n"),
    address: "",
  };
}
