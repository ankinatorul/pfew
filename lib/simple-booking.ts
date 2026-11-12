import type { CollectionEntry } from "./booking-collection";

export const simpleBookingTypes = [
  "Stay",
  "Transport",
  "Experience",
  "Other",
] as const;
export type SimpleBookingType = (typeof simpleBookingTypes)[number];
export function simpleBookingType(category: unknown): SimpleBookingType {
  return category === "accommodation"
    ? "Stay"
    : ["flight", "ground transport", "ferry", "car rental"].includes(
          String(category),
        )
      ? "Transport"
      : category === "activity"
        ? "Experience"
        : "Other";
}
export function simplifiedBookingFields(
  entry: CollectionEntry,
  values: Record<string, FormDataEntryValue>,
) {
  const fields: CollectionEntry["fields"] = {
    provider: "",
    notes: "",
    travelers: "",
    ...entry.fields,
  };
  // Overlay only fields actually rendered. Legacy/provider/association/amount
  // metadata remains untouched; UI types never rewrite a historical subtype.
  for (const [key, value] of Object.entries(values)) {
    if (
      key !== "booking_type" &&
      typeof value === "string" &&
      (fields[key] === undefined || String(fields[key] ?? "") !== value)
    )
      fields[key] = value;
  }
  const type = String(values.booking_type);
  if (
    type !== simpleBookingType(entry.fields.category) ||
    !entry.fields.category
  ) {
    fields.category =
      (
        {
          Stay: "accommodation",
          Transport: "ground transport",
          Experience: "activity",
          Other: "other",
        } as Record<string, string>
      )[type] || "other";
  }
  // A single-day event's explicitly supplied date is its entire date range.
  // Never infer a stay's checkout or any date from the trip itself.
  if (type !== "Stay" && !fields.end_date && fields.start_date)
    fields.end_date = fields.start_date;
  return fields;
}
export function bookingSummary(entry: CollectionEntry) {
  const f = entry.fields;
  const date = [
    f.start_date,
    f.end_date && f.end_date !== f.start_date ? f.end_date : null,
  ]
    .filter(Boolean)
    .join(" – ");
  const cost =
    f.price !== "" && f.price != null && Number.isFinite(Number(f.price))
      ? `${f.currency || ""} ${f.price}`.trim()
      : "";
  const payment =
    f.payment_status === "paid"
      ? "Paid"
      : f.payment_status === "unpaid"
        ? "Pay later"
        : f.payment_status === "partial"
          ? "Partially paid"
          : "";
  return { detail: [date, cost].filter(Boolean).join(" · "), payment };
}
