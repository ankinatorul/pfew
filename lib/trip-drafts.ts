import { z } from "zod";
import { resolvedLocationSchema } from "./location-types";

const requiredDate = (message: string) => z.iso.date({ error: message });
export const tripBasicsSchema = z
  .object({
    name: z.string().trim().min(1, "Give your trip a name.").max(120),
    destinations: resolvedLocationSchema
      .array()
      .min(1, "Choose at least one destination.")
      .max(32),
    start_date: requiredDate("Choose a valid departure date."),
    end_date: requiredDate("Choose a valid return date."),
  })
  .refine((value) => value.end_date >= value.start_date, {
    path: ["end_date"],
    message: "Return date must be on or after departure.",
  });
export type TripBasics = z.infer<typeof tripBasicsSchema>;
export const privateDraftSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  start_date: z.string().nullable(),
  end_date: z.string().nullable(),
  draft_data: z
    .object({ destinations: resolvedLocationSchema.array() })
    .passthrough(),
  draft_step: z.number().int().min(1).max(3),
  draft_revision: z.number().int().nonnegative(),
  updated_at: z.string(),
});
export type PrivateDraft = z.infer<typeof privateDraftSchema>;
export type DraftSaveResult = { error: string } | { draft: PrivateDraft };
export function draftBasics(draft: PrivateDraft): TripBasics {
  return {
    name: draft.name,
    destinations: draft.draft_data.destinations,
    start_date: draft.start_date || "",
    end_date: draft.end_date || "",
  };
}

// Only a genuinely older schema can use the legacy read. Network/RLS errors
// must never silently fall back to a broader query.
export function missingDraftSchema(
  error: { code?: string; message?: string } | null,
) {
  return Boolean(
    error &&
    ["42703", "PGRST204"].includes(error.code || "") &&
    /creation_state/.test(error.message || ""),
  );
}
