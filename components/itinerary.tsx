import { access } from "../lib/access";
import type { Trip, Segment } from "../lib/domain";
import type { Booking } from "../lib/essentials";
import { collectionCounts, collectionEntries } from "../lib/booking-collection";
import { ItineraryClient } from "./itinerary-client";
import type { ItineraryIdea } from "../lib/itinerary";
export async function Itinerary({
  trip,
  segments,
  canEdit,
  day,
  explore = false,
}: {
  trip: Trip;
  segments: Segment[];
  canEdit: boolean;
  day?: string;
  explore?: boolean;
}) {
  const { db } = await access();
  const [bookings, ideas, capability, onboarding] = await Promise.all([
    db.from("bookings").select("*").eq("trip_id", trip.id).order("start_date"),
    db
      .from("ai_suggestions")
      .select("*")
      .eq("trip_id", trip.id)
      .order("created_at", { ascending: false }),
    db
      .from("trip_segments")
      .select(
        "itinerary_revision,activity_category,completed_at,destination_location_id",
      )
      .eq("trip_id", trip.id)
      .limit(0),
    db
      .from("trip_onboarding")
      .select("preferences")
      .eq("trip_id", trip.id)
      .maybeSingle(),
  ]);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: trip.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return (
    <ItineraryClient
      trip={trip}
      segments={segments}
      bookings={(bookings.data || []) as Booking[]}
      ideas={(ideas.data || []) as ItineraryIdea[]}
      canEdit={canEdit}
      ready={!capability.error}
      live={process.env.AI_MODE === "live" && Boolean(process.env.AI_API_KEY)}
      pendingBookings={
        collectionCounts(collectionEntries(onboarding.data?.preferences))
          .unfinished
      }
      today={today}
      initialDay={day}
      initialExplore={explore}
      loadError={
        bookings.error || ideas.error || onboarding.error
          ? "Some saved bookings or ideas could not be loaded. Reload before editing your plan."
          : undefined
      }
    />
  );
}
