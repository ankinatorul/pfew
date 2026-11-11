"use server";
import { revalidatePath } from "next/cache";
import { access } from "../lib/access";
import { resolveLocation } from "../lib/locations";
import { tripBasicsSchema } from "../lib/trip-drafts";
import { reviewInputSchema, type ReviewResult } from "../lib/trip-review";
import { automaticTripTheme } from "../lib/trip-theme";
import { storedTravelStyle, travelStyleLabel } from "../lib/trip-style";

async function review(
  input: unknown,
  finalize: boolean,
): Promise<ReviewResult> {
  const parsed = reviewInputSchema.safeParse(input);
  if (!parsed.success)
    return { error: "Reopen your trip review and check the saved details." };
  const value = parsed.data;
  const { db, user } = await access();
  try {
    const { data: trip, error } = await db
      .from("trips")
      .select("*")
      .eq("id", value.id)
      .eq("owner_id", user.id)
      .single();
    if (error || !trip)
      return {
        error:
          "Your private draft could not be opened. Sign in to its owner account and retry.",
      };
    if (
      trip.creation_state !== "draft" &&
      !(
        finalize &&
        trip.creation_state === "finalized" &&
        trip.draft_data?.finalization_receipt
      )
    )
      return {
        error: "This trip is no longer a private draft. Open it from My Trips.",
      };
    const basics = tripBasicsSchema.safeParse({
      ...trip,
      destinations: trip.draft_data?.destinations,
    });
    if (!basics.success)
      return {
        error:
          "Check your trip name, destinations and both dates in Trip Basics before creating your trip.",
      };
    const destinations = basics.data.destinations.map((d) =>
      resolveLocation(d.id),
    );
    if (destinations.some((d) => !d))
      return {
        error:
          "Choose each destination again in Trip Basics. Your saved draft has not been discarded.",
      };
    const theme = automaticTripTheme(
      trip.name,
      destinations.filter((d) => d !== null),
    ).theme;
    const { data: saved, error: saveError } = await db.rpc(
      finalize ? "finalize_trip_draft" : "save_trip_review",
      {
        target: value.id,
        expected_revision: value.revision,
        tier: storedTravelStyle(value.style),
        ...(finalize
          ? { expected_bookings: value.bookings, assigned_theme: theme }
          : {}),
      },
    );
    if (saveError) {
      if (/changed|another tab/i.test(saveError.message))
        return {
          error:
            "Your trip or bookings changed in another tab. Reload this review before creating your trip. Saved data is still safe.",
        };
      if (["PGRST202", "42883", "42703"].includes(saveError.code))
        return {
          error:
            "Final trip creation needs the reviewed migrations in a separate development database. Nothing was applied to the live project.",
        };
      return {
        error: finalize
          ? "Trip creation could not be confirmed. Your saved trip and booking files have not been discarded. Retry safely, or reload to check whether creation completed."
          : "Your travel style could not be saved. Your selection is still here; retry before leaving.",
      };
    }
    if (
      !saved ||
      saved.id !== value.id ||
      typeof saved.draft_revision !== "number" ||
      (finalize && saved.creation_state !== "finalized")
    )
      return {
        error:
          "The save could not be confirmed. Retry safely to check this same trip; no new trip ID will be created.",
      };
    revalidatePath("/trips/new");
    if (finalize) revalidatePath("/", "layout");
    return {
      id: saved.id,
      revision: saved.draft_revision,
      style: travelStyleLabel(saved.style),
      theme: saved.theme || "Default",
      finalized: saved.creation_state === "finalized",
    };
  } catch {
    return {
      error:
        "The request could not be confirmed. Your saved trip data remains available. Retry safely or reload to check whether creation completed.",
    };
  }
}
export async function saveTripReview(input: unknown) {
  return review(input, false);
}
export async function finalizeTripDraft(input: unknown) {
  return review(input, true);
}
