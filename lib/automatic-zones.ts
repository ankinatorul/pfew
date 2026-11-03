import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveLocation } from "./locations";
import type { ResolvedLocation } from "./location-types";
function city(value: FormDataEntryValue | null) {
  if (!value) return null;
  const result = resolveLocation(String(value));
  if (!result) throw new Error("Choose a place from the location results.");
  return result;
}
export function locationFields(location: ResolvedLocation | null, prefix = "") {
  return location
    ? {
        [prefix + "location_id"]: location.id,
        [prefix + "location_label"]: location.label,
        [prefix + "latitude"]: location.latitude,
        [prefix + "longitude"]: location.longitude,
      }
    : {
        [prefix + "location_id"]: null,
        [prefix + "location_label"]: null,
        [prefix + "latitude"]: null,
        [prefix + "longitude"]: null,
      };
}
export async function segmentLocationValues(
  db: SupabaseClient,
  form: FormData,
): Promise<Record<string, unknown>> {
  const tripId = String(form.get("trip_id"));
  const { data: trip } = await db
    .from("trips")
    .select("timezone")
    .eq("id", tripId)
    .single();
  if (!trip) throw new Error("Trip unavailable.");
  const start = city(form.get("location_id"));
  const arrival = city(form.get("arrival_location_id"));
  const linkedId = form.get("destination_id");
  const { data: segments } = await db
    .from("trip_segments")
    .select("id,kind,start_date,end_date,timezone")
    .eq("trip_id", tripId)
    .order("start_date", { ascending: false });
  const linked = segments?.find((s) => s.id === linkedId);
  const active = segments?.find(
    (s) =>
      s.kind === "destination" &&
      s.start_date <= String(form.get("start_date")) &&
      s.end_date >= String(form.get("start_date")),
  );
  let previous: Record<string, unknown> | null = null;
  if (form.get("id")) {
    const { data } = await db
      .from("trip_segments")
      .select("timezone,arrival_timezone,location_id,arrival_location_id")
      .eq("id", form.get("id"))
      .eq("trip_id", tripId)
      .single();
    previous = data;
  }
  if (form.get("kind") === "destination" && !start)
    throw new Error(
      "Choose the destination location so its local time can be set automatically.",
    );
  return {
    ...Object.fromEntries(form),
    timezone:
      start?.timezone ||
      linked?.timezone ||
      active?.timezone ||
      (!previous?.location_id ? previous?.timezone : null) ||
      trip.timezone,
    arrival_timezone:
      arrival?.timezone ||
      (!previous?.arrival_location_id ? previous?.arrival_timezone : "") ||
      "",
    ...locationFields(start),
    ...locationFields(arrival, "arrival_"),
  };
}
export async function bookingLocationValues(
  db: SupabaseClient,
  form: FormData,
): Promise<Record<string, unknown>> {
  const tripId = String(form.get("trip_id"));
  const start = city(form.get("location_id"));
  const arrival = city(form.get("end_location_id"));
  const { data: trip } = await db
    .from("trips")
    .select("timezone")
    .eq("id", tripId)
    .single();
  if (!trip) throw new Error("Trip unavailable.");
  const { data: segments } = await db
    .from("trip_segments")
    .select("id,kind,start_date,end_date,timezone,arrival_timezone")
    .eq("trip_id", tripId)
    .order("start_date", { ascending: false });
  const linked = segments?.find((s) => s.id === form.get("segment_id"));
  const active = segments?.find(
    (s) =>
      s.kind === "destination" &&
      s.start_date <= String(form.get("start_date")) &&
      s.end_date >= String(form.get("start_date")),
  );
  let previous: Record<string, unknown> | null = null;
  if (form.get("id")) {
    const { data } = await db
      .from("bookings")
      .select("timezone,end_timezone,location_id,end_location_id")
      .eq("trip_id", tripId)
      .eq("id", form.get("id"))
      .single();
    previous = data;
  }
  const timezone =
    start?.timezone ||
    linked?.timezone ||
    active?.timezone ||
    (!previous?.location_id ? previous?.timezone : null) ||
    trip.timezone;
  return {
    ...Object.fromEntries(form),
    timezone,
    end_timezone:
      arrival?.timezone ||
      linked?.arrival_timezone ||
      (!previous?.end_location_id ? previous?.end_timezone : "") ||
      (form.get("category") === "accommodation" ? timezone : ""),
    ...locationFields(start),
    ...locationFields(arrival, "end_"),
  };
}
