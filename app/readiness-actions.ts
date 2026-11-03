"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { access } from "../lib/access";
import {
  packingCandidateSchema,
  prepCandidateSchema,
  normalizedTitle,
  withoutExisting,
  type AdditionState,
} from "../lib/readiness";
import { additionId } from "../lib/stable-addition";
function decode(value: FormDataEntryValue | null) {
  try {
    return JSON.parse(String(value || ""));
  } catch {
    return null;
  }
}
export async function addReviewedPacking(
  _state: AdditionState,
  form: FormData,
): Promise<AdditionState> {
  const { db } = await access();
  const parsed = z
    .object({
      trip_id: z.uuid(),
      list_id: z.uuid(),
      approved: z.literal("yes"),
    })
    .safeParse(Object.fromEntries(form));
  const items = z
    .array(packingCandidateSchema)
    .min(1)
    .max(30)
    .safeParse(decode(form.get("items")));
  if (!parsed.success || !items.success)
    return { error: "Select 1–30 items and approve the additions." };
  const input = parsed.data,
    { data: list, error: listError } = await db
      .from("packing_lists")
      .select("id")
      .eq("trip_id", input.trip_id)
      .eq("id", input.list_id)
      .single();
  if (listError || !list) return { error: "This packing list is unavailable." };
  const { data: existing, error: readError } = await db
    .from("packing_items")
    .select("title")
    .eq("trip_id", input.trip_id)
    .eq("list_id", input.list_id);
  if (readError) return { error: "Could not check existing packing items." };
  const additions = withoutExisting(items.data, existing || []);
  if (!additions.length) return { added: 0, skipped: items.data.length };
  const rows = additions.map((item) => ({
    id: additionId("packing:" + input.list_id, normalizedTitle(item.title)),
    trip_id: input.trip_id,
    list_id: input.list_id,
    title: item.title,
    category: item.category,
    quantity: item.quantity,
    packed: false,
  }));
  const { data, error } = await db
    .from("packing_items")
    .upsert(rows, { onConflict: "id", ignoreDuplicates: true })
    .select("id");
  if (error)
    return {
      error:
        "Could not add the reviewed items. Check editing access and your connection.",
    };
  revalidatePath("/trips/" + input.trip_id);
  return {
    added: data?.length || 0,
    skipped: items.data.length - (data?.length || 0),
  };
}
export async function addReviewedPrep(
  _state: AdditionState,
  form: FormData,
): Promise<AdditionState> {
  const { db } = await access();
  const parsed = z
    .object({ trip_id: z.uuid(), approved: z.literal("yes") })
    .safeParse(Object.fromEntries(form));
  const items = z
    .array(prepCandidateSchema)
    .min(1)
    .max(20)
    .safeParse(decode(form.get("items")));
  if (!parsed.success || !items.success)
    return { error: "Select 1–20 tasks and approve the additions." };
  const { data: existing, error: readError } = await db
    .from("prep_tasks")
    .select("title")
    .eq("trip_id", parsed.data.trip_id);
  if (readError)
    return { error: "Could not check existing preparation tasks." };
  const additions = withoutExisting(items.data, existing || []);
  if (!additions.length) return { added: 0, skipped: items.data.length };
  const rows = additions.map((item) => ({
    id: additionId("prep:" + parsed.data.trip_id, normalizedTitle(item.title)),
    trip_id: parsed.data.trip_id,
    title: item.title,
    category: item.category,
    due_date: item.due_date || null,
    priority: item.priority,
    done: false,
  }));
  const { data, error } = await db
    .from("prep_tasks")
    .upsert(rows, { onConflict: "id", ignoreDuplicates: true })
    .select("id");
  if (error)
    return {
      error:
        "Could not add the reviewed tasks. Check editing access and your connection.",
    };
  revalidatePath("/");
  revalidatePath("/trips/" + parsed.data.trip_id);
  return {
    added: data?.length || 0,
    skipped: items.data.length - (data?.length || 0),
  };
}
