import tzLookup from "tz-lookup";
export function coordinateTimezone(latitude: number, longitude: number) {
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  )
    throw new Error("Invalid location coordinates");
  return tzLookup(latitude, longitude);
}
