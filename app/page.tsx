import { TripCollection } from "../components/trip-collection";
import { HomeEssentials } from "../components/essentials/home";
export const dynamic = "force-dynamic";
import Link from "next/link";
import { access } from "../lib/access";
import {
  lifecycle,
  nextTrip,
  departureCountdown,
  type Trip,
} from "../lib/domain";
import { ArrowUpRight, Plane } from "lucide-react";
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ trip?: string }>;
}) {
  const { db, user } = await access();
  const query = await searchParams;
  const now = new Date();
  const { data, error } = await db
    .from("trips")
    .select("*")
    .order("start_date");
  if (error)
    throw new Error("Trips could not be loaded. Check database configuration.");
  const trips = (data || []) as Trip[];
  const featured =
    trips.find((trip) => trip.id === query.trip) || nextTrip(trips, now);
  return (
    <>
      <section className="hero">
        <span className="eyebrow">
          {featured
            ? lifecycle(
                featured.start_date,
                featured.end_date,
                featured.timezone,
              ) === "traveling"
              ? "Your current chapter"
              : lifecycle(
                    featured.start_date,
                    featured.end_date,
                    featured.timezone,
                    now,
                  ) === "past"
                ? "A chapter worth keeping"
                : `${departureCountdown(featured, now)} days until your next chapter`
            : "Your world, a little more organized"}
        </span>
        <h1>
          {featured ? (
            featured.name
          ) : (
            <>
              Oh, the places
              <br />
              you’ll go.
            </>
          )}
        </h1>
        <p>
          {featured
            ? `${featured.start_date} — ${featured.end_date} · ${featured.travelers} travelers · ${featured.style}`
            : "Big adventures. Little escapes. Keep all the moving pieces in one happy place."}
        </p>
        <div className="actions">
          <Link
            className="button primary"
            href={featured ? "/trips/" + featured.id : "/trips/new"}
          >
            {featured ? "Open my trip" : "Plan something good"}{" "}
            <ArrowUpRight size={17} />
          </Link>
          {featured && (
            <Link
              className="button secondary"
              href={"/trips/" + featured.id + "?view=itinerary"}
            >
              View itinerary
            </Link>
          )}
        </div>
        <Plane className="hero-mark" size={180} />
      </section>
      {trips.length > 1 && (
        <form action="/" method="get" className="home-trip-selector">
          <label>
            Show a trip on Home
            <select name="trip" defaultValue={featured?.id || ""}>
              <option value="">Choose a trip</option>
              {trips.map((trip) => (
                <option key={trip.id} value={trip.id}>
                  {trip.name} · {trip.start_date}
                </option>
              ))}
            </select>
          </label>
          <button className="button secondary">Show trip</button>
        </form>
      )}
      {featured && (
        <nav className="essentials-shortcuts" aria-label="Travel essentials">
          {[
            ["bookings", "Bookings"],
            ["prep", "Prep"],
            ["packing", "Packing"],
            ["budget", "Budget"],
          ].map(([view, label]) => (
            <Link
              key={view}
              className="button secondary"
              href={"/trips/" + featured.id + "?view=" + view}
            >
              {label} ↗
            </Link>
          ))}
        </nav>
      )}
      {featured && <HomeEssentials trip={featured} />}
      <TripCollection
        trips={trips.map((trip) => ({
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
    </>
  );
}
