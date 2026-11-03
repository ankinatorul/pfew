import { z } from "zod";
import { categories, type Booking } from "./essentials";
const text = (max: number) => z.string().trim().min(1).max(max).nullable();
export const importFieldsSchema = z.object({
  title: text(200),
  category: z.enum(categories).nullable(),
  provider: text(200),
  reference: text(200),
  start_date: z.iso.date().nullable(),
  end_date: z.iso.date().nullable(),
  local_time: z.iso.time({ precision: -1 }).nullable(),
  end_local_time: z.iso.time({ precision: -1 }).nullable(),
  origin: text(500),
  destination: text(500),
  price: z.number().finite().min(0).max(9999999999).nullable(),
  paid_amount: z.number().finite().min(0).max(9999999999).nullable(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .nullable(),
});
export const importFieldNames = importFieldsSchema.keyof().options;
export type ImportField = (typeof importFieldNames)[number];
export const importResultSchema = z.object({
  fields: importFieldsSchema,
  evidence: z.partialRecord(
    importFieldsSchema.keyof(),
    z.string().min(1).max(500),
  ),
  warnings: z.array(z.string().max(300)).max(20),
  method: z.enum(["text", "ai"]),
  importKey: z.uuid(),
});
export type ImportResult = z.infer<typeof importResultSchema>;
export const importLabels: Record<ImportField, string> = {
  title: "Booking name",
  category: "Category",
  provider: "Provider",
  reference: "Booking reference",
  start_date: "Start date",
  end_date: "End date",
  local_time: "Start local time",
  end_local_time: "End local time",
  origin: "Departure / address",
  destination: "Arrival location",
  price: "Total price",
  paid_amount: "Amount paid",
  currency: "Currency",
};
export function bookingDraft(result: ImportResult): Partial<Booking> {
  return {
    ...Object.fromEntries(
      Object.entries(result.fields).map(([key, value]) => [
        key,
        value ?? (["price", "paid_amount"].includes(key) ? null : ""),
      ]),
    ),
    category: result.fields.category || "other",
    segment_id: null,
    travelers: "",
    notes: "",
    payment_status: "unknown",
    verification: "user confirmed",
  };
}
