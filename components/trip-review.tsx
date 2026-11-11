"use client";
import { useRef, useState } from "react";
import { Check, ArrowRight } from "lucide-react";
import { useCreationFocus } from "../lib/use-creation-focus";
import { CreationProgress } from "./trip-basics";
import {
  travelStyles,
  travelStyleLabel,
  type TravelStyle,
} from "../lib/trip-style";
import { automaticTripTheme } from "../lib/trip-theme";
import {
  bookingReviewStamp,
  type ReviewInput,
  type ReviewResult,
} from "../lib/trip-review";
import {
  collectionCounts,
  type CollectionEntry,
} from "../lib/booking-collection";
import type { TripBasics } from "../lib/trip-drafts";
import type { Trip } from "../lib/domain";
export type TripReviewProps = {
  trip: Trip;
  basics: TripBasics;
  revision: number;
  entries: CollectionEntry[];
  ready: boolean;
  setupError?: string;
  finalized?: boolean;
  save: (input: ReviewInput) => Promise<ReviewResult>;
  finalize: (input: ReviewInput) => Promise<ReviewResult>;
  onNavigate: (step: 1 | 2) => void;
  onOpen: (id: string) => void;
};
export function TripReview(props: TripReviewProps) {
  const [style, setStyle] = useState<TravelStyle>(
    travelStyleLabel(props.trip.style),
  );
  const [revision, setRevision] = useState(props.revision),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [created, setCreated] = useState(props.finalized || false);
  const [createdTheme, setCreatedTheme] = useState(
    props.trip.theme || "Default",
  );
  const running = useRef(false);
  const { headingRef, errorRef } = useCreationFocus(
    created ? "success" : "review",
    error,
    busy,
  );
  const counts = collectionCounts(props.entries),
    theme = automaticTripTheme(props.basics.name, props.basics.destinations);
  const input = (selected = style): ReviewInput => ({
    id: props.trip.id,
    revision,
    style: selected,
    bookings: bookingReviewStamp(props.entries),
  });
  async function perform(operation: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      await operation();
    } catch {
      setError(
        "The request could not be confirmed. Your saved trip data remains available. Retry safely or reload to check whether creation completed.",
      );
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  async function persist(selected = style) {
    const result = await props.save(input(selected));
    if ("error" in result) {
      setError(result.error);
      return false;
    }
    setRevision(result.revision);
    setStyle(result.style);
    setDirty(false);
    return true;
  }
  if (created)
    return (
      <section className="trip-created" aria-labelledby="trip-created-title">
        <div className="trip-created-icon" aria-hidden="true">
          <Check size={30} />
        </div>
        <span className="eyebrow">Trip created</span>
        <h1 ref={headingRef} tabIndex={-1} id="trip-created-title">
          Your adventure starts here!
        </h1>
        <p>Your trip is ready. Let’s make it unforgettable.</p>
        <div className="create-card">
          <h2>{props.basics.name}</h2>
          <p>{props.basics.destinations.map((d) => d.label).join(" → ")}</p>
          <p>
            {props.basics.start_date} – {props.basics.end_date}
          </p>
          <p>
            {style} travel style · {createdTheme} theme
          </p>
          <p>
            Any saved bookings stay in Bookings, including unfinished reviews.
          </p>
        </div>
        <button
          type="button"
          className="button primary"
          onClick={() => props.onOpen(props.trip.id)}
        >
          Open my trip <ArrowRight size={16} aria-hidden="true" />
        </button>
      </section>
    );
  return (
    <div className="trip-review">
      <CreationProgress step={3} />
      <header className="create-intro">
        <span className="eyebrow">Step 3 of 3</span>
        <h1 ref={headingRef} tabIndex={-1}>
          Make it your kind of trip.
        </h1>
        <p>
          Choose your travel style, check the details, and you’re ready to go.
        </p>
      </header>
      {!props.ready && (
        <p className="create-notice" role="status">
          {props.setupError ||
            "Trip creation needs the reviewed migrations in a separate development database. Nothing was applied to the live project."}
        </p>
      )}
      <fieldset
        className="review-styles"
        disabled={!props.ready}
        aria-busy={busy}
      >
        <legend>How do you like to travel?</legend>
        {travelStyles.map((option) => (
          <label
            className={
              "review-style" + (style === option.value ? " selected" : "")
            }
            key={option.value}
          >
            <input
              type="radio"
              name="travel_style"
              value={option.value}
              checked={style === option.value}
              aria-disabled={busy}
              onChange={() => {
                if (running.current || option.value === style) return;
                setStyle(option.value);
                setDirty(true);
                void perform(async () => {
                  await persist(option.value);
                });
              }}
            />
            <span>
              <strong>{option.value}</strong>
              <span>{option.description}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <p className="muted" role="status">
        {busy
          ? "Saving your changes…"
          : dirty
            ? "Your selection has unsaved changes. Create my trip will retry saving it."
            : "Travel style saved. You can change it later in Edit trip."}{" "}
        Choosing a style won’t set or change your budget.
      </p>
      <div className="review-grid">
        <section
          className="create-card review-basics"
          aria-labelledby="review-basics-title"
        >
          <div className="section-top">
            <h2 id="review-basics-title">Your trip, at a glance</h2>
            <button
              type="button"
              className="review-edit"
              disabled={busy}
              onClick={() =>
                void perform(async () => {
                  if (!dirty || (await persist())) props.onNavigate(1);
                })
              }
            >
              Edit trip basics
            </button>
          </div>
          <h3>{props.basics.name}</h3>
          <ol className="review-destinations">
            {props.basics.destinations.map((d, i) => (
              <li key={i}>{d.label}</li>
            ))}
          </ol>
          <dl>
            <div>
              <dt>Start date</dt>
              <dd>{props.basics.start_date}</dd>
            </div>
            <div>
              <dt>End date</dt>
              <dd>{props.basics.end_date}</dd>
            </div>
            <div>
              <dt>Travel style</dt>
              <dd>{style}</dd>
            </div>
          </dl>
          <p className="muted">
            Destinations stay in this order. Individual stop dates have not been
            assigned.
          </p>
        </section>
        <section
          className="create-card"
          aria-labelledby="review-bookings-title"
        >
          <div className="section-top">
            <h2 id="review-bookings-title">Bookings</h2>
            <button
              className="review-edit"
              type="button"
              disabled={busy}
              onClick={() =>
                void perform(async () => {
                  if (!dirty || (await persist())) props.onNavigate(2);
                })
              }
            >
              Edit bookings
            </button>
          </div>
          <p>
            {counts.reviewed} reviewed · {counts.unfinished} need review
          </p>
          {props.entries.length ? (
            <ul className="review-bookings">
              {props.entries.map((entry) => (
                <li key={entry.id}>
                  <strong>
                    {String(
                      entry.fields.title ||
                        entry.fields.provider ||
                        entry.source?.filename ||
                        "Booking details",
                    )}
                  </strong>
                  <span>
                    {entry.review_status === "reviewed"
                      ? "Reviewed"
                      : "Needs review"}{" "}
                    · Reservation: {entry.reservation_status}
                  </span>
                  {entry.fields.start_date && (
                    <span>
                      {String(entry.fields.start_date)}
                      {entry.fields.end_date
                        ? ` – ${entry.fields.end_date}`
                        : ""}
                    </span>
                  )}
                  {entry.source && <span>Source: {entry.source.filename}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p>No bookings added. You can add them after creating your trip.</p>
          )}
          <p className="muted">
            Unfinished entries and saved originals stay available in Bookings.
            Reviewing details does not confirm a reservation.
          </p>
        </section>
      </div>
      <section className="create-card review-theme">
        <span className="pill">{theme.theme} theme</span>
        <div>
          <h2>A little destination character, chosen for you.</h2>
          <p>
            {theme.theme === "Default"
              ? "We’ll keep things versatile while your plans take shape."
              : "Chosen from your trip name and destinations."}{" "}
            Your theme stays the same after creation.
          </p>
        </div>
      </section>
      {error && (
        <p ref={errorRef} tabIndex={-1} className="create-error" role="alert">
          {error}{" "}
          <button
            type="button"
            className="review-edit"
            onClick={() => window.location.reload()}
          >
            Reload saved review
          </button>
        </p>
      )}
      <footer className="create-footer">
        <button
          className="button secondary"
          disabled={busy}
          onClick={() =>
            void perform(async () => {
              if (!dirty || (await persist())) props.onNavigate(2);
            })
          }
        >
          Back to Add Bookings
        </button>
        <button
          type="button"
          className="button primary"
          disabled={busy || !props.ready}
          onClick={() =>
            void perform(async () => {
              const result = await props.finalize(input());
              if ("error" in result) {
                setError(result.error);
                return;
              }
              if (!result.finalized) {
                setError(
                  "Trip creation was not confirmed. Your draft is still saved; retry safely.",
                );
                return;
              }
              setStyle(result.style);
              setCreatedTheme(result.theme);
              setDirty(false);
              setCreated(true);
            })
          }
        >
          {busy ? "Saving…" : "Create my trip"}
        </button>
      </footer>
    </div>
  );
}
