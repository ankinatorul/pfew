import type { Trip, Segment } from "../lib/domain";
import type { MapBooking, SavedPlace } from "../lib/trip-map";
import type { PlaceResult } from "../lib/discovery-types";
export const mapTrip: Trip = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Map trip",
  start_date: "2027-05-01",
  end_date: "2027-05-03",
  timezone: "Asia/Tokyo",
  travelers: 2,
  style: "Comfort",
  currency: "EUR",
  budget: null,
};
export const mapSegment = (
  id: string,
  extra: Partial<Segment> = {},
): Segment => ({
  id,
  trip_id: mapTrip.id,
  title: id,
  kind: "activity",
  start_date: "2027-05-01",
  end_date: "2027-05-01",
  local_time: "",
  timezone: "Asia/Tokyo",
  status: "planned",
  notes: "",
  address: "",
  provider: "",
  reference: "",
  origin: "",
  arrival_location: "",
  arrival_time: "",
  arrival_timezone: "",
  transport_mode: "",
  position: 0,
  destination_id: null,
  ...extra,
});
export const mapBooking = (
  id: string,
  extra: Partial<MapBooking> = {},
): MapBooking => ({
  id,
  title: id,
  category: "accommodation",
  start_date: "2027-05-01",
  end_date: "2027-05-03",
  verification: "unverified",
  location_id: "tokyo",
  location_label: "Tokyo, Japan",
  latitude: 35.68,
  longitude: 139.69,
  ...extra,
});
export const mapPlace = (
  id: string,
  extra: Partial<SavedPlace> = {},
): SavedPlace => ({
  id,
  title: id,
  notes: "My own notes",
  category: "food",
  source: "city",
  location_id: "tokyo",
  latitude: 35.68,
  longitude: 139.69,
  google_place_id: null,
  ...extra,
});
export const freshPlace: PlaceResult = {
  id: "ChIJ12345",
  name: "Provider fixture name",
  address: "Provider fixture address",
  latitude: 35.7,
  longitude: 139.7,
  mapsUrl: "https://maps.google.com/?q=fixture",
  attributions: [{ provider: "Fixture attribution" }],
  checkedAt: "2026-11-03T13:00:00.000Z",
};
