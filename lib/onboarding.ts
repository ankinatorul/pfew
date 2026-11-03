import { z } from "zod";
import { importFieldsSchema, importResultSchema } from "./booking-import-types";
export const interests = ["Food", "Culture", "Hidden gems", "Nature"] as const;
export const candidateSchema = z.object({
  id: z.uuid(),
  fields: importFieldsSchema,
  evidence: importResultSchema.shape.evidence.optional(),
  warnings: importResultSchema.shape.warnings.optional(),
  method: z.enum(["ai", "text", "manual"]),
  departureCity: z.string().max(150).default(""),
  arrivalCity: z.string().max(150).default(""),
  reviewed: z.boolean(),
  confirmed: z.boolean(),
  included: z.boolean(),
});
export type Candidate = z.infer<typeof candidateSchema>;
export const onboardingSchema = z
  .object({
    requestId: z.uuid(),
    name: z.string().trim().max(120),
    start: z.iso.date(),
    end: z.iso.date(),
    timezone: z.string().max(100),
    travelers: z.number().int().min(1).max(100),
    style: z.enum(["Budget", "Comfort", "Luxury"]),
    currency: z.string().regex(/^[A-Z]{3}$/),
    budget: z.number().finite().nonnegative().max(9999999999).nullable(),
    destinations: z
      .array(
        z.object({
          id: z.uuid(),
          locationId: z.string().min(1).max(150),
          label: z.string().max(200),
          start: z.iso.date(),
          end: z.iso.date(),
        }),
      )
      .max(32),
    bookings: z.array(candidateSchema).max(20),
    interests: z.array(z.enum(interests)).max(4),
  })
  .refine((v) => v.end >= v.start, {
    message: "Return must be on or after departure.",
  });
export type OnboardingInput = z.infer<typeof onboardingSchema>;
export function candidateComplete(candidate: Candidate) {
  const f = candidate.fields;
  return !!(
    f.title &&
    f.category &&
    f.start_date &&
    f.end_date &&
    f.currency &&
    f.end_date >= f.start_date &&
    (!f.local_time || candidate.departureCity) &&
    (!f.end_local_time ||
      candidate.arrivalCity ||
      (f.category === "accommodation" && candidate.departureCity))
  );
}
export function emptyCandidate(): Candidate {
  return {
    id: crypto.randomUUID(),
    fields: {
      title: null,
      category: null,
      provider: null,
      reference: null,
      start_date: null,
      end_date: null,
      local_time: null,
      end_local_time: null,
      origin: null,
      destination: null,
      price: null,
      paid_amount: null,
      currency: null,
    },
    method: "manual",
    departureCity: "",
    arrivalCity: "",
    reviewed: false,
    confirmed: false,
    included: true,
  };
}
