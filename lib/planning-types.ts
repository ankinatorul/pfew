import { z } from "zod";
export const quickAddSchema = z
  .object({
    trip_id: z.uuid(),
    id: z.uuid(),
    kind: z.enum(["activity", "note"]),
    title: z.string().trim().min(1, "Give this item a name.").max(200),
    mode: z.enum(["idea", "day"]),
    day: z.union([z.literal(""), z.iso.date()]),
    destination_id: z.union([z.literal(""), z.uuid()]),
    local_time: z.union([z.literal(""), z.iso.time({ precision: -1 })]),
    duration_minutes: z.preprocess(
      (v) => (v === "" || v === null ? null : v),
      z.coerce.number().int().min(1).max(1440).nullable(),
    ),
    address: z.string().trim().max(500),
    notes: z.string().trim().max(3000),
    maps_link: z.string().trim().max(1000),
    google_place_id: z.union([
      z.literal(""),
      z.string().regex(/^[A-Za-z0-9_-]{5,300}$/),
    ]),
  })
  .refine((value) => value.mode !== "day" || !!value.day, {
    message: "Choose a day for this plan.",
    path: ["day"],
  });
export const dayPlanSchema = z.object({
  trip_id: z.uuid(),
  id: z.uuid(),
  expected_updated_at: z.iso.datetime({ offset: true }),
  day: z.iso.date(),
  local_time: z.union([z.literal(""), z.iso.time({ precision: -1 })]),
  duration_minutes: z.preprocess(
    (v) => (v === "" || v === null ? null : v),
    z.coerce.number().int().min(1).max(1440).nullable(),
  ),
});
export type PlanningState = { error?: string; savedId?: string; view?: string };
