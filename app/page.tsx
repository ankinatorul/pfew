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
export default async function Home() {
  const { db } = await access();
  const { data, error } = await db
    .from("trips")
    .select("*")
    .order("start_date");
  if (error)
    throw new Error("Trips could not be loaded. Check database configuration.");
  const trips = (data || []) as Trip[];
  const featured = nextTrip(trips);
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
              : `${departureCountdown(featured)} days until your next chapter`
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
      {featured && <HomeEssentials trip={featured} />}
      <div className="section-top">
        <h2>
          Your next chapters <span className="muted">({trips.length})</span>
        </h2>
        <span className="eyebrow">Made for your kind of travel</span>
      </div>
      {!trips.length ? (
        <div className="empty">
          <h2>A blank page. Endless possibility.</h2>
          <p>Start with dates and a name. The rest can come later.</p>
          <Link className="button primary" href="/trips/new">
            Create your first trip
          </Link>
        </div>
      ) : (
        <div className="grid">
          {trips.map((t, i) => (
            <Link
              key={t.id}
              className={"card " + ["lime", "pink", ""][i % 3]}
              href={"/trips/" + t.id}
            >
              <span className="pill">
                {lifecycle(t.start_date, t.end_date, t.timezone)}
              </span>
              <h2 style={{ marginTop: 35 }}>{t.name}</h2>
              <p>
                {t.start_date} → {t.end_date}
              </p>
              <div className="row">
                <small>
                  {t.travelers} traveler{t.travelers !== 1 ? "s" : ""} ·{" "}
                  {t.style}
                </small>
                <ArrowUpRight />
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
