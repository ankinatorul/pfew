import type { ElementType, ReactNode } from "react";
import {
  ArrowRight,
  Backpack,
  Check,
  Files,
  Luggage,
  Plane,
  Plus,
} from "lucide-react";
import { tripDateLabel } from "../lib/domain";
import type { Trip } from "../lib/domain";
import type { TripCard } from "../lib/trip-collection";
import type { HomeSummary } from "../lib/home-summary";

function dateLabel(date: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(date + "T12:00:00Z"));
}


export function HomeView({
  firstName,
  trip,
  stage,
  countdown,
  children,
  LinkComponent = "a",
}: {
  firstName: string;
  trip: Trip | null;
  stage: "upcoming" | "traveling" | "past" | "unknown" | null;
  countdown: number;
  children?: ReactNode;
  LinkComponent?: ElementType;
}) {
  return (
    <div className="home-page home-hq">
      <section className="home-welcome" aria-labelledby="home-title">
        <p className="home-greeting">
          Hello, {firstName}! <span aria-hidden="true">👋</span>
        </p>
        <h1 id="home-title">
          Less oh no.
          <br />
          More let’s go.
        </h1>
        <p className="home-welcome-copy">
          Your personal travel HQ. Plan, prepare and keep everything in one
          happy place.
        </p>
        <LinkComponent className="home-create-button" href="/trips/new">
          Create a trip <Plus size={17} aria-hidden="true" />
        </LinkComponent>
      </section>
      {trip ? (
        <LinkComponent
          className="home-featured-trip"
          href={"/trips/" + trip.id}
          aria-label={"Open trip: " + trip.name}
        >
          <span className="home-trip-icon" aria-hidden="true">
            <Luggage size={28} strokeWidth={1.6} />
          </span>
          <div className="home-featured-info">
            <p className="home-kicker">
              {stage === "traveling"
                ? "Your adventure, underway"
                : stage === "past"
                  ? "A trip to remember"
                  : stage === "unknown" ? "Your saved adventure" : "Your next adventure"}
            </p>
            <h2>{trip.name}</h2>
            <p className="home-trip-dates">
              {tripDateLabel(trip.start_date, trip.end_date)}
            </p>
            <span className="home-stage-pill">
              {stage === "traveling"
                ? "Traveling now"
                : stage === "past"
                  ? "Past trip"
                  : stage === "unknown" ? "Dates not set" : countdown === 1
                    ? "Tomorrow"
                    : `${countdown} days to go`}
            </span>
          </div>
          <span className="home-open-trip">
            Open trip{" "}
            <span className="home-round-arrow">
              <ArrowRight size={20} aria-hidden="true" />
            </span>
          </span>
        </LinkComponent>
      ) : (
        <p className="home-first-trip">
          Your next adventure starts with a name and a few dates. Your saved
          plans will be right here.
        </p>
      )}
      {children}
    </div>
  );
}

export function HomeTripsView({
  trips,
  LinkComponent = "a",
}: {
  trips: TripCard[];
  LinkComponent?: ElementType;
}) {
  return (
    <section className="home-trips home-other-trips">
      <div className="section-top">
        <h2>Other trips</h2>
        <LinkComponent className="home-text-link" href="/trips">
          View all <ArrowRight size={15} aria-hidden="true" />
        </LinkComponent>
      </div>
      <div className="home-trip-list">
        {trips.map((trip) => (
          <article className="home-trip-row" key={trip.id}>
            <LinkComponent
              className="home-trip-main"
              href={"/trips/" + trip.id}
            >
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
              <ArrowRight size={18} aria-hidden="true" />
            </LinkComponent>
          </article>
        ))}
      </div>
    </section>
  );
}

