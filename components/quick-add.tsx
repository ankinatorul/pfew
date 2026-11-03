"use client";
import { useState, useActionState } from "react";
import Link from "next/link";
import type { Trip, Segment } from "../lib/domain";
import { days } from "../lib/domain";
import {
  inspectQuickInput,
  parseMapsLink,
  mapsLinkForPlace,
} from "../lib/maps-link";
import { placeSchema, type PlaceResult } from "../lib/discovery-types";
import { quickAdd } from "../app/planning-actions";
import type { PlanningState } from "../lib/planning-types";
import { useOnline } from "./essentials/online";
import { Button } from "./button";
type Preview = ReturnType<typeof inspectQuickInput> & {
  id: string;
  original: string;
};
function QuickReview({
  trip,
  destinations,
  preview,
  livePlaces,
  day,
  onDiscard,
}: {
  trip: Trip;
  destinations: Segment[];
  preview: Preview;
  livePlaces: boolean;
  day: string;
  onDiscard: () => void;
}) {
  const online = useOnline();
  const [state, save, pending] = useActionState(quickAdd, {} as PlanningState),
    [mode, setMode] = useState("idea"),
    [kind, setKind] = useState("activity"),
    [title, setTitle] = useState(preview.title),
    [address, setAddress] = useState(preview.address),
    [link, setLink] = useState(preview.maps?.url || ""),
    [placeId, setPlaceId] = useState(preview.maps?.placeId || ""),
    [results, setResults] = useState<PlaceResult[]>([]),
    [loading, setLoading] = useState(false),
    [lookupError, setLookupError] = useState("");
  async function lookup() {
    setLoading(true);
    setLookupError("");
    try {
      const id = parseMapsLink(link)?.placeId;
      const response = await fetch(id ? "/api/quick-place" : "/api/discovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          id
            ? { trip_id: trip.id, place_id: id }
            : { trip_id: trip.id, query: title },
        ),
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Lookup unavailable.");
      setResults(
        id
          ? [placeSchema.parse(data.result)]
          : placeSchema.array().parse(data.results),
      );
    } catch (error) {
      setLookupError(
        error instanceof Error ? error.message : "Lookup unavailable.",
      );
    } finally {
      setLoading(false);
    }
  }
  if (state.savedId)
    return (
      <section className="card lime" role="status">
        <h2>{mode === "idea" ? "Saved to Ideas." : "Added to your day."}</h2>
        <p>{title}</p>
        <div className="actions">
          <Link
            className="button primary"
            href={"/trips/" + trip.id + "?view=" + state.view}
          >
            Open {mode === "idea" ? "Ideas" : "itinerary"} ↗
          </Link>
          <Button variant="secondary" onClick={onDiscard}>
            Add another
          </Button>
        </div>
      </section>
    );
  return (
    <section className="card">
      <span className="eyebrow">Quick Add · review before saving</span>
      <h2>A little room for this.</h2>
      {preview.maps && (
        <p className="muted">
          {preview.maps.short
            ? "This shortened Google Maps link has not been expanded. Give it your own label."
            : "This Google Maps link came from your input. Its place details have not been verified."}
        </p>
      )}
      <form action={save} className="form">
        <input type="hidden" name="trip_id" value={trip.id} />
        <input type="hidden" name="id" value={preview.id} />
        <input type="hidden" name="google_place_id" value={placeId} />
        {!online && (
          <p role="status">
            Reconnect to save or look up places. Offline copies are read-only.
          </p>
        )}
        <fieldset disabled={pending || !online}>
          <label>
            Your name for this item
            <input
              name="title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
              maxLength={200}
            />
          </label>
          <label>
            Type
            <select
              name="kind"
              value={kind}
              onChange={(event) => setKind(event.target.value)}
            >
              <option value="activity">Place / activity</option>
              <option value="note">Note</option>
            </select>
          </label>
          <label>
            Save as
            <select
              name="mode"
              value={mode}
              onChange={(event) => setMode(event.target.value)}
            >
              <option value="idea">Unscheduled idea</option>
              <option value="day">Plan on a day</option>
            </select>
          </label>
          <label>
            Destination · optional
            <select name="destination_id">
              <option value="">Follow the selected day</option>
              {destinations.map((destination) => (
                <option key={destination.id} value={destination.id}>
                  {destination.title} · {destination.start_date} →{" "}
                  {destination.end_date}
                </option>
              ))}
            </select>
          </label>
          <label>
            Day
            <select name="day" defaultValue={day} disabled={mode === "idea"}>
              {days(trip.start_date, trip.end_date).map((date) => (
                <option key={date} value={date}>
                  {date}
                </option>
              ))}
            </select>
          </label>
          {mode === "idea" && <input type="hidden" name="day" value="" />}
          <div className="two">
            <label>
              Local time · optional
              <input name="local_time" type="time" disabled={mode === "idea"} />
            </label>
            <label>
              Duration · minutes, optional
              <input
                name="duration_minutes"
                type="number"
                min="1"
                max="1440"
                disabled={kind === "note"}
              />
            </label>
          </div>
          {mode === "idea" && (
            <input type="hidden" name="local_time" value="" />
          )}
          {kind === "note" && (
            <input type="hidden" name="duration_minutes" value="" />
          )}
          <p className="muted">
            Local time follows the destination automatically. Saving a plan does
            not confirm a reservation.
          </p>
          <label>
            Your address · optional
            <input
              name="address"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              maxLength={500}
            />
          </label>
          {!preview.maps && preview.original.length <= 500 && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => setAddress(preview.original)}
            >
              Use my input as the address
            </Button>
          )}
          <label>
            Google Maps link · optional
            <input
              name="maps_link"
              value={link}
              onChange={(event) => {
                setLink(event.target.value);
                setPlaceId(parseMapsLink(event.target.value)?.placeId || "");
              }}
              maxLength={1000}
              type="url"
            />
          </label>
          <label>
            Your notes · optional
            <textarea
              name="notes"
              defaultValue={preview.notes}
              maxLength={3000}
              rows={3}
            />
          </label>
          <div className="actions">
            <Button disabled={pending}>
              {pending ? "Saving…" : "Save this item"}
            </Button>
            <Button variant="secondary" type="button" onClick={onDiscard}>
              Discard preview
            </Button>
          </div>
          {state.error && (
            <p role="alert" className="error">
              {state.error}
            </p>
          )}
        </fieldset>
      </form>
      {livePlaces ? (
        <section>
          <h3>Want to match a real Google place?</h3>
          <p className="muted">
            Lookup happens only when you ask and uses the request budget.
            Results stay temporary; saving keeps the place ID and your own
            label.
          </p>
          <Button
            variant="secondary"
            disabled={
              !online ||
              loading ||
              pending ||
              (!parseMapsLink(link)?.placeId && title.trim().length < 2)
            }
            onClick={lookup}
          >
            {loading ? "Looking up places…" : "Look up with Google"}
          </Button>
          {lookupError && (
            <p className="error" role="alert">
              {lookupError}
            </p>
          )}
          <div className="grid">
            {results.map((result) => (
              <article className="card" key={result.id}>
                <h3>{result.name}</h3>
                <p>{result.address}</p>
                <p className="muted">
                  Google Maps data · retrieved{" "}
                  {new Date(result.checkedAt).toLocaleString()}
                  {result.attributions.map((attribution, index) => (
                    <span key={index}>
                      {" "}
                      ·{" "}
                      {attribution.url ? (
                        <a
                          href={attribution.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {attribution.provider}
                        </a>
                      ) : (
                        attribution.provider
                      )}
                    </span>
                  ))}
                </p>
                <a
                  href={result.mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View Google Maps ↗
                </a>
                <Button
                  variant="secondary"
                  disabled={pending || !online}
                  onClick={() => {
                    setPlaceId(result.id);
                    setLink(
                      mapsLinkForPlace(result.id, title || "Saved place"),
                    );
                  }}
                >
                  Use this place ID
                </Button>
                {placeId === result.id && (
                  <p role="status">
                    Place ID selected. Review your own label and save above.
                  </p>
                )}
              </article>
            ))}
          </div>
        </section>
      ) : (
        <p className="muted">
          Google lookup is unavailable for this deployment. You can save your
          own label, address and Maps link.
        </p>
      )}
    </section>
  );
}
export function QuickAdd({
  trip,
  destinations,
  day,
  livePlaces,
}: {
  trip: Trip;
  destinations: Segment[];
  day: string;
  livePlaces: boolean;
}) {
  const online = useOnline();
  const [preview, setPreview] = useState<Preview | null>(null),
    [error, setError] = useState(""),
    [input, setInput] = useState("");
  if (preview)
    return (
      <QuickReview
        key={preview.id}
        trip={trip}
        destinations={destinations.filter(
          (destination) => destination.status !== "idea",
        )}
        day={day}
        preview={preview}
        livePlaces={livePlaces}
        onDiscard={() => {
          setPreview(null);
          setInput("");
        }}
      />
    );
  return (
    <section className="card">
      <span className="eyebrow">Quick Add</span>
      <h2>A name, a note, a little possibility.</h2>
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault();
          try {
            setPreview({
              ...inspectQuickInput(input),
              id: crypto.randomUUID(),
              original: input.trim(),
            });
            setError("");
          } catch (error) {
            setError(
              error instanceof Error ? error.message : "Check your input.",
            );
          }
        }}
      >
        {!online && (
          <p role="status">
            Reconnect to add a plan. Offline copies are read-only.
          </p>
        )}
        <fieldset disabled={!online}>
          <label>
            Place name, address, note or Google Maps link
            <textarea
              required
              value={input}
              onChange={(event) => setInput(event.target.value)}
              maxLength={1000}
              rows={3}
              placeholder="A place to try, an address to keep, or a Maps link…"
            />
          </label>
          <Button>Preview item</Button>
        </fieldset>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </form>
    </section>
  );
}
