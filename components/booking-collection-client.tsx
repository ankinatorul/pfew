"use client";
import { useRouter } from "next/navigation";
import { BookingCollection } from "./booking-collection";
import type { ComponentProps } from "react";
export function BookingCollectionClient(
  props: ComponentProps<typeof BookingCollection>,
) {
  const router = useRouter();
  return (
    <BookingCollection
      {...props}
      onRefresh={() => router.refresh()}
      onNavigate={(step) => {
        router.push(`/trips/new?draft=${props.trip.id}&step=${step}`);
        router.refresh();
      }}
    />
  );
}
