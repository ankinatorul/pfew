import { z } from "zod";
export const categories = [
  "flight",
  "accommodation",
  "ground transport",
  "ferry",
  "car rental",
  "activity",
  "other",
] as const;
export const prepCategories = [
  "Documents",
  "Entry requirements",
  "Health and insurance",
  "Transportation",
  "Accommodation",
  "Payments",
  "Connectivity",
  "Other",
] as const;
const text = (n: number) => z.string().trim().max(n);
const money = z.preprocess(
  (v) => (v === "" || v === null ? null : v),
  z.coerce.number().finite().nonnegative().max(9999999999).nullable(),
);
const zone = z.string().refine((v) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: v });
    return true;
  } catch {
    return false;
  }
}, "Use a valid IANA time zone");
export const bookingSchema = z
  .object({
    trip_id: z.uuid(),
    location_id: z.string().max(150).nullable().optional(),
    location_label: z.string().max(500).nullable().optional(),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    end_location_id: z.string().max(150).nullable().optional(),
    end_location_label: z.string().max(500).nullable().optional(),
    end_latitude: z.number().min(-90).max(90).nullable().optional(),
    end_longitude: z.number().min(-180).max(180).nullable().optional(),
    segment_id: z.preprocess(
      (v) => (v === "" || v === undefined ? null : v),
      z.uuid().nullable(),
    ),
    title: text(200).min(1),
    category: z.enum(categories),
    provider: text(200),
    reference: text(200),
    start_date: z.iso.date(),
    end_date: z.iso.date(),
    local_time: z.union([z.literal(""), z.iso.time({ precision: -1 })]),
    timezone: zone,
    end_local_time: z
      .union([z.literal(""), z.iso.time({ precision: -1 })])
      .default(""),
    end_timezone: z.union([z.literal(""), zone]).default(""),
    origin: text(500),
    destination: text(500),
    travelers: text(500),
    notes: text(4000),
    price: money,
    paid_amount: money,
    currency: z.string().regex(/^[A-Z]{3}$/),
    payment_status: z.enum(["unknown", "unpaid", "partial", "paid"]),
    verification: z.enum(["unverified", "user confirmed"]),
  })
  .refine((v) => v.end_date >= v.start_date, {
    message: "End date must follow start date",
  })
  .refine(
    (v) =>
      v.price === null || v.paid_amount === null || v.paid_amount <= v.price,
    { message: "Paid amount cannot exceed price" },
  );
export const taskSchema = z.object({
  trip_id: z.uuid(),
  title: text(200).min(1),
  category: z.enum(prepCategories),
  due_date: z.preprocess((v) => (v === "" ? null : v), z.iso.date().nullable()),
  priority: z.enum(["low", "normal", "high"]),
});
export const packingListSchema = z.object({
  trip_id: z.uuid(),
  traveler: text(100).min(1),
});
export const packingItemSchema = z.object({
  trip_id: z.uuid(),
  list_id: z.uuid(),
  title: text(200).min(1),
  category: text(100).min(1),
  quantity: z.coerce.number().int().min(1).max(1000),
});
export const allocationSchema = z
  .object({
    trip_id: z.uuid(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    category: text(100).min(1),
    day: z.preprocess((v) => (v === "" ? null : v), z.iso.date().nullable()),
    destination_id: z.preprocess(
      (v) => (v === "" ? null : v),
      z.uuid().nullable(),
    ),
    planned: z.coerce.number().finite().min(0).max(9999999999),
    estimate_low: money,
    estimate_high: money,
    notes: text(1000),
  })
  .refine(
    (v) =>
      (v.estimate_low === null && v.estimate_high === null) ||
      (v.estimate_low !== null &&
        v.estimate_high !== null &&
        v.estimate_high >= v.estimate_low),
    { message: "Provide both ends of an estimated range, in order" },
  );
export const expenseSchema = z.object({
  trip_id: z.uuid(),
  amount: z.coerce.number().finite().positive().max(9999999999),
  currency: z.string().regex(/^[A-Z]{3}$/),
  category: text(100).min(1),
  day: z.iso.date(),
  payment_method: z.enum(["cash", "card", "other"]),
  notes: text(1000),
});
export type Booking = z.infer<typeof bookingSchema> & {
  id: string;
  import_method?: "manual" | "text" | "ai";
};
export type Task = z.infer<typeof taskSchema> & { id: string; done: boolean };
export type PackingList = z.infer<typeof packingListSchema> & { id: string };
export type PackingItem = z.infer<typeof packingItemSchema> & {
  id: string;
  packed: boolean;
};
export type Allocation = z.infer<typeof allocationSchema> & { id: string };
export type Expense = z.infer<typeof expenseSchema> & { id: string };
export function budgetSummary(
  currency: string,
  total: number | null,
  includePrepaid: boolean,
  allocations: Pick<Allocation, "planned" | "currency">[],
  bookings: Pick<Booking, "paid_amount" | "currency">[],
  expenses: Pick<Expense, "amount" | "currency">[],
) {
  const sum = (a: number[]) =>
    Math.round(a.reduce((s, v) => s + Math.round(Number(v) * 100), 0)) / 100;
  const planned = sum(
    allocations
      .filter((a) => a.currency === currency)
      .map((a) => Number(a.planned)),
  );
  const prepaid = sum(
    bookings
      .filter((b) => b.currency === currency && b.paid_amount !== null)
      .map((b) => Number(b.paid_amount)),
  );
  const actual = expenses.length
    ? Object.fromEntries(
        [...new Set(expenses.map((e) => e.currency))].map((c) => [
          c,
          sum(
            expenses
              .filter((e) => e.currency === c)
              .map((e) => Number(e.amount)),
          ),
        ]),
      )
    : null;
  const committed = planned + (includePrepaid ? prepaid : 0);
  return {
    planned,
    prepaid,
    actual,
    committed,
    unallocated:
      total === null ? null : Math.round((total - committed) * 100) / 100,
  };
}
export function localToday(zone: string, now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
