"use client";
import { useState } from "react";
import Link from "next/link";
import { organizeTrips, type TripCard } from "../lib/trip-collection";
export function TripCollection({ trips }: { trips: TripCard[] }) {
  const [query, setQuery] = useState(""),
    [status, setStatus] = useState("all"),
    [relation, setRelation] = useState("all");
  const visible = organizeTrips(trips, query, status, relation);
  return (
    <section>
      <div className="section-top">
        <h2>
          Your trips <span className="muted">({trips.length})</span>
        </h2>
      </div>
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
      <p className="muted" role="status">
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
        <div className="grid">
          {visible.map((trip, index) => (
            <article
              className={"card " + ["lime", "pink", ""][index % 3]}
              key={trip.id}
            >
              <div className="row">
                <span className="pill">{trip.lifecycle}</span>
                <span className="muted">
                  {trip.shared ? "Shared with you" : "Your trip"}
                </span>
              </div>
              <h2>
                <Link href={"/trips/" + trip.id}>{trip.name}</Link>
              </h2>
              <p>
                {trip.start_date} → {trip.end_date}
              </p>
              <p className="muted">
                {trip.travelers} travelers · {trip.style}
              </p>
              <div className="actions">
                <Link className="button secondary" href={"/trips/" + trip.id}>
                  Open trip ↗
                </Link>
                <Link href={"/?trip=" + trip.id}>Show on Home</Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
