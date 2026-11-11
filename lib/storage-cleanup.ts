import type { SupabaseClient } from "@supabase/supabase-js";
export async function removeBookingFiles(
  db: SupabaseClient,
  trip: string,
  booking?: string,
  intake?: string,
) {
  for (;;) {
    let query = db
      .from("booking_attachments")
      .select("id,path")
      .eq("trip_id", trip)
      .limit(100);
    if (booking) query = query.eq("booking_id", booking);
    if (intake) query = query.eq("intake_id", intake).is("booking_id", null);
    const { data, error } = await query;
    if (error?.code === "PGRST205" || error?.code === "42P01") return null;
    if (error)
      return "Could not read attached files. Nothing else was deleted.";
    if (!data?.length) return null;
    const { error: removeError } = await db.storage
      .from("booking-files")
      .remove(data.map((f) => f.path));
    if (removeError)
      return "Could not finish removing attached files. Retry deletion to continue.";
    const { error: metadataError } = await db
      .from("booking_attachments")
      .delete()
      .in(
        "id",
        data.map((f) => f.id),
      )
      .eq("trip_id", trip);
    if (metadataError)
      return "Files were removed, but metadata cleanup failed. Retry deletion.";
  }
}
