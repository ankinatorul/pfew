// Shared browser/server search bounds; no provider credentials or persisted data.
export const LOCATION_QUERY_LIMIT = 100;
export const LOCATION_RESULT_LIMIT = 12;
export type LocationSearchScope = "destination" | "place";
export const locationQuery = (value: string) =>
  value.normalize("NFC").trim().replace(/\s+/g, " ");
export function canSearchLocation(value: string) {
  const query = locationQuery(value);
  return (
    query.length <= LOCATION_QUERY_LIMIT &&
    (Array.from(query).length >= 2 ||
      (/^\p{L}$/u.test(query) && query.codePointAt(0)! > 127))
  );
}
