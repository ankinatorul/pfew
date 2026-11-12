import type { SupabaseClient } from "@supabase/supabase-js";
export async function removePrivateDocument(
  db: SupabaseClient,
  trip: string,
  id: string,
  options: { tripOnly?: boolean; revision?: number } = {},
) {
  const { data, error } = await db
    .from("booking_attachments")
    .select("*")
    .eq("id", id)
    .eq("trip_id", trip)
    .single();
  if (error || !data) return "Private document unavailable.";
  if (options.tripOnly && data.document_kind !== "trip")
    return "Booking files can only be hidden here. The confirmation was not deleted.";
  if (
    options.revision !== undefined &&
    data.document_revision !== options.revision
  )
    return "Document changed. Reload before removing.";
  const { error: storageError } = await db.storage
    .from("booking-files")
    .remove([data.path]);
  if (storageError) return "Could not remove the file. Retry when connected.";
  let query = db
    .from("booking_attachments")
    .delete()
    .eq("id", id)
    .eq("trip_id", trip);
  if (options.revision !== undefined)
    query = query.eq("document_revision", options.revision);
  const { error: metadataError } = await query.select("id").single();
  if (metadataError)
    return "File removal started, but metadata changed or could not be cleared. Reload and retry cleanup.";
  return null;
}
