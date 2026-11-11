import { z } from "zod";
import type { CollectionEntry } from "./booking-collection";
export const reviewInputSchema = z.object({
  id: z.uuid(),
  revision: z.number().int().nonnegative(),
  style: z.enum(["Budget", "Balanced", "Premium"]),
  bookings: z
    .array(z.object({ id: z.uuid(), revision: z.number().int().nonnegative() }))
    .max(20),
});
export type ReviewInput = z.infer<typeof reviewInputSchema>;
export function bookingReviewStamp(entries: CollectionEntry[]) {
  return entries
    .map(({ id, revision }) => ({ id, revision }))
    .sort((a, b) => a.id.localeCompare(b.id));
}
export type ReviewResult =
  | { error: string }
  | {
      id: string;
      revision: number;
      style: "Budget" | "Balanced" | "Premium";
      theme: string;
      finalized: boolean;
    };
