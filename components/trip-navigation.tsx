import Link from "next/link";
import { TripNavigationView } from "./trip-navigation-view";
export function TripNavigation(props: {
  tripId: string;
  view: string;
  day: string;
  owner: boolean;
}) {
  return <TripNavigationView {...props} LinkComponent={Link} />;
}
