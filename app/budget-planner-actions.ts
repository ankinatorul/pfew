"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { access } from "../lib/access";
import {
  budgetDistributionSchema,
  distributeBudget,
} from "../lib/budget-distribution";
import { budgetContextKey } from "../lib/budget-context";
import { additionId } from "../lib/stable-addition";
import { validationMessage } from "../lib/domain";
export type BudgetPlanState = {
  error?: string;
  added?: number;
  skipped?: number;
};
export async function addBudgetDistribution(
  _state: BudgetPlanState,
  form: FormData,
): Promise<BudgetPlanState> {
  const { db } = await access();
  const metadata = z
    .object({
      trip_id: z.uuid(),
      plan_id: z.uuid(),
      context_key: z.string().regex(/^[a-f0-9]{64}$/),
      currency: z.string().regex(/^[A-Z]{3}$/),
      approved: z.literal("yes"),
    })
    .safeParse(Object.fromEntries(form));
  let raw: unknown;
  try {
    raw = JSON.parse(String(form.get("plan")));
  } catch {
    return { error: "Preview the allocation plan again." };
  }
  const parsed = budgetDistributionSchema.safeParse(raw);
  if (!metadata.success || !parsed.success)
    return { error: "Review a valid allocation plan and approve adding it." };
  const input = metadata.data;
  const [trip, allocations, bookings, settings] = await Promise.all([
    db
      .from("trips")
      .select("currency,budget,start_date,end_date")
      .eq("id", input.trip_id)
      .single(),
    db
      .from("budget_allocations")
      .select("id,planned,currency,day,destination_id")
      .eq("trip_id", input.trip_id),
    db
      .from("bookings")
      .select("id,paid_amount,currency")
      .eq("trip_id", input.trip_id),
    db
      .from("budget_settings")
      .select("include_prepaid")
      .eq("trip_id", input.trip_id)
      .maybeSingle(),
  ]);
  if (
    trip.error ||
    allocations.error ||
    bookings.error ||
    settings.error ||
    !trip.data
  )
    return { error: "Could not load the current budget." };
  if (trip.data.currency !== input.currency)
    return {
      error: "The trip currency changed. Refresh and prepare a new preview.",
    };
  let result;
  try {
    result = distributeBudget(parsed.data);
  } catch (error) {
    return { error: validationMessage(error) };
  }
  if (
    result.some(
      (row) => row.day < trip.data.start_date || row.day > trip.data.end_date,
    )
  )
    return { error: "Choose days within this trip." };
  const rows = result.map((row) => ({
    id: additionId(
      "budget:" + input.trip_id + ":" + input.plan_id,
      row.day + "\0" + row.category.toLowerCase(),
    ),
    trip_id: input.trip_id,
    currency: input.currency,
    category: row.category,
    day: row.day,
    destination_id: null,
    planned: row.planned,
    estimate_low: null,
    estimate_high: null,
    notes:
      "User-approved distribution of a chosen amount. Editable planning assumptions; not researched local prices.",
  }));
  const ids = new Set(rows.map((row) => row.id));
  const current = allocations.data || [];
  const key = budgetContextKey(
    trip.data,
    settings.data?.include_prepaid ?? true,
    current,
    bookings.data || [],
  );
  // A network retry must not add another batch or fail just because its own rows
  // changed the context. The rows remain editable after their first insertion.
  const retryKey = budgetContextKey(
    trip.data,
    settings.data?.include_prepaid ?? true,
    current.filter((row) => !ids.has(row.id)),
    bookings.data || [],
  );
  if (key !== input.context_key && retryKey !== input.context_key)
    return {
      error:
        "The budget changed since this preview. Refresh and review the current numbers before adding allocations.",
    };
  const { data, error } = await db
    .from("budget_allocations")
    .upsert(rows, { onConflict: "id", ignoreDuplicates: true })
    .select("id");
  if (error)
    return {
      error:
        "Could not add the allocation plan. Check editing access and your connection.",
    };
  revalidatePath("/trips/" + input.trip_id);
  return {
    added: data?.length || 0,
    skipped: rows.length - (data?.length || 0),
  };
}
