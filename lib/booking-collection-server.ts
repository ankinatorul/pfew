import type { SupabaseClient } from "@supabase/supabase-js";
import {
  collectionEntries,
  collectionEntrySchema,
  type CollectionEntry,
  type CollectionAttachment,
} from "./booking-collection";

export const collectionSetupMessage =
  "Booking collection needs the reviewed draft/collection database updates. Nothing was saved.";
export async function loadBookingCollection(
  db: SupabaseClient,
  tripId: string,
) {
  const [intake, files, capability] = await Promise.all([
    db
      .from("trip_onboarding")
      .select("preferences")
      .eq("trip_id", tripId)
      .maybeSingle(),
    db
      .from("booking_attachments")
      .select("id,intake_id,filename,state,size")
      .eq("trip_id", tripId)
      .not("intake_id", "is", null),
    db.from("bookings").select("reservation_status").limit(0),
  ]);
  if (intake.error || files.error || capability.error)
    return {
      entries: [] as CollectionEntry[],
      attachments: [] as CollectionAttachment[],
      ready: false,
      error: collectionSetupMessage,
    };
  try {
    return {
      entries: collectionEntries(intake.data?.preferences),
      attachments: (files.data || []) as CollectionAttachment[],
      ready: true,
      error: "",
    };
  } catch (error) {
    return {
      entries: [] as CollectionEntry[],
      attachments: [] as CollectionAttachment[],
      ready: false,
      error:
        error instanceof Error
          ? error.message
          : "Saved booking drafts could not be read safely.",
    };
  }
}
export async function ownedCollection(
  db: SupabaseClient,
  userId: string,
  tripId: string,
) {
  const { data: trip, error } = await db
    .from("trips")
    .select("*")
    .eq("id", tripId)
    .eq("owner_id", userId)
    .maybeSingle();
  if (error || !trip) throw new Error("Trip owner access is required.");
  if (!["draft", "finalized"].includes(trip.creation_state))
    throw new Error(collectionSetupMessage);
  const collection = await loadBookingCollection(db, tripId);
  if (!collection.ready) throw new Error(collection.error);
  return { trip, ...collection };
}
export async function persistCollectionEntry(
  db: SupabaseClient,
  tripId: string,
  entry: CollectionEntry,
) {
  const { data, error } = await db.rpc("save_booking_intake", {
    target: tripId,
    item_id: entry.id,
    expected_revision: entry.revision,
    entry,
  });
  if (error)
    throw new Error(
      error.message.includes("another tab")
        ? "This booking changed in another tab. Reload before saving again."
        : error.message.includes("20 booking")
          ? "Collect up to 20 entries at a time."
          : "Your booking draft could not be saved. Your inputs are still here. Retry or reload to check the saved version.",
    );
  return collectionEntrySchema.parse(data);
}
