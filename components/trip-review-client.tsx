"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { TripReview, type TripReviewProps } from "./trip-review";
import { saveTripReview, finalizeTripDraft } from "../app/trip-review-actions";
import { rememberActiveTrip } from "../lib/active-trip-store";
import { clearLocalBasics } from "../lib/trip-draft-cache";
import { tripSectionUrl } from "../lib/trip-navigation";
export function TripReviewClient({
  userId,
  ...props
}: Omit<TripReviewProps, "save" | "finalize" | "onOpen" | "onNavigate"> & {
  userId: string;
}) {
  const router = useRouter();
  useEffect(() => {
    if (props.finalized) clearLocalBasics(userId, props.trip.id);
  }, [props.finalized, props.trip.id, userId]);
  return (
    <TripReview
      {...props}
      save={saveTripReview}
      finalize={async (input) => {
        const result = await finalizeTripDraft(input);
        if (!("error" in result) && result.finalized)
          clearLocalBasics(userId, result.id);
        return result;
      }}
      onNavigate={(step) => {
        router.push(`/trips/new?draft=${props.trip.id}&step=${step}`);
        router.refresh();
      }}
      onOpen={(id) => {
        // Invoked only after a server-confirmed finalized result or owner-scoped reload.
        clearLocalBasics(userId, id);
        rememberActiveTrip(userId, id);
        router.push(tripSectionUrl(id, "hub"));
        router.refresh();
      }}
    />
  );
}
