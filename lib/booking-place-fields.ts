import type { CollectionEntry } from "./booking-collection";
/** Presentation only: decode a stored Pfew geographic label without geocoding. */
export function bookingPlaceFields(fields: CollectionEntry["fields"]) {
  const text = (key: string) => String(fields[key] ?? "");
  let place = text("location_label");
  if (text("location_id").startsWith("geo:")) {
    try {
      const encoded = text("location_id")
        .split(":")[2]
        .replace(/-/g, "+")
        .replace(/_/g, "/");
      const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
      const point = JSON.parse(new TextDecoder().decode(bytes));
      if (
        Array.isArray(point) &&
        typeof point[0] === "string" &&
        point[0].trim()
      )
        place = point[0];
    } catch {
      /* Keep the original saved label for legacy identifiers. */
    }
  }
  const title = text("title") || text("provider"),
    label = text("location_label");
  if (!place) place = title || text("destination");
  const customTitle =
    !!title &&
    (label
      ? title !== place && title !== label
      : !!text("destination") && title !== text("destination"));
  return {
    place,
    title,
    customTitle,
    address: text("destination"),
    linked:
      !!text("location_id") ||
      (typeof fields.latitude === "number" &&
        Number.isFinite(fields.latitude)) ||
      (typeof fields.longitude === "number" &&
        Number.isFinite(fields.longitude)),
  };
}
