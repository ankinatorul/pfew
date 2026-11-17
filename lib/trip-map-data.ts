import type { SupabaseClient } from "@supabase/supabase-js";
import type { Trip, Segment } from "./domain";
import type { Booking } from "./essentials";
import { tripMapData, type SavedMapPlace } from "./trip-map";
// Call only after the trip itself was authorized using the session/RLS client.
// No attachments, file URLs, secrets, booking notes or references are requested.
export async function loadTripMapData(
  db: SupabaseClient,
  trip: Trip,
  segments: Segment[],
  existingBookings?: Booking[] | null,
) {
  const [bookings, places] = await Promise.all([
    existingBookings !== undefined
      ? Promise.resolve({
          data: existingBookings,
          error: existingBookings === null ? { message: "Unavailable" } : null,
        })
      : db
          .from("bookings")
          .select(
            "id,segment_id,title,category,start_date,end_date,location_id,latitude,longitude,end_location_id,end_latitude,end_longitude,destination",
          )
          .eq("trip_id", trip.id),
    db
      .from("saved_places")
      .select("id,title,category,location_id,latitude,longitude")
      .eq("trip_id", trip.id),
  ]);
  return tripMapData(
    trip,
    segments,
    (bookings.error ? [] : bookings.data || []) as Booking[],
    (places.error ? [] : places.data || []) as SavedMapPlace[],
    [
      ...(bookings.error ? ["Bookings"] : []),
      ...(places.error ? ["Saved places"] : []),
    ],
  );
}
