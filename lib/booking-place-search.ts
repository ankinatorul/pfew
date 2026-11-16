import type { Trip, Segment } from "./domain";
export type BookingPlaceKind = "Stay" | "Experience";
export type SearchCenter = { latitude: number; longitude: number };
export type BookingPlaceOptions = {
  kind: BookingPlaceKind;
  centers: SearchCenter[];
};
const lodging: Record<string, string> = {
  hotel: "Hotel",
  motel: "Motel",
  hostel: "Hostel",
  guest_house: "Guest house",
  apartment: "Apartment",
  chalet: "Chalet",
  resort: "Resort",
  camp_site: "Campsite",
  caravan_site: "Campsite",
  alpine_hut: "Mountain hut",
  wilderness_hut: "Mountain hut",
};
const experiences: Record<string, string> = {
  attraction: "Attraction",
  museum: "Museum",
  gallery: "Gallery",
  artwork: "Artwork",
  theme_park: "Theme park",
  zoo: "Zoo",
  aquarium: "Aquarium",
  viewpoint: "Viewpoint",
  restaurant: "Restaurant",
  cafe: "Café",
  bar: "Bar",
  pub: "Pub",
  food_court: "Food court",
  cinema: "Cinema",
  theatre: "Theatre",
  arts_centre: "Arts centre",
  park: "Park",
  nature_reserve: "Nature reserve",
  stadium: "Stadium",
  sports_centre: "Sports centre",
  water_park: "Water park",
};
export function bookingPoiType(
  key: string | null | undefined,
  value: string | null | undefined,
  kind: BookingPlaceKind,
) {
  if (!key || !value) return undefined;
  if (kind === "Stay")
    return key === "tourism" || key === "leisure" ? lodging[value] : undefined;
  if (["tourism", "amenity", "leisure"].includes(key))
    return experiences[value];
  if (key === "historic") return "Historic place";
  if (key === "office" && value === "travel_agent") return "Travel agency";
  return undefined;
}
/** Saved points only; no city centroids or guessed coordinates. */
export function bookingSearchCenters(
  trip: Trip,
  segments: Segment[] = [],
): SearchCenter[] {
  const destinations = Array.isArray(trip.draft_data?.destinations)
    ? trip.draft_data.destinations
    : [];
  const seen = new Set<string>();
  return [...destinations, ...segments.filter((s) => s.kind === "destination")]
    .flatMap((value) => {
      if (!value || typeof value !== "object") return [];
      const { latitude, longitude } = value as Partial<SearchCenter>;
      if (
        typeof latitude !== "number" ||
        typeof longitude !== "number" ||
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        Math.abs(latitude) > 90 ||
        Math.abs(longitude) > 180
      )
        return [];
      const key = `${latitude}:${longitude}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [{ latitude, longitude }];
    })
    .slice(0, 3);
}
export function proximity(point: SearchCenter, centers: SearchCenter[]) {
  if (!centers.length) return 0;
  const rad = (n: number) => (n * Math.PI) / 180;
  return Math.min(
    ...centers.map((center) => {
      const a =
        Math.sin(rad(point.latitude - center.latitude) / 2) ** 2 +
        Math.cos(rad(point.latitude)) *
          Math.cos(rad(center.latitude)) *
          Math.sin(rad(point.longitude - center.longitude) / 2) ** 2;
      return 2 * Math.asin(Math.sqrt(Math.min(1, a)));
    }),
  );
}
export function bookingDateError(start: unknown, end: unknown, type?: string) {
  return start && end && String(end) < String(start)
    ? type === "Stay" || type === "accommodation"
      ? "Check-out must be on or after check-in."
      : "End date must be on or after the start date."
    : "";
}
