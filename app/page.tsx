import { TripCollection } from "../components/trip-collection";
import { HomeEssentials } from "../components/essentials/home";
import { HomeView } from "../components/home-view";
import Link from "next/link";
import { finalizedTrips } from "../lib/finalized-trips";
import { access } from "../lib/access";
import { accountProfile } from "../lib/account-profile";
import {
  lifecycle,
  nextTrip,
  departureCountdown,
  type Trip,
} from "../lib/domain";
export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ trip?: string }>;
}) {
  const { db, user } = await access();
  const query = await searchParams;
  const now = new Date();
  const { data, error } = await finalizedTrips(db);
  if (error)
    throw new Error("Trips could not be loaded. Check database configuration.");
  const trips = (data || []) as Trip[];
  const featured =
    trips.find((trip) => trip.id === query.trip) ||
    nextTrip(trips, now) ||
    trips.at(-1) ||
    null;
  const stage = featured
    ? lifecycle(featured.start_date, featured.end_date, featured.timezone, now)
    : null;
  const otherTrips = trips.filter((trip) => trip.id !== featured?.id);
  return (
    <HomeView
      firstName={accountProfile(user).name.split(/\s+/)[0]}
      trip={featured}
      stage={stage}
      countdown={featured ? departureCountdown(featured, now) : 0}
      LinkComponent={Link}
    >
      {featured && <HomeEssentials trip={featured} />}
      {otherTrips.length > 0 && (
        <TripCollection
          compact
          trips={otherTrips.map((trip) => ({
            id: trip.id,
            name: trip.name,
            start_date: trip.start_date,
            end_date: trip.end_date,
            timezone: trip.timezone,
            travelers: trip.travelers,
            style: trip.style,
            shared: trip.owner_id !== user.id,
            lifecycle: lifecycle(
              trip.start_date,
              trip.end_date,
              trip.timezone,
              now,
            ),
          }))}
        />
      )}
      {featured && !otherTrips.length && (
        <p className="home-more-adventures">
          One adventure at a time.{" "}
          <Link href="/trips">
            View all your trips <span aria-hidden="true">→</span>
          </Link>
        </p>
      )}
    </HomeView>
  );
}