export function HomeEssentialsView({
  summary,
  traveling,
  LinkComponent = "a",
}: {
  summary: HomeSummary;
  traveling: boolean;
  LinkComponent?: ElementType;
}) {
  const {
    prep,
    destination,
    next,
    nextBooking,
    packing,
    documents,
    todayItems,
  } = summary;
  const base = "/trips/" + summary.tripId;
  const packingPercent = packing?.total
    ? Math.round((packing.packed / packing.total) * 100)
    : 0;
  return (
    <>
      <section className="home-summary-grid" aria-label="Trip essentials">
        <LinkComponent
          className="home-summary-card"
          href={base + "?view=bookings"}
        >
          <span
            className="home-summary-icon home-icon-cobalt"
            aria-hidden="true"
          >
            <Plane size={20} />
          </span>
          <h3>Next booking</h3>
          <p>{nextBooking?.title || "No upcoming bookings"}</p>
          <small>
            {nextBooking ? dateLabel(nextBooking.day) : "Add your reservations"}
          </small>
        </LinkComponent>
        <LinkComponent
          className="home-summary-card"
          href={base + "?view=packing"}
        >
          <span
            className="home-summary-icon home-icon-orange"
            aria-hidden="true"
          >
            <Backpack size={20} />
          </span>
          <h3>Packing</h3>
          <p>
            {packing
              ? packing.total
                ? `${packingPercent}% packed`
                : "No items yet"
              : "Summary unavailable"}
          </p>
          {packing && packing.total > 0 ? (
            <>
              <progress
                aria-label="Packing progress"
                value={packing.packed}
                max={packing.total}
              />
              <small>
                {packing.packed} of {packing.total} items packed
              </small>
            </>
          ) : (
            <small>
              {packing ? "Start your packing list" : "Open your packing list"}
            </small>
          )}
        </LinkComponent>
        <LinkComponent
          className="home-summary-card"
          href={base + "?view=documents"}
        >
          <span
            className="home-summary-icon home-icon-lavender"
            aria-hidden="true"
          >
            <Files size={20} />
          </span>
          <h3>Documents</h3>
          <p>
            {documents
              ? `${documents.ready} private ${documents.ready === 1 ? "file" : "files"}`
              : "Summary unavailable"}
          </p>
          <small>
            {documents?.pending
              ? `${documents.pending} incomplete ${documents.pending === 1 ? "upload" : "uploads"}`
              : documents?.ready
                ? "Only visible to you"
                : "Keep your files together"}
          </small>
        </LinkComponent>
      </section>
      <section
        className="home-context"
        aria-label={traveling ? "Today’s saved plans" : "Before you go"}
      >
        {(traveling || prep.total > 0) && (
          <article className="home-focus-card home-priority-card">
            <div className="home-card-heading">
              <span className="home-kicker">
                {traveling
                  ? `Today${destination.dayNumber > 0 ? ` · Day ${destination.dayNumber}` : ""}`
                  : "Before you go"}
              </span>
              <span className="home-status-icon" aria-hidden="true">
                {traveling ? <Plane size={18} /> : <Check size={18} />}
              </span>
            </div>
            <h2>
              {traveling
                ? destination.destination?.title || "Your day, at a glance"
                : `${prep.completed} of ${prep.total} prep tasks done`}
            </h2>
            {traveling ? (
              <>
                <p className="home-detail">
                  {dateLabel(destination.today)} · {destination.timezone}
                </p>
                {todayItems.length ? (
                  <ul className="home-agenda">
                    {todayItems.map((item) => (
                      <li key={item.id}>
                        <span className="home-agenda-time">
                          {item.local_time
                            ? `${item.local_time} · ${item.timezone}`
                            : "Flexible"}
                        </span>
                        <span>{item.title}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="home-detail">
                    No activities saved for today. There’s room to explore.
                  </p>
                )}
              </>
            ) : (
              <>
                <progress
                  aria-label="Preparation progress"
                  value={prep.completed}
                  max={prep.total || 1}
                />
                {prep.due.length ? (
                  <ul className="home-prep-list">
                    {prep.due.slice(0, 2).map((task) => (
                      <li key={task.id}>
                        <span className="home-task-dot" aria-hidden="true" />
                        <span>
                          {task.title}
                          <small>
                            {String(task.due_date) < prep.today
                              ? "Overdue · "
                              : "Due "}
                            {dateLabel(String(task.due_date))}
                          </small>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="home-detail">
                    No dated tasks due in the next week.
                  </p>
                )}
              </>
            )}
            <LinkComponent
              className="home-text-link"
              href={
                base +
                (traveling
                  ? "?view=itinerary&day=" + summary.day
                  : "?view=prep")
              }
            >
              {traveling
                ? "View today"
                : prep.due.length > 2
                  ? `Review prep · ${prep.due.length} due`
                  : "Review prep"}
              <ArrowRight size={16} aria-hidden="true" />
            </LinkComponent>
          </article>
        )}
        {!traveling && prep.total === 0 && (
          <article className="home-focus-card home-priority-card">
            <span className="home-kicker">Before you go</span>
            <h2>Start your prep checklist</h2>
            <p className="home-detail">
              Review optional checklist starters and choose what matters for
              your trip.
            </p>
            <LinkComponent
              className="home-text-link"
              href={base + "?view=prep"}
            >
              Review prep <ArrowRight size={16} aria-hidden="true" />
            </LinkComponent>
          </article>
        )}
        {next && (
          <article className="home-focus-card home-next-card">
            <span className="home-kicker">Up next</span>
            <h2>{next.title}</h2>
            <p className="home-detail">
              {dateLabel(next.day)} ·{" "}
              {next.state === "time needed"
                ? next.time
                  ? "Time needs checking"
                  : "Time not entered"
                : next.time}{" "}
              · {next.timezone}
            </p>
            <p className="home-detail">
              {next.state === "underway"
                ? "Underway in your saved schedule"
                : "From your saved plans"}{" "}
              · {next.status}
            </p>
            <LinkComponent
              className="home-text-link"
              href={
                base +
                (next.source === "booking"
                  ? "?view=bookings"
                  : "?view=itinerary&day=" + next.day)
              }
            >
              View details
              <ArrowRight size={16} aria-hidden="true" />
            </LinkComponent>
          </article>
        )}
      </section>
    </>
  );
}
