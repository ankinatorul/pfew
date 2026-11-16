import type { SupabaseClient } from "@supabase/supabase-js";
import type { Trip } from "./domain";
export type TripRole = "owner" | "editor" | "viewer";
export async function tripRole(
  db: SupabaseClient,
  trip: Trip,
  userId: string,
): Promise<TripRole> {
  if (trip.owner_id === userId) return "owner";
  let { data, error } = await db
    .from("trip_members")
    .select("role,revoked_at")
    .eq("trip_id", trip.id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error && ["42703", "PGRST204"].includes(error.code))
    ({ data, error } = await db
      .from("trip_members")
      .select("role")
      .eq("trip_id", trip.id)
      .eq("user_id", userId)
      .maybeSingle());
  if (error || data?.revoked_at) return "viewer";
  return data?.role === "editor" ? "editor" : "viewer";
}
