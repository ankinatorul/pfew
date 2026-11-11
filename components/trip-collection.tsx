"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, SlidersHorizontal } from "lucide-react";
import { tripDateLabel } from "../lib/domain";
import { Delete } from "./forms";
import { HomeTripsView } from "./home-view";
import { organizeTrips, type TripCard } from "../lib/trip-collection";
export function TripCollection({
  trips,
  compact = false,
}: {
  trips: TripCard[];
  compact?: boolean;
}) {
  const [query, setQuery] = useState(""),
    [status, setStatus] = useState("all"),
    [relation, setRelation] = useState("all");
  const visible = organizeTrips(trips, query, status, relation);
  if (compact)
    return <HomeTripsView trips={visible.slice(0, 2)} LinkComponent={Link} />;
  return (
    <section className="home-trips">
      <div className="section-top">
        <h2>
          Your trips <span className="muted">({trips.length})</span>
        </h2>
      </div>
      <details className="home-filter-disclosure">
        <summary>
          <SlidersHorizontal size={16} aria-hidden="true" /> Search &amp; filter
          trips
          {(query || status !== "all" || relation !== "all") &&
            " · Filters active"}
        </summary>
        <div className="trip-filters">
          <label>
            Search trips by name
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a trip…"
              maxLength={120}
            />
          </label>
          <label>
            Trip stage
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="all">All stages</option>
              <option value="traveling">Traveling now</option>
              <option value="upcoming">Upcoming</option>
              <option value="past">Past trips</option>
              <option value="unknown">Dates not set</option>
            </select>
          </label>
          <label>
            Trip access
            <select
              value={relation}
              onChange={(event) => setRelation(event.target.value)}
            >
              <option value="all">All your trips</option>
              <option value="owned">Owned by you</option>
              <option value="shared">Shared with you</option>
            </select>
          </label>
        </div>
      </details>
      <p className="muted home-trip-count" role="status">
        {visible.length} of {trips.length} trips shown.
      </p>
      {!trips.length ? (
        <div className="empty">
          <h2>A blank page. Endless possibility.</h2>
          <p>Start with dates and a name. The rest can come later.</p>
          <Link className="button primary" href="/trips/new">
            Create your first trip
          </Link>
        </div>
      ) : !visible.length ? (
        <div className="empty">
          <p>No trips match these filters.</p>
          <button
            className="button secondary"
            onClick={() => {
              setQuery("");
              setStatus("all");
              setRelation("all");
            }}
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="home-trip-list">
          {visible.map((trip) => (
            <article className="home-trip-row" key={trip.id}>
              <Link className="home-trip-main" href={"/trips/" + trip.id}>
                <div>
                  <span className="home-trip-stage">
                    {trip.lifecycle === "traveling"
                      ? "Traveling now"
                      : trip.lifecycle === "past"
                        ? "Past trip"
                        : trip.lifecycle === "unknown" ? "Dates not set" : "Upcoming"}
                    {trip.shared ? " · Shared with you" : ""}
                  </span>
                  <h3>{trip.name}</h3>
                  <p className="muted">
                    {tripDateLabel(trip.start_date, trip.end_date)}
                  </p>
                </div>
                <ArrowUpRight size={20} aria-hidden="true" />
              </Link>
              <details className="home-trip-options">
                <summary aria-label={"Options for " + trip.name}>
                  Options
                </summary>
                <div className="actions">
                  <Link className="home-text-link" href={"/?trip=" + trip.id}>
                    Feature on Home
                  </Link>
                  {!trip.shared && <Delete id={trip.id} />}
                </div>
              </details>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
