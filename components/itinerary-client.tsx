"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  changeItinerary,
  exploreItineraryIdeas,
} from "../app/itinerary-actions";
import { ItineraryView, type ItineraryProps } from "./itinerary-view";
import { tripSectionUrl } from "../lib/trip-navigation";
export function ItineraryClient(props: ItineraryProps) {
  const router = useRouter();
  return (
    <ItineraryView
      key={props.trip.id + ":" + (props.initialDay || "")}
      {...props}
      LinkComponent={Link}
      onDayChange={(day) =>
        router.replace(tripSectionUrl(props.trip.id, "itinerary", day), {
          scroll: false,
        })
      }
      mutate={async (command) => {
        const result = await changeItinerary(props.trip.id, command);
        if (!result.error) router.refresh();
        return result;
      }}
      explore={async (input) => {
        const result = await exploreItineraryIdeas(props.trip.id, input);
        if (!result.error) router.refresh();
        return result;
      }}
    />
  );
}
