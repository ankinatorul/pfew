"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { access } from "../lib/access";
import {
  quickAddSchema,
  dayPlanSchema,
  type PlanningState,
} from "../lib/planning-types";
import { parseMapsLink, mapsLinkForPlace } from "../lib/maps-link";
import { segmentLocationValues } from "../lib/automatic-zones";
import {
  segmentSchema,
  validationMessage,
  type Segment,
  type Trip,
} from "../lib/domain";
import { dayPlanValues } from "../lib/day-plan";
export async function quickAdd(
  _state: PlanningState,
  form: FormData,
): Promise<PlanningState> {
  const { db } = await access(),
    parsed = quickAddSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: validationMessage(parsed.error) };
  const input = parsed.data;
  const { data: trip } = await db
    .from("trips")
    .select("start_date,end_date,timezone")
    .eq("id", input.trip_id)
    .single();
  if (!trip) return { error: "Trip unavailable." };
  let destination: Segment | null = null;
  if (input.destination_id) {
    const { data } = await db
      .from("trip_segments")
      .select("*")
      .eq("trip_id", input.trip_id)
      .eq("id", input.destination_id)
      .eq("kind", "destination")
      .neq("status", "idea")
      .single();
    if (!data) return { error: "Choose a destination from this trip." };
    destination = data as Segment;
  }
  const day =
    input.mode === "day"
      ? input.day
      : destination?.start_date || trip.start_date;
  if (day < trip.start_date || day > trip.end_date)
    return { error: "Choose a day within this trip." };
  if (
    input.mode === "day" &&
    destination &&
    (day < destination.start_date || day > destination.end_date)
  )
    return {
      error:
        "That day is outside the selected destination’s dates. Choose a matching destination or clear it.",
    };
  const maps = input.maps_link ? parseMapsLink(input.maps_link) : null;
  if (input.maps_link && !maps)
    return { error: "Use a supported HTTPS Google Maps link." };
  const placeId = input.google_place_id || maps?.placeId || null;
  const link = placeId ? mapsLinkForPlace(placeId, input.title) : maps?.url;
  const notes = [input.notes, link ? "Google Maps link: " + link : ""]
    .filter(Boolean)
    .join("\n\n");
  if (notes.length > 4000)
    return { error: "Shorten the notes or link to fit this item." };
  const canonical = new FormData();
  Object.entries({
    trip_id: input.trip_id,
    kind: input.kind,
    title: input.title,
    start_date: day,
    end_date: day,
    local_time: input.mode === "day" ? input.local_time : "",
    status: input.mode === "day" ? "planned" : "idea",
    duration_minutes:
      input.kind === "activity" ? String(input.duration_minutes || "") : "",
    destination_id: input.destination_id,
    notes,
    address: input.address,
    provider: "",
    reference: "",
    position: "0",
  }).forEach(([key, value]) => canonical.set(key, value));
  let payload;
  try {
    payload = segmentSchema.parse(await segmentLocationValues(db, canonical));
  } catch (error) {
    return { error: validationMessage(error) };
  }
  const { error } = await db
    .from("trip_segments")
    .insert({ ...payload, id: input.id, google_place_id: placeId });
  if (error) {
    if (error.code !== "23505")
      return {
        error:
          "Could not save this item. Check editing access and your connection.",
      };
    const { data: existing } = await db
      .from("trip_segments")
      .select("id")
      .eq("id", input.id)
      .eq("trip_id", input.trip_id)
      .single();
    if (!existing) return { error: "Could not save this item." };
  }
  revalidatePath("/");
  revalidatePath("/trips/" + input.trip_id);
  return {
    savedId: input.id,
    view: input.mode === "day" ? "itinerary&day=" + day : "ideas",
  };
}
export async function updateDayPlan(
  _state: PlanningState,
  form: FormData,
): Promise<PlanningState> {
  const { db } = await access(),
    parsed = dayPlanSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: validationMessage(parsed.error) };
  const input = parsed.data;
  const [tripResult, itemResult, destinations] = await Promise.all([
    db
      .from("trips")
      .select("start_date,end_date,timezone")
      .eq("id", input.trip_id)
      .single(),
    db
      .from("trip_segments")
      .select("*")
      .eq("id", input.id)
      .eq("trip_id", input.trip_id)
      .single(),
    db
      .from("trip_segments")
      .select("*")
      .eq("trip_id", input.trip_id)
      .eq("kind", "destination"),
  ]);
  if (
    tripResult.error ||
    itemResult.error ||
    destinations.error ||
    !tripResult.data ||
    !itemResult.data
  )
    return {
      error: "Could not load this plan. Refresh and check your access.",
    };
  if (
    Date.parse(itemResult.data.updated_at) !==
    Date.parse(input.expected_updated_at)
  )
    return {
      error:
        "Someone changed this item since you opened it. Refresh to review their changes before saving.",
    };
  let payload;
  try {
    payload = dayPlanValues(
      itemResult.data as Segment,
      tripResult.data as Trip,
      (destinations.data || []) as Segment[],
      input,
    );
  } catch (error) {
    return { error: validationMessage(error) };
  }
  const { data, error } = await db
    .from("trip_segments")
    .update(payload)
    .eq("id", input.id)
    .eq("trip_id", input.trip_id)
    .eq("updated_at", input.expected_updated_at)
    .select("id")
    .single();
  if (error || !data)
    return {
      error:
        "The item changed or could not be saved. Refresh and check your editing access.",
    };
  revalidatePath("/");
  revalidatePath("/trips/" + input.trip_id);
  redirect("/trips/" + input.trip_id + "?view=itinerary&day=" + input.day);
}
