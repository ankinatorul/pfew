import { z } from "zod";
export const bookingCurrencies = ["EUR", "USD", "RON"] as const;
export function bookingCurrency(saved: unknown, trip: string) {
  return saved
    ? String(saved)
    : bookingCurrencies.includes(trip as (typeof bookingCurrencies)[number])
      ? trip
      : "EUR";
}
export function paymentError(fields: Record<string, unknown>) {
  if (
    fields.payment_due_date &&
    !z.iso.date().safeParse(fields.payment_due_date).success
  )
    return "Choose a valid payment due date.";
  if (fields.payment_status !== "unpaid") return "";
  if (
    fields.payment_arrangement === "due_date" &&
    !z.iso.date().safeParse(fields.payment_due_date).success
  )
    return "Choose a valid payment due date.";
  if (
    fields.payment_arrangement &&
    !["property", "due_date", "unspecified"].includes(
      String(fields.payment_arrangement),
    )
  )
    return "Choose how you’ll pay later.";
  return "";
}
export function paymentLabel(fields: Record<string, unknown>) {
  if (fields.payment_status === "paid") return "Paid";
  if (fields.payment_status === "partial") return "Partially paid";
  if (fields.payment_status !== "unpaid") return "Not set";
  if (fields.payment_arrangement === "property") return "Pay at the property";
  if (fields.payment_due_date) return "Payment due " + fields.payment_due_date;
  return "Pay later";
}
