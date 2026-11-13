// Shared browser/server search bounds; no provider credentials or persisted data.
export const LOCATION_SEARCH_VERSION = "curated-v2";
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

// Presentation curation does not merge identities: Show more retains every ID.
export function initialLocationSuggestions<
  T extends { id: string; city: string; label: string; country: string },
>(results: T[], details: Record<string, { context: string; type?: string }>) {
  const groups = new Set<string>();
  return results
    .filter((result) => {
      const normalize = (value: string) =>
        value
          .normalize("NFKD")
          .replace(/\p{M}/gu, "")
          .toLowerCase()
          .replace(/^koh\s/, "ko ")
          .replace(/[^\p{L}\p{N}]+/gu, "");
      const key =
        normalize(result.city) +
        ":" +
        normalize(details[result.id]?.context || result.label) +
        ":" +
        (details[result.id]?.type || "");
      if (groups.has(key)) return false;
      groups.add(key);
      return true;
    })
    .slice(0, 5);
}
