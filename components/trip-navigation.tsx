"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TripNavigationView } from "./trip-navigation-view";
export function TripNavigation(props: {
  tripId: string;
  view: string;
  day: string;
  owner: boolean;
}) {
  const router = useRouter();
  return (
    <TripNavigationView
      {...props}
      LinkComponent={Link}
      onNavigate={(url) => router.push(url)}
    />
  );
}
