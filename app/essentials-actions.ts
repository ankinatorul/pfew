"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { removeBookingFiles } from "../lib/storage-cleanup";
import { access } from "../lib/access";
import { validationMessage } from "../lib/domain";
import {
  bookingSchema,
  taskSchema,
  packingListSchema,
  packingItemSchema,
  allocationSchema,
  expenseSchema,
} from "../lib/essentials";
const tables = {
  bookings: bookingSchema,
  prep_tasks: taskSchema,
  packing_lists: packingListSchema,
  packing_items: packingItemSchema,
  budget_allocations: allocationSchema,
  expenses: expenseSchema,
};
const views = {
  bookings: "bookings",
  prep_tasks: "prep",
  packing_lists: "packing",
  packing_items: "packing",
  budget_allocations: "budget",
  expenses: "budget",
};
function fail(message: string): never {
  redirect("/error?message=" + encodeURIComponent(message));
}
export async function saveEssential(form: FormData) {
  const { db } = await access();
  const table = z
    .enum([
      "bookings",
      "prep_tasks",
      "packing_lists",
      "packing_items",
      "budget_allocations",
      "expenses",
    ])
    .parse(form.get("table"));
  const result = tables[table].safeParse(Object.fromEntries(form));
  if (!result.success) fail(validationMessage(result.error));
  const id = form.get("id");
  if (id && !z.uuid().safeParse(id).success) fail("Invalid record");
  const payload: Record<string, unknown> = result.data;
  const query = id
    ? db
        .from(table)
        .update(payload)
        .eq("id", id)
        .eq("trip_id", result.data.trip_id)
    : db.from(table).insert(payload);
  const { error } = await query.select("id").single();
  if (error)
    fail(
      "Could not save. Check dates, linked records, and that Phase 2 migrations are applied.",
    );
  revalidatePath("/");
  revalidatePath("/trips/" + result.data.trip_id);
  redirect("/trips/" + result.data.trip_id + "?view=" + views[table]);
}
export async function deleteEssential(form: FormData) {
  const { db } = await access();
  const table = z
    .enum([
      "bookings",
      "prep_tasks",
      "packing_lists",
      "packing_items",
      "budget_allocations",
      "expenses",
    ])
    .parse(form.get("table"));
  const trip = z.uuid().parse(form.get("trip_id"));
  const id = z.uuid().parse(form.get("id"));
  if (table === "bookings") {
    const fileError = await removeBookingFiles(db, trip, id);
    if (fileError) fail(fileError);
  }
  const { error } = await db
    .from(table)
    .delete()
    .eq("id", id)
    .eq("trip_id", trip)
    .select("id")
    .single();
  if (error) fail("Record could not be deleted");
  revalidatePath("/");
  revalidatePath("/trips/" + trip);
  redirect("/trips/" + trip + "?view=" + views[table]);
}
export async function toggleEssential(form: FormData) {
  const { db } = await access();
  const table = z
    .enum(["prep_tasks", "packing_items"])
    .parse(form.get("table"));
  const trip = z.uuid().parse(form.get("trip_id"));
  const id = z.uuid().parse(form.get("id"));
  const field = table === "prep_tasks" ? "done" : "packed";
  const value = z.enum(["true", "false"]).parse(form.get("value")) === "true";
  const { error } = await db
    .from(table)
    .update({ [field]: value })
    .eq("id", id)
    .eq("trip_id", trip)
    .select("id")
    .single();
  if (error) fail("Could not update item");
  revalidatePath("/");
  revalidatePath("/trips/" + trip);
}
export async function saveBudgetRules(form: FormData) {
  const { db } = await access();
  const trip = z.uuid().parse(form.get("trip_id"));
  const { error } = await db.from("budget_settings").upsert({
    trip_id: trip,
    include_prepaid: form.get("include_prepaid") === "on",
  });
  if (error) fail("Could not save budget rules");
  revalidatePath("/trips/" + trip);
}
export async function savePackingTemplate(form: FormData) {
  const { db, user } = await access();
  const trip = z.uuid().parse(form.get("trip_id"));
  const list = z.uuid().parse(form.get("list_id"));
  const name = z.string().trim().min(1).max(100).parse(form.get("name"));
  const { data, error } = await db
    .from("packing_items")
    .select("title,category,quantity")
    .eq("trip_id", trip)
    .eq("list_id", list)
    .limit(101);
  if (error || !data?.length || data.length > 100)
    fail("Templates need 1–100 items");
  const { error: saveError } = await db
    .from("packing_templates")
    .insert({ owner_id: user.id, name, items: data });
  if (saveError) fail("Could not save template");
  revalidatePath("/trips/" + trip);
}
export async function applyPackingTemplate(form: FormData) {
  const { db } = await access();
  const trip = z.uuid().parse(form.get("trip_id"));
  const target = z.uuid().parse(form.get("list_id"));
  const template = z.uuid().parse(form.get("template_id"));
  const { data: list } = await db
    .from("packing_lists")
    .select("id")
    .eq("id", target)
    .eq("trip_id", trip)
    .single();
  if (!list) fail("List unavailable");
  const { error } = await db.rpc("apply_packing_template", {
    target_list: target,
    template,
  });
  if (error) fail("Could not apply template");
  revalidatePath("/trips/" + trip);
}
export async function saveBudgetTarget(form: FormData) {
  const { db } = await access();
  const trip = z.uuid().parse(form.get("trip_id"));
  const parsed = z
    .object({
      budget: z.preprocess(
        (v) => (v === "" ? null : v),
        z.coerce.number().finite().nonnegative().max(9999999999).nullable(),
      ),
      style: z.enum(["Budget", "Comfort", "Luxury"]),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) fail(validationMessage(parsed.error));
  const { error } = await db
    .from("trips")
    .update(parsed.data)
    .eq("id", trip)
    .select("id")
    .single();
  if (error) fail("Could not save budget target");
  revalidatePath("/");
  revalidatePath("/trips/" + trip);
}
