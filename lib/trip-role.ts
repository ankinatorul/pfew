import type { SupabaseClient } from "@supabase/supabase-js";
import type { Trip } from "./domain";
export type TripRole = "owner" | "editor" | "viewer";
export async function tripRole(
  db: SupabaseClient,
  trip: Trip,
  userId: string,
): Promise<TripRole> {
  if (trip.owner_id === userId) return "owner";
  const { data } = await db
    .from("trip_members")
    .select("role")
    .eq("trip_id", trip.id)
    .eq("user_id", userId)
    .maybeSingle();
  return data?.role === "editor" ? "editor" : "viewer";
}
