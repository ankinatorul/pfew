import { cache } from "react";
import { supabase } from "./supabase";
import { finalizedTrips } from "./finalized-trips";
import { lifecycle, type Trip } from "./domain";
import type { TripCard } from "./trip-collection";

// Called only with the verified session's ID. RLS remains the access boundary.
export const shellTrips = cache(
  async (
    userId: string,
  ): Promise<{ trips: TripCard[]; unavailable: boolean }> => {
    try {
      const db = await supabase();
      const { data, error } = await finalizedTrips(db, "id,name,start_date,end_date,timezone,travelers,style,owner_id");
      if (error) return { trips: [], unavailable: true };
      const now = new Date();
      return {
        trips: ((data || []) as Trip[]).map((trip) => ({
          id: trip.id,
          name: trip.name,
          start_date: trip.start_date,
          end_date: trip.end_date,
          timezone: trip.timezone,
          travelers: trip.travelers,
          style: trip.style,
          shared: trip.owner_id !== userId,
          lifecycle: lifecycle(
            trip.start_date,
            trip.end_date,
            trip.timezone,
            now,
          ),
        })),
        unavailable: false,
      };
    } catch {
      return { trips: [], unavailable: true };
    }
  },
);
