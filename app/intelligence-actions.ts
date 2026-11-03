"use server";
import { destinationOnDay } from "../lib/day-plan";
import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { access } from "../lib/access";
import { resolveLocation } from "../lib/locations";
import { checkTrip } from "../lib/trip-check";
import type { Trip, Segment } from "../lib/domain";
import { validationMessage } from "../lib/domain";
import type { Booking, Task } from "../lib/essentials";
import { aiProvider } from "../lib/ai";
function fail(message: string): never {
  redirect("/error?message=" + encodeURIComponent(message));
}
function done(trip: string, view: string): never {
  revalidatePath("/trips/" + trip);
  redirect("/trips/" + trip + "?view=" + view);
}
export async function runTripCheck(form: FormData) {
  const { db } = await access();
  const id = z.uuid().parse(form.get("trip_id"));
  const [trip, segments, bookings, tasks] = await Promise.all([
    db.from("trips").select("*").eq("id", id).single(),
    db.from("trip_segments").select("*").eq("trip_id", id),
    db.from("bookings").select("*").eq("trip_id", id),
    db.from("prep_tasks").select("*").eq("trip_id", id),
  ]);
  if (trip.error || segments.error || bookings.error || tasks.error)
    fail("Could not load data for Trip Check.");
  const findings = checkTrip(
    trip.data as Trip,
    segments.data as Segment[],
    bookings.data as Booking[],
    tasks.data as Task[],
  );
  const { error } = await db.rpc("replace_trip_check", {
    target: id,
    findings,
  });
  if (error)
    fail(
      "Could not save Trip Check. Apply the intelligence migration and check editing access.",
    );
  done(id, "check");
}
export async function decideFinding(form: FormData) {
  const { db } = await access();
  const input = z
    .object({
      trip_id: z.uuid(),
      finding_id: z.uuid(),
      decision: z.enum([
        "already_arranged",
        "not_needed",
        "dismissed",
        "remind_later",
      ]),
    })
    .parse(Object.fromEntries(form));
  const { error } = await db.from("finding_decisions").upsert({
    ...input,
    remind_after:
      input.decision === "remind_later"
        ? new Date(Date.now() + 86400000).toISOString()
        : null,
  });
  if (error) fail("Could not save your decision.");
  done(input.trip_id, "check");
}
export async function restoreFinding(form: FormData) {
  const { db } = await access();
  const trip = z.uuid().parse(form.get("trip_id"));
  const finding = z.uuid().parse(form.get("finding_id"));
  const { error } = await db
    .from("finding_decisions")
    .delete()
    .eq("trip_id", trip)
    .eq("finding_id", finding);
  if (error) fail("Could not restore finding.");
  done(trip, "check");
}
export async function savePlace(form: FormData) {
  const { db } = await access();
  const parsed = z
    .object({
      trip_id: z.uuid(),
      title: z.string().trim().min(1).max(200),
      notes: z.string().max(2000),
      category: z.enum(["food", "activity", "stay", "transport", "other"]),
      source: z.enum(["city", "google"]),
      location_id: z.string().optional(),
      google_place_id: z.string().max(300).optional(),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) fail(validationMessage(parsed.error));
  const { location_id, google_place_id, ...base } = parsed.data;
  let payload: Record<string, unknown>;
  if (base.source === "city") {
    const location = resolveLocation(location_id || "");
    if (!location) fail("Choose a city from the results.");
    payload = {
      ...base,
      location_id: location.id,
      latitude: location.latitude,
      longitude: location.longitude,
    };
  } else {
    if (!google_place_id || !/^[A-Za-z0-9_-]{5,300}$/.test(google_place_id))
      fail("Invalid Google place identifier.");
    payload = { ...base, google_place_id };
  }
  const { error } = await db.from("saved_places").insert(payload);
  if (error) fail("Could not save place. Check the intelligence migration.");
  done(base.trip_id, "map");
}
export async function deletePlace(form: FormData) {
  const { db } = await access();
  const trip = z.uuid().parse(form.get("trip_id"));
  const id = z.uuid().parse(form.get("id"));
  const { error } = await db
    .from("saved_places")
    .delete()
    .eq("trip_id", trip)
    .eq("id", id)
    .select("id")
    .single();
  if (error) fail("Could not remove place.");
  done(trip, "map");
}
export async function generateSuggestions(form: FormData) {
  const { db } = await access();
  const input = z
    .object({
      trip_id: z.uuid(),
      mode: z.enum(["mock", "live"]),
      request: z.string().trim().min(1).max(500),
      destination_id: z.union([z.literal(""), z.uuid()]),
    })
    .safeParse(Object.fromEntries(form));
  if (!input.success) fail(validationMessage(input.error));
  const { data: trip } = await db
    .from("trips")
    .select("*")
    .eq("id", input.data.trip_id)
    .single();
  let destination: { title: string } | null = null;
  if (input.data.destination_id) {
    const result = await db
      .from("trip_segments")
      .select("title")
      .eq("id", input.data.destination_id)
      .eq("trip_id", input.data.trip_id)
      .eq("kind", "destination")
      .single();
    if (result.error || !result.data)
      fail("Choose a destination from this trip.");
    destination = result.data;
  }
  if (!trip) fail("Trip unavailable.");
  let provider;
  try {
    provider = aiProvider(input.data.mode);
  } catch (error) {
    fail(validationMessage(error));
  }
  const { data: reservation, error: budgetError } = await db.rpc(
    "reserve_service",
    { target: trip.id, kind: input.data.mode === "mock" ? "mock" : "ai" },
  );
  if (budgetError) fail("Suggestion permission or request budget unavailable.");
  let suggestions;
  try {
    suggestions = await provider.suggest({
      tripName: trip.name,
      destination: destination?.title || "your selected destinations",
      style: trip.style,
      currency: trip.currency,
      budget: trip.budget,
      travelers: trip.travelers,
      days: Math.max(
        1,
        Math.round(
          (Date.parse(trip.end_date) - Date.parse(trip.start_date)) / 86400000,
        ) + 1,
      ),
      request: input.data.request,
    });
    await db.rpc("finish_service", { reservation, succeeded: true });
  } catch {
    await db.rpc("finish_service", { reservation, succeeded: false });
    fail(
      "The suggestion provider could not complete this request. Your trip was not modified.",
    );
  }
  const { error } = await db.from("ai_suggestions").insert(
    suggestions.map((s) => ({
      ...s,
      trip_id: trip.id,
      source: input.data.mode === "mock" ? "mock" : "ai",
    })),
  );
  if (error) fail("Suggestions could not be saved.");
  done(trip.id, "ideas");
}
export async function acceptSuggestion(form: FormData) {
  const { db } = await access();
  const trip = z.uuid().parse(form.get("trip_id"));
  const suggestion = z.uuid().parse(form.get("suggestion_id"));
  const { data } = await db
    .from("ai_suggestions")
    .select("id")
    .eq("id", suggestion)
    .eq("trip_id", trip)
    .single();
  if (!data) fail("Suggestion unavailable.");
  const { error } = await db.rpc("accept_ai_idea", { suggestion });
  if (error) fail("Could not add this suggestion to Ideas.");
  done(trip, "ideas");
}
export async function dismissSuggestion(form: FormData) {
  const { db } = await access();
  const trip = z.uuid().parse(form.get("trip_id"));
  const id = z.uuid().parse(form.get("suggestion_id"));
  const { error } = await db
    .from("ai_suggestions")
    .update({ dismissed: true })
    .eq("id", id)
    .eq("trip_id", trip)
    .select("id")
    .single();
  if (error) fail("Could not dismiss suggestion.");
  done(trip, "ideas");
}
export async function planIdea(form: FormData) {
  const { db } = await access();
  const input = z
    .object({
      trip_id: z.uuid(),
      id: z.uuid(),
      day: z.iso.date(),
      local_time: z.union([z.literal(""), z.iso.time({ precision: -1 })]),
      duration_minutes: z.preprocess(
        (v) => (v === "" ? null : v),
        z.coerce.number().int().min(1).max(1440).nullable(),
      ),
    })
    .parse(Object.fromEntries(form));
  const { data: trip } = await db
    .from("trips")
    .select("start_date,end_date,timezone")
    .eq("id", input.trip_id)
    .single();
  const { data: idea } = await db
    .from("trip_segments")
    .select("location_id,timezone,destination_id")
    .eq("id", input.id)
    .eq("trip_id", input.trip_id)
    .eq("status", "idea")
    .single();
  if (
    !trip ||
    !idea ||
    input.day < trip.start_date ||
    input.day > trip.end_date
  )
    fail("Choose an idea and a day within this trip.");
  const { data: destinations, error: destinationError } = await db
    .from("trip_segments")
    .select("*")
    .eq("trip_id", input.trip_id)
    .eq("kind", "destination")
    .neq("status", "idea");
  if (destinationError) fail("Could not load the destinations for this day.");
  const dest = destinationOnDay(
    (destinations || []) as Segment[],
    input.day,
    idea.destination_id,
  );
  const { error } = await db
    .from("trip_segments")
    .update({
      status: "planned",
      destination_id: dest?.id || null,
      start_date: input.day,
      end_date: input.day,
      local_time: input.local_time,
      duration_minutes: input.duration_minutes,
      timezone: idea.location_id
        ? idea.timezone
        : dest?.timezone || trip.timezone,
    })
    .eq("id", input.id)
    .eq("trip_id", input.trip_id)
    .eq("status", "idea")
    .select("id")
    .single();
  if (error) fail("Could not schedule idea.");
  done(input.trip_id, "itinerary&day=" + input.day);
}
export async function placeToIdea(form: FormData) {
  const { db } = await access();
  const trip = z.uuid().parse(form.get("trip_id"));
  const id = z.uuid().parse(form.get("place_id"));
  const { data: place } = await db
    .from("saved_places")
    .select("*")
    .eq("trip_id", trip)
    .eq("id", id)
    .single();
  const { data: tripData } = await db
    .from("trips")
    .select("start_date,timezone")
    .eq("id", trip)
    .single();
  if (!place || !tripData) fail("Place unavailable.");
  const location = place.location_id
    ? resolveLocation(place.location_id)
    : null;
  const { error } = await db.from("trip_segments").insert({
    trip_id: trip,
    kind: "activity",
    title: place.title,
    start_date: tripData.start_date,
    end_date: tripData.start_date,
    timezone: location?.timezone || tripData.timezone,
    status: "idea",
    notes: place.notes,
    google_place_id: place.google_place_id,
    location_id: place.location_id,
    location_label: location?.label || null,
    latitude: place.latitude,
    longitude: place.longitude,
  });
  if (error) fail("Could not save to Ideas.");
  done(trip, "ideas");
}
