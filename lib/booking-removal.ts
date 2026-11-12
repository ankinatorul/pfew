import type { SupabaseClient } from "@supabase/supabase-js";
import { removeBookingFiles } from "./storage-cleanup";
// Reused by both the existing generic action and the Phase 9 interface.
export async function prepareBookingRemoval(
  db: SupabaseClient,
  trip: string,
  id: string,
) {
  const { data: canEdit, error: permissionError } = await db.rpc(
    "can_edit_trip",
    { target: trip },
  );
  if (permissionError || !canEdit) return "Editing permission required.";
  const { data: otherFiles, error } = await db.rpc("has_other_private_files", {
    target: trip,
    booking: id,
  });
  if (error) return "Could not check private documents.";
  if (otherFiles)
    return "Other travelers have private documents attached. They can remove those files from their own account before the booking is deleted.";
  return removeBookingFiles(db, trip, id);
}
