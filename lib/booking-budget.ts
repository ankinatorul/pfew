import { z } from "zod";
import type { Booking, Expense, Allocation } from "./essentials";
import type { Trip } from "./domain";
export type ManagedBooking = Booking & {
  finance_revision?: number;
  updated_at?: string;
};
export type ManagedExpense = Expense & {
  title?: string | null;
  booking_id?: string | null;
  finance_revision?: number;
};
export type PrivateConfirmation = {
  id: string;
  booking_id: string | null;
  filename: string;
  size: number;
  state: "ready" | "pending";
  intake_id?: string | null;
};
export type MoneyResult = { error?: string; message?: string; id?: string };
export const expenseCategories = [
  "Accommodation",
  "Transportation",
  "Food & Drink",
  "Activities",
  "Shopping",
  "Other",
] as const;
export const bookingLabels: Record<string, string> = {
  flight: "Flights",
  accommodation: "Accommodation",
  "ground transport": "Ground transportation",
  ferry: "Ferries",
  "car rental": "Car rentals",
  activity: "Activities & tours",
  other: "Other",
};
export const namedExpenseSchema = z.object({
  id: z.uuid(),
  revision: z.number().int().nonnegative(),
  title: z.string().trim().min(1, "Give your expense a name.").max(200),
  amount: z
    .string()
    .regex(
      /^\d{1,10}(?:\.\d{1,2})?$/,
      "Enter a positive amount with up to two decimal places.",
    )
    .refine(
      (v) => Number(v) > 0 && Number(v) <= 9999999999,
      "Enter a positive amount up to 9,999,999,999.",
    ),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/, "Use a three-letter uppercase currency code."),
  category: z.string().trim().min(1).max(100),
  day: z.iso.date(),
  notes: z.string().max(1000),
  payment_method: z.enum(["cash", "card", "other"]),
  booking_id: z.union([z.literal(""), z.uuid()]),
});
export type ExpenseInput = z.infer<typeof namedExpenseSchema>;
// Existing monetary columns use numeric(12,2). Work in integer cents and never FX.
export function cents(value: number | string) {
  const raw = String(value);
  if (!/^-?\d+(\.\d{1,2})?$/.test(raw))
    throw new Error("Unsupported saved monetary amount.");
  const [whole, fraction = ""] = raw.replace("-", "").split(".");
  return (
    (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"))) *
    (raw.startsWith("-") ? -1n : 1n)
  );
}
const amount = (n: bigint) => Number(n) / 100;
export function currencyTotals<T extends { currency: string }>(
  rows: T[],
  value: (row: T) => number | string | null,
) {
  const result = new Map<string, bigint>();
  for (const row of rows) {
    const v = value(row);
    if (v !== null)
      result.set(row.currency, (result.get(row.currency) || 0n) + cents(v));
  }
  return [...result]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, value]) => ({ currency, amount: amount(value) }));
}
function subtractTarget(target: number, recorded: number) {
  const raw = String(target),
    [whole, fraction = ""] = raw.split(".");
  if (!/^\d+(?:\.\d+)?$/.test(raw)) return target - recorded;
  const precision = Math.max(2, fraction.length),
    factor = 10n ** BigInt(precision);
  const units =
    BigInt(whole) * factor + BigInt(fraction.padEnd(precision, "0"));
  return (
    Number(units - cents(recorded) * 10n ** BigInt(precision - 2)) /
    Number(factor)
  );
}
export function tripMoney(
  trip: Trip,
  bookings: Booking[],
  expenses: ManagedExpense[],
  allocations: Allocation[],
) {
  const actual = currencyTotals(expenses, (e) => e.amount),
    recorded = actual.find((v) => v.currency === trip.currency)?.amount || 0;
  const planned = currencyTotals(allocations, (a) => a.planned);
  const categoryMap = new Map<string, bigint>();
  for (const expense of expenses.filter((e) => e.currency === trip.currency))
    categoryMap.set(
      expense.category,
      (categoryMap.get(expense.category) || 0n) + cents(expense.amount),
    );
  return {
    actual,
    recorded,
    remaining:
      trip.budget === null ? null : subtractTarget(trip.budget, recorded),
    planned,
    categoryTotals: [...categoryMap]
      .map(([category, value]) => ({ category, amount: amount(value) }))
      .sort(
        (a, b) => b.amount - a.amount || a.category.localeCompare(b.category),
      ),
    bookingPrices: currencyTotals(
      bookings.filter((b) => b.reservation_status !== "cancelled"),
      (b) => b.price,
    ),
    bookingPaid: currencyTotals(bookings, (b) => b.paid_amount),
    missingPrices: bookings.filter((b) => b.price === null).length,
    unlinkedExpenses: expenses.filter((e) => !e.booking_id).length,
  };
}
export function displayMoney(currency: string, value: number | string) {
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency,
      currencyDisplay: "code",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(value));
  } catch {
    return currency + " " + Number(value).toFixed(2);
  }
}
export function expenseName(expense: ManagedExpense) {
  return expense.title || "Legacy expense · " + expense.category;
}

export function bookingPriceLabel(b: Booking) {
  if (b.price === null) return "Price not supplied";
  if (b.verification !== "user confirmed")
    return "Unreviewed price · check the original";
  return b.reservation_status === "confirmed"
    ? "Reviewed price · confirmed reservation"
    : "Reviewed price · reservation " + (b.reservation_status || "unknown");
}
