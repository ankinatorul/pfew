"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { access } from "../lib/access";
import { sourcesForLocation } from "../lib/research-catalog";
import {
  retrieveOfficialSource,
  normalizeExcerpt,
} from "../lib/official-research";
import { researchContextSchema } from "../lib/research-types";
export type ResearchSaveState = { error?: string; success?: boolean };
export async function saveResearchNote(
  _state: ResearchSaveState,
  form: FormData,
): Promise<ResearchSaveState> {
  const { db } = await access();
  const parsed = z
    .object({
      trip_id: z.uuid(),
      destination_id: z.uuid(),
      source_id: z.string().max(50),
      title: z.string().trim().min(1).max(160),
      note: z.string().trim().max(1500),
      source_excerpt: z.string().trim().min(15).max(1200),
      reviewed: z.literal("yes"),
      nationality: z.string(),
      document: z.string(),
      purpose: z.string(),
      travel_start: z.string(),
      travel_end: z.string(),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return {
      error:
        "Review the excerpt, enter a title, and confirm that you want to share this note.",
    };
  const input = parsed.data,
    context = researchContextSchema.safeParse(input);
  if (!context.success) return { error: "Enter a valid research context." };
  const { data: destination } = await db
    .from("trip_segments")
    .select("title,location_id")
    .eq("id", input.destination_id)
    .eq("trip_id", input.trip_id)
    .eq("kind", "destination")
    .single();
  const source =
    destination &&
    sourcesForLocation(destination.location_id).find(
      (source) => source.id === input.source_id,
    );
  if (!source) return { error: "Destination or official source unavailable." };
  const { data: reservation, error } = await db.rpc("reserve_service", {
    target: input.trip_id,
    kind: "research",
  });
  if (error)
    return { error: "Research permission or daily request limit unavailable." };
  let current;
  try {
    current = await retrieveOfficialSource(source.id);
    await db.rpc("finish_service", { reservation, succeeded: true });
  } catch {
    await db.rpc("finish_service", { reservation, succeeded: false });
    return {
      error:
        "The source could not be rechecked. Nothing was saved. Open the official site or retry later.",
    };
  }
  const excerpt = normalizeExcerpt(input.source_excerpt);
  if (!normalizeExcerpt(current.text).includes(excerpt))
    return {
      error:
        "This excerpt could not be matched to the current source. Preview the page again and select an exact passage.",
    };
  const { error: saveError } = await db.from("research_notes").insert({
    trip_id: input.trip_id,
    destination_id: input.destination_id,
    destination_label: destination.title,
    source_id: source.id,
    source_name: source.name,
    source_url: source.url,
    retrieved_at: current.retrievedAt,
    reviewed_at: new Date().toISOString(),
    source_excerpt: excerpt,
    title: input.title,
    note: input.note,
    context: context.data,
  });
  if (saveError)
    return {
      error:
        "Could not save research. Apply migration 009 and check editing access.",
    };
  revalidatePath("/trips/" + input.trip_id);
  return { success: true };
}
export async function removeResearchNote(form: FormData) {
  const { db } = await access(),
    trip = z.uuid().parse(form.get("trip_id")),
    id = z.uuid().parse(form.get("id"));
  const { error } = await db
    .from("research_notes")
    .delete()
    .eq("trip_id", trip)
    .eq("id", id)
    .select("id")
    .single();
  if (error) redirect("/error?message=Could%20not%20remove%20research%20note.");
  revalidatePath("/trips/" + trip);
}
export async function researchToPrep(form: FormData) {
  const { db } = await access(),
    trip = z.uuid().parse(form.get("trip_id")),
    id = z.uuid().parse(form.get("id"));
  const title = z.string().trim().min(1).max(200).parse(form.get("title"));
  const due = z
    .union([z.literal(""), z.iso.date()])
    .parse(form.get("due_date"));
  const { data, error } = await db.rpc("research_note_to_prep", {
    target: id,
    target_trip: trip,
    task_title: title,
    due: due || null,
  });
  if (error || !data)
    redirect("/error?message=Could%20not%20add%20this%20research%20task.");
  revalidatePath("/trips/" + trip);
  redirect("/trips/" + trip + "?view=prep");
}
