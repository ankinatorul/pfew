import { z } from "zod";
import { bookingSchema } from "./essentials";
import { importFieldNames, type ImportResult } from "./booking-import-types";

export const reservationStatuses = [
  "unknown",
  "confirmed",
  "pending",
  "cancelled",
] as const;
export const collectionFieldsSchema = z.record(
  z.string().max(100),
  z.union([z.string().max(4000), z.number().finite(), z.null()]),
);
export const collectionEntrySchema = z.object({
  id: z.uuid(),
  revision: z.number().int().nonnegative(),
  updated_at: z.string(),
  fields: collectionFieldsSchema,
  review_status: z.enum(["needs_review", "reviewed"]),
  reservation_status: z.enum(reservationStatuses),
  method: z.enum(["manual", "text", "ai"]),
  extraction: z.object({
    status: z.enum(["not_requested", "complete", "failed"]),
    warnings: z.array(z.string().max(500)).max(25),
    evidence: z.record(z.string(), z.string().max(500)),
  }),
  source: z
    .object({
      attachment_id: z.uuid(),
      filename: z.string().max(200),
      content_type: z.string(),
      size: z.number().int().positive(),
      checksum: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .nullable(),
  removing: z.boolean().optional(),
});
export type CollectionEntry = z.infer<typeof collectionEntrySchema>;
export type CollectionAttachment = {
  id: string;
  intake_id: string | null;
  filename: string;
  state: "pending" | "ready";
  size: number;
};
export const COLLECTION_LIMIT = 20;
export function emptyCollectionEntry(id: string): CollectionEntry {
  return {
    id,
    revision: 0,
    updated_at: new Date().toISOString(),
    fields: Object.fromEntries(importFieldNames.map((key) => [key, ""])),
    review_status: "needs_review",
    reservation_status: "unknown",
    method: "manual",
    extraction: { status: "not_requested", warnings: [], evidence: {} },
    source: null,
  };
}
export function collectionEntries(preferences: unknown) {
  const parsed = z
    .object({
      pending_bookings: collectionEntrySchema
        .array()
        .max(COLLECTION_LIMIT)
        .optional(),
    })
    .safeParse(preferences || {});
  if (!parsed.success)
    throw new Error(
      "Saved booking drafts need a format review. Nothing has been overwritten.",
    );
  return parsed.data.pending_bookings || [];
}
export function mergeExtraction(
  entry: CollectionEntry,
  result: Omit<ImportResult, "importKey">,
): CollectionEntry {
  const fields = { ...entry.fields };
  const warnings = [...result.warnings];
  for (const key of importFieldNames) {
    const next = result.fields[key];
    if (next === null) continue;
    if (fields[key] === null || fields[key] === undefined || fields[key] === "")
      fields[key] = next;
    else if (String(fields[key]) !== String(next))
      warnings.push(
        `Your existing ${key.replaceAll("_", " ")} was kept. Check it against the source.`,
      );
  }
  return {
    ...entry,
    fields,
    method: result.method,
    review_status: "needs_review",
    extraction: {
      status: "complete",
      warnings: warnings.slice(0, 25),
      evidence: result.evidence,
    },
  };
}
export function reviewedBookingFields(
  fields: CollectionEntry["fields"],
  tripId: string,
) {
  return bookingSchema.safeParse({
    ...fields,
    trip_id: tripId,
    segment_id: fields.segment_id || null,
    payment_status: fields.payment_status || "unknown",
    verification: "user confirmed",
    price: fields.price === "" || fields.price == null ? null : fields.price,
    paid_amount:
      fields.paid_amount === "" || fields.paid_amount == null
        ? null
        : fields.paid_amount,
  });
}
export function collectionCounts(entries: CollectionEntry[]) {
  return {
    total: entries.length,
    reviewed: entries.filter((e) => e.review_status === "reviewed").length,
    unfinished: entries.filter((e) => e.review_status !== "reviewed").length,
  };
}
