import type { supabase } from "./supabase";
import type { Trip } from "./domain";
import { missingDraftSchema } from "./trip-drafts";
type DB = Awaited<ReturnType<typeof supabase>>;
export async function finalizedTrips(db: DB, columns = "*") {
  let result = await db
    .from("trips")
    .select(columns === "*" ? "*" : columns + ",creation_state")
    .eq("creation_state", "finalized")
    .order("start_date");
  if (missingDraftSchema(result.error))
    result = await db.from("trips").select(columns).order("start_date");
  return {
    error: result.error,
    data: (result.data || [])
      .filter((row) => (row as unknown as Trip).creation_state !== "draft")
      .map((row) => displayTrip(row as unknown as Trip)),
  };
}
// SQL retains NULL. Empty values are only the legacy presentation/form boundary,
// never invented dates and never written back by the new draft action.
export function displayTrip(row: Trip): Trip {
  return {
    ...row,
    start_date: row.start_date || "",
    end_date: row.end_date || "",
  };
}
