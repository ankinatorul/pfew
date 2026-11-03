import { z } from "zod";
export const researchContextSchema = z
  .object({
    nationality: z.string().trim().min(2).max(80),
    document: z.enum([
      "ordinary passport",
      "identity card",
      "other travel document",
    ]),
    purpose: z.enum(["tourism", "business", "transit", "other"]),
    travel_start: z.iso.date(),
    travel_end: z.iso.date(),
  })
  .refine(
    (value) => value.travel_end >= value.travel_start,
    "Return date must follow departure",
  );
export type ResearchContext = z.infer<typeof researchContextSchema>;
export type ResearchNote = {
  id: string;
  trip_id: string;
  destination_id: string | null;
  destination_label: string;
  source_id: string;
  source_name: string;
  source_url: string;
  retrieved_at: string;
  reviewed_at: string;
  source_excerpt: string;
  title: string;
  note: string;
  context: ResearchContext;
  created_at: string;
};
export function researchStaleness(
  record: Pick<ResearchNote, "retrieved_at" | "context">,
  trip: { start_date: string; end_date: string },
  now = new Date(),
) {
  if (
    record.context.travel_start < trip.start_date ||
    record.context.travel_end > trip.end_date
  )
    return "The researched travel period falls outside this trip. Confirm the dates and check the source again.";
  const age = now.getTime() - Date.parse(record.retrieved_at);
  return !Number.isFinite(age) || age > 30 * 86400000
    ? "This source was retrieved more than 30 days ago. Check it again before relying on it."
    : null;
}
