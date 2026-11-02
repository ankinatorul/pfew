"use server";
import { cookies } from "next/headers";
import { safeReturnPath } from "../lib/auth-redirect";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { access } from "../lib/access";
import { supabase } from "../lib/supabase";
import {
  tripSchema,
  segmentSchema,
  parseDestinations,
  validationMessage,
} from "../lib/domain";
import { z } from "zod";
import { resolveLocation } from "../lib/locations";
import { segmentLocationValues, locationFields } from "../lib/automatic-zones";
import { authProviders } from "../lib/auth-providers";
import { removeBookingFiles } from "../lib/storage-cleanup";
async function client() {
  return access();
}
function fail(message: string): never {
  redirect("/error?message=" + encodeURIComponent(message));
}
export async function google(form: FormData) {
  const providers = await authProviders();
  if (!providers.google) redirect("/login");
  const jar = await cookies();
  const returnTo = safeReturnPath(form.get("next"));
  if (returnTo)
    jar.set("pfew_return_to", returnTo, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
  else jar.delete("pfew_return_to");
  const db = await supabase();
  const { data, error } = await db.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: new URL(
        "/auth/callback",
        process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
      ).href,
    },
  });
  if (error || !data.url) fail("Google sign-in is unavailable.");
  redirect(data.url);
}
export async function logout() {
  const db = await supabase();
  const { error } = await db.auth.signOut({ scope: "local" });
  if (error) fail("We couldn’t sign you out. Please try again.");
  (await cookies()).delete("pfew_return_to");
  revalidatePath("/", "layout");
  redirect("/login");
}
export async function saveTrip(form: FormData) {
  const { db, user } = await client();
  let input = Object.fromEntries(form);
  if (form.get("id")) {
    const { data: old } = await db
      .from("trips")
      .select("timezone")
      .eq("id", form.get("id"))
      .single();
    if (old) input = { ...input, timezone: old.timezone };
  }
  const parsed = tripSchema.safeParse(input);
  if (!parsed.success)
    fail(parsed.error.issues.map((i) => i.message).join(". "));
  const id = form.get("id");
  if (id) {
    if (!z.uuid().safeParse(id).success) fail("Invalid trip");
    const { error } = await db
      .from("trips")
      .update(parsed.data)
      .eq("id", id)
      .eq("owner_id", user.id)
      .select("id")
      .single();
    if (error) fail("Trip could not be updated.");
  } else {
    let destinations;
    try {
      destinations = parseDestinations(
        form,
        parsed.data.start_date,
        parsed.data.end_date,
      ).map((d) => {
        const location = resolveLocation(d.location_id);
        if (!location)
          throw new Error("Choose each destination from the city results.");
        return {
          ...d,
          title: location.label,
          timezone: location.timezone,
          ...locationFields(location),
        };
      });
      if (destinations.length)
        parsed.data.timezone = [...destinations].sort((a, b) =>
          a.start_date.localeCompare(b.start_date),
        )[0].timezone;
    } catch (error) {
      fail(validationMessage(error));
    }
    const { data, error } = await db.rpc("create_trip_with_destinations", {
      trip_data: parsed.data,
      destinations,
    });
    if (error)
      fail(
        "Trip could not be created. Apply the automatic locations upgrade and check your connection.",
      );
    revalidatePath("/");
    redirect("/trips/" + data);
  }
  revalidatePath("/");
  redirect("/trips/" + id);
}
export async function deleteTrip(form: FormData) {
  const { db, user } = await client();
  const id = z.uuid().parse(form.get("id"));
  const { data: owned } = await db
    .from("trips")
    .select("id")
    .eq("id", id)
    .eq("owner_id", user.id)
    .single();
  if (!owned) fail("Only the trip owner can delete this trip.");
  const { data: hasOther, error: privateError } = await db.rpc(
    "has_other_private_files",
    { target: id },
  );
  if (hasOther)
    fail(
      "Other travelers have private documents attached. They need to remove those files from their own account before this trip can be deleted.",
    );
  if (privateError && privateError.code !== "PGRST202")
    fail("Could not check private document ownership.");
  const fileError = await removeBookingFiles(db, id);
  if (fileError) fail(fileError);
  const { error } = await db
    .from("trips")
    .delete()
    .eq("id", id)
    .eq("owner_id", user.id);
  if (error) fail("Could not delete trip");
  revalidatePath("/");
  redirect("/");
}
export async function saveSegment(form: FormData) {
  const { db } = await client();
  let input;
  try {
    input = await segmentLocationValues(db, form);
  } catch (error) {
    fail(validationMessage(error));
  }
  const parsed = segmentSchema.safeParse(input);
  if (!parsed.success)
    fail(parsed.error.issues.map((i) => i.message).join(". "));
  const { data: trip } = await db
    .from("trips")
    .select("start_date,end_date")
    .eq("id", parsed.data.trip_id)
    .single();
  if (
    !trip ||
    parsed.data.start_date < trip.start_date ||
    parsed.data.end_date > trip.end_date
  )
    fail("Item dates must be within the trip.");
  const id = form.get("id");
  if (id && !z.uuid().safeParse(id).success) fail("Invalid item");
  const query = id
    ? db
        .from("trip_segments")
        .update(parsed.data)
        .eq("id", id)
        .eq("trip_id", parsed.data.trip_id)
    : db.from("trip_segments").insert(parsed.data);
  const { error } = await query.select("id").single();
  if (error) fail("Could not save itinerary item");
  revalidatePath("/trips/" + parsed.data.trip_id);
  redirect(
    "/trips/" +
      parsed.data.trip_id +
      "?view=itinerary&day=" +
      parsed.data.start_date,
  );
}
export async function deleteSegment(form: FormData) {
  const { db } = await client();
  const trip = z.uuid().parse(form.get("trip_id"));
  const id = z.uuid().parse(form.get("id"));
  const { error } = await db
    .from("trip_segments")
    .delete()
    .eq("id", id)
    .eq("trip_id", trip);
  if (error) fail("Could not remove item");
  revalidatePath("/trips/" + trip);
  redirect("/trips/" + trip + "?view=itinerary");
}
export async function saveLayout(form: FormData) {
  const { db } = await client();
  const trip_id = z.uuid().parse(form.get("trip_id"));
  const modules = [
    "itinerary",
    "destinations",
    "stays",
    "transport",
    "bookings",
    "prep",
    "packing",
    "budget",
    "map",
    "ideas",
    "check",
  ];
  const layout = modules.map((key) => ({
    key,
    visible: form.get(key) === "on",
    size: form.get(key + "_size") === "wide" ? "wide" : "normal",
    highlight: form.get(key + "_highlight") === "on",
    order: Math.max(0, Math.min(10, Number(form.get(key + "_order")) || 0)),
  }));
  const { error } = await db
    .from("trip_hub_preferences")
    .upsert({ trip_id, layout }, { onConflict: "trip_id" });
  if (error) fail("Could not save hub preferences");
  revalidatePath("/trips/" + trip_id);
  redirect("/trips/" + trip_id);
}
