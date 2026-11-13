"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { access } from "../lib/access";
import { bookingLocationValues } from "../lib/automatic-zones";
import { bookingSchema } from "../lib/essentials";
import {
  namedExpenseSchema,
  type ExpenseInput,
  type MoneyResult,
} from "../lib/booking-budget";
import { prepareBookingRemoval } from "../lib/booking-removal";
const identity = z.object({
  trip_id: z.uuid(),
  id: z.uuid(),
  revision: z.coerce.number().int().nonnegative(),
});
function failure(error: { code?: string; message?: string }) {
  if (["PGRST202", "42703", "PGRST204"].includes(error.code || ""))
    return "These controls need the reviewed Phase 9 database update (015). Your input is preserved.";
  if (/changed|permission|same trip|unavailable/i.test(error.message || ""))
    return error.message!;
  return "Could not save this change. Your input is preserved. Check your connection and trip editing access, then retry.";
}
function refreshed(trip: string) {
  revalidatePath("/");
  revalidatePath("/trips/" + trip);
}
export async function saveManagedBooking(
  trip: string,
  form: FormData,
): Promise<MoneyResult> {
  const meta = identity.safeParse({
    trip_id: trip,
    id: form.get("id"),
    revision: form.get("revision"),
  });
  if (!meta.success)
    return { error: "Booking identity unavailable. Reload this form." };
  const { db } = await access();
  form.set("trip_id", trip);
  let fields;
  try {
    let previous: Record<string, unknown> | null = null;
    const simple = form.get("simplified") === "1";
    if (simple) {
      const current = await db
        .from("bookings")
        .select("*")
        .eq("trip_id", trip)
        .eq("id", meta.data.id)
        .maybeSingle();
      if (current.error)
        return {
          error: "Couldn’t load the saved booking. Your input is preserved.",
        };
      previous = current.data;
      if (previous && previous.finance_revision !== meta.data.revision)
        return { error: "Booking changed. Reload before saving." };
    }
    const normalized = new FormData();
    for (const [key, value] of form) normalized.set(key, value);
    // Unchanged legacy locations must not be re-resolved or silently cleared.
    for (const prefix of ["", "end_"]) {
      if (
        previous &&
        String(previous[prefix + "location_id"] || "") ===
          String(form.get(prefix + "location_id") || "")
      )
        normalized.delete(prefix + "location_id");
    }
    const values = await bookingLocationValues(db, normalized);
    if (previous) {
      for (const prefix of ["", "end_"]) {
        if (
          String(previous[prefix + "location_id"] || "") ===
          String(form.get(prefix + "location_id") || "")
        ) {
          for (const key of [
            "location_id",
            "location_label",
            "latitude",
            "longitude",
            "timezone",
          ])
            values[prefix + key] = previous[prefix + key];
        }
      }
      // Simplified edits have no controls for these saved relationships/statuses.
      for (const key of [
        "segment_id",
        "provider",
        "travelers",
        "notes",
        "paid_amount",
        "reservation_status",
      ])
        values[key] = previous[key];
      values.verification =
        form.get("verification") === "user confirmed"
          ? "user confirmed"
          : previous.verification;
    }
    const parsed = bookingSchema.safeParse(values);
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    for (const amount of [parsed.data.price, parsed.data.paid_amount]) {
      if (amount !== null && !/^\d{1,10}(?:\.\d{1,2})?$/.test(String(amount)))
        return {
          error:
            "Use known booking amounts with up to two decimal places. Your input is preserved.",
        };
    }
    fields = parsed.data;
    if (simple && form.has("payment_due_date")) {
      const deadline = String(form.get("payment_due_date") || "");
      if (deadline && !z.iso.date().safeParse(deadline).success)
        return { error: "Choose a valid payment due date." };
      const capability = await db.rpc("managed_booking_editor_version");
      if (capability.error || capability.data !== 1)
        return {
          error:
            "Payment deadline editing needs reviewed database update 018. Your other details are still here.",
        };
      fields = {
        ...fields,
        payment_due_date: deadline || null,
      } as typeof fields;
    }
  } catch {
    return {
      error:
        "Choose valid saved locations, dates and time zones. Your input is preserved.",
    };
  }
  const { data, error } = await db.rpc("save_managed_booking", {
    target: trip,
    record_id: meta.data.id,
    expected_revision: meta.data.revision,
    fields,
  });
  if (error) return { error: failure(error) };
  refreshed(trip);
  return {
    id: data,
    message: "Booking saved. Review and reservation status remain separate.",
  };
}
export async function removeManagedBooking(
  trip: string,
  id: string,
  revision: number,
): Promise<MoneyResult> {
  const parsed = identity.safeParse({ trip_id: trip, id, revision });
  if (!parsed.success) return { error: "Booking unavailable." };
  const { db } = await access();
  const current = await db
    .from("bookings")
    .select("id,finance_revision")
    .eq("trip_id", trip)
    .eq("id", id)
    .single();
  if (current.error || !current.data)
    return { error: "Booking unavailable. Reload your bookings." };
  if (current.data.finance_revision !== revision)
    return { error: "Booking changed. Reload before removing it." };
  const cleanup = await prepareBookingRemoval(db, trip, id);
  if (cleanup) return { error: cleanup };
  const { error } = await db
    .from("bookings")
    .delete()
    .eq("id", id)
    .eq("trip_id", trip)
    .eq("finance_revision", revision)
    .select("id")
    .single();
  if (error)
    return {
      error:
        "The booking could not be removed or changed during removal. Your own file cleanup may already have completed; reload to check before retrying.",
    };
  refreshed(trip);
  return {
    message:
      "Booking removed. Its itinerary activity and recorded expenses are preserved.",
  };
}
export async function saveExpense(
  trip: string,
  input: ExpenseInput,
): Promise<MoneyResult> {
  const parsed = namedExpenseSchema.safeParse(input);
  if (!z.uuid().safeParse(trip).success || !parsed.success)
    return {
      error: parsed.success
        ? "Trip unavailable."
        : parsed.error.issues[0].message,
    };
  const { db } = await access();
  const { data, error } = await db.rpc("change_expense", {
    target: trip,
    record_id: input.id,
    expected_revision: input.revision,
    fields: parsed.data,
    remove: false,
  });
  if (error) return { error: failure(error) };
  refreshed(trip);
  return {
    id: data,
    message: "Expense saved. Booking costs were not added again.",
  };
}
export async function removeExpense(
  trip: string,
  id: string,
  revision: number,
): Promise<MoneyResult> {
  if (!identity.safeParse({ trip_id: trip, id, revision }).success)
    return { error: "Expense unavailable." };
  const { db } = await access();
  const { error } = await db.rpc("change_expense", {
    target: trip,
    record_id: id,
    expected_revision: revision,
    fields: {},
    remove: true,
  });
  if (error) return { error: failure(error) };
  refreshed(trip);
  return { message: "Expense removed. The booking is unchanged." };
}
export async function saveMonetaryBudget(
  trip: string,
  input: {
    amount: string;
    currency: string;
    expectedAmount: number | null;
    expectedCurrency: string;
  },
): Promise<MoneyResult> {
  const parsed = z
    .object({
      amount: z.union([
        z.literal(""),
        z.string().regex(/^\d{1,10}(?:\.\d{1,2})?$/),
      ]),
      currency: z.string().regex(/^[A-Z]{3}$/),
      expectedAmount: z.number().finite().nonnegative().nullable(),
      expectedCurrency: z.string().regex(/^[A-Z]{3}$/),
    })
    .safeParse(input);
  if (
    !z.uuid().safeParse(trip).success ||
    !parsed.success ||
    Number(input.amount) > 9999999999
  )
    return {
      error: "Enter a valid budget amount and three-letter uppercase currency.",
    };
  const { db } = await access();
  const { error } = await db.rpc("save_monetary_budget", {
    target: trip,
    total: input.amount === "" ? null : Number(input.amount),
    unit: input.currency,
    expected_total: input.expectedAmount,
    expected_unit: input.expectedCurrency,
  });
  if (error) return { error: failure(error) };
  refreshed(trip);
  return {
    message:
      "Monetary budget saved. Travel style and existing amounts are unchanged.",
  };
}
