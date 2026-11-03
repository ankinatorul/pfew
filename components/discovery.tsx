"use client";
import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import type { Trip, Segment } from "../lib/domain";
import { placeSchema, type PlaceResult } from "../lib/discovery-types";
import { GoogleMap, type MapPin } from "./google-map";
import { LocationPicker } from "./location-picker";
import {
  savePlace,
  deletePlace,
  placeToIdea,
} from "../app/intelligence-actions";
import { Submit } from "./forms";
import { Button } from "./button";
import { days } from "../lib/domain";
import { useOnline } from "./essentials/online";
import {
  tripMapEntries,
  filterMapEntries,
  mapKinds,
  mapKindLabels,
  type MapBooking,
  type SavedPlace,
} from "../lib/trip-map";
export type { SavedPlace } from "../lib/trip-map";
function RemovePlace({ trip, id }: { trip: string; id: string }) {
  return (
    <form
      action={deletePlace}
      onSubmit={(e) => {
        if (!confirm("Remove this saved place?")) e.preventDefault();
      }}
    >
      <input type="hidden" name="trip_id" value={trip} />
      <input type="hidden" name="id" value={id} />
      <Button variant="danger">Remove place</Button>
    </form>
  );
}
function Attribution({ place }: { place: PlaceResult }) {
  return (
    <p className="muted">
      Google Maps data · checked {new Date(place.checkedAt).toLocaleString()}
      {place.attributions.map((a, i) => (
        <span key={i}>
          {" "}
          ·{" "}
          {a.url ? (
            <a href={a.url} target="_blank" rel="noopener noreferrer">
              {a.provider}
            </a>
          ) : (
            a.provider
          )}
        </span>
      ))}
    </p>
  );
}
export function Discovery({
  trip,
  segments,
  places,
  bookings = [],
  livePlaces = false,
  canEdit = true,
  searchQuery,
}: {
  trip: Trip;
  segments: Segment[];
  places: SavedPlace[];
  bookings?: MapBooking[];
  livePlaces?: boolean;
  canEdit?: boolean;
  searchQuery?: string;
}) {
  const [filter, setFilter] = useState("all");
  const [kind, setKind] = useState("all");
  const [day, setDay] = useState("");
  const [includeUndated, setIncludeUndated] = useState(true);
  const online = useOnline();
  const [selected, setSelected] = useState("");
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [details, setDetails] = useState<Record<string, PlaceResult>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const entries = useMemo(
    () => tripMapEntries(trip.id, segments, bookings, places, details),
    [trip.id, segments, bookings, places, details],
  );
  const shown = useMemo(
    () =>
      filterMapEntries(entries, {
        kind,
        day,
        includeUndated,
        category: filter,
      }),
    [entries, kind, day, includeUndated, filter],
  );
  const pins = useMemo<MapPin[]>(
    () => [
      ...shown.flatMap((entry) =>
        entry.point
          ? [
              {
                id: entry.id,
                label:
                  entry.title +
                  (entry.role === "location" ? "" : " · " + entry.role) +
                  (entry.precision === "city" ? " (city center)" : ""),
                ...entry.point,
              },
            ]
          : [],
      ),
      ...results.map((p) => ({
        id: "result:" + p.id,
        label: p.name + " (search result)",
        latitude: p.latitude,
        longitude: p.longitude,
      })),
    ],
    [shown, results],
  );
  const activeSelection = pins.some((p) => p.id === selected) ? selected : "";
  const selectFromMap = useCallback((id: string) => {
    setSelected(id);
    const card = document.getElementById("map-item-" + id);
    card?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    card?.focus({ preventScroll: true });
  }, []);
  function selectFromList(id: string) {
    setSelected(id);
    document
      .getElementById("trip-map-display")
      ?.scrollIntoView?.({ block: "start", behavior: "smooth" });
  }
  async function search(form: FormData) {
    if (!online || !livePlaces || loading) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/discovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trip_id: trip.id, query: form.get("query") }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Search unavailable");
      setResults(placeSchema.array().parse(data.results));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search unavailable");
    } finally {
      setLoading(false);
    }
  }
  async function loadDetails(id: string) {
    if (!online || !livePlaces || loading || !canEdit) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/quick-place", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trip_id: trip.id, place_id: id }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Place details unavailable");
      const detail = placeSchema.parse(data.result);
      if (detail.id !== id)
        throw new Error("This response did not match the requested place.");
      setDetails((current) => ({ ...current, [id]: detail }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Place details unavailable");
    } finally {
      setLoading(false);
    }
  }
  return (
    <>
      <span className="eyebrow">Smart Map</span>
      <h2>A little closer to your next discovery.</h2>
      <p className="muted">
        City points mark approximate city centers. Venue points appear only from
        fresh Google place data. No offline maps are provided.
      </p>
      <div className="card map-filters" aria-label="Filter trip locations">
        <div className="two">
          <label>
            Location type
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value)}
            >
              <option value="all">All types</option>
              {mapKinds.map((value) => (
                <option key={value} value={value}>
                  {mapKindLabels[value]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Trip day
            <select
              value={day}
              onChange={(event) => setDay(event.target.value)}
            >
              <option value="">All trip days</option>
              {days(trip.start_date, trip.end_date).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        </div>
        {day && (
          <label>
            <input
              type="checkbox"
              checked={includeUndated}
              onChange={(event) => setIncludeUndated(event.target.checked)}
            />
            Include undated saved places and ideas
          </label>
        )}
        <label>
          Saved-place category
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            {["all", "food", "activity", "stay", "transport", "other"].map(
              (value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ),
            )}
          </select>
        </label>
        <p className="muted">
          Filters apply to your saved trip locations and their map points. Fresh
          search results stay separate below.
        </p>
      </div>
      <div id="trip-map-display">
        <GoogleMap
          pins={pins}
          selected={activeSelection}
          onSelect={selectFromMap}
        />
      </div>
      <p role="status">
        {shown.length} trip locations ·{" "}
        {shown.filter((entry) => entry.point).length} map points.{" "}
        {results.length > 0 && `${results.length} separate search results.`}
      </p>
      {error && (
        <p role="status" className="error">
          {error}
        </p>
      )}
      <div className="grid" aria-label="Trip location list">
        {shown.map((entry) => {
          const saved =
            entry.source === "saved"
              ? places.find((p) => p.id === entry.recordId)
              : null;
          const detail = entry.placeId ? details[entry.placeId] : null;
          const number = pins.findIndex((p) => p.id === entry.id) + 1;
          return (
            <article
              key={entry.id}
              id={"map-item-" + entry.id}
              tabIndex={-1}
              className={
                "card map-location " +
                (activeSelection === entry.id ? "lime" : "")
              }
            >
              <span className="pill">
                {mapKindLabels[entry.kind]} ·{" "}
                {entry.role === "location"
                  ? entry.source === "booking"
                    ? "Wallet"
                    : entry.source === "saved"
                      ? "Saved"
                      : "Itinerary"
                  : entry.role}
              </span>
              <h3>{entry.title}</h3>
              <p>{entry.state}</p>
              <p className="muted">
                {entry.start
                  ? entry.start +
                    (entry.end !== entry.start ? " → " + entry.end : "")
                  : "Unscheduled · no assigned day"}
              </p>
              <p>{entry.locationLabel}</p>
              <p className="muted">
                {entry.precision === "city"
                  ? `Map point ${number} · approximate city center, not a venue or terminal.`
                  : entry.precision === "place"
                    ? `Map point ${number} · current Google place location.`
                    : "No map point. A venue location has not been loaded or a city has not been entered."}
              </p>
              {entry.point && (
                <Button
                  variant="secondary"
                  onClick={() => selectFromList(entry.id)}
                >
                  Select map point {number}
                </Button>
              )}
              {detail && (
                <>
                  <p>
                    {detail.name} · {detail.address}
                  </p>
                  <Attribution place={detail} />
                </>
              )}
              {entry.placeId &&
                canEdit &&
                (livePlaces ? (
                  <Button
                    variant="secondary"
                    disabled={loading || !online}
                    onClick={() => loadDetails(entry.placeId!)}
                  >
                    Load current place details
                  </Button>
                ) : (
                  <p className="muted">
                    Current venue details need the optional Google Places
                    integration. Your saved Maps link still works.
                  </p>
                ))}
              {saved?.notes && <p className="notes">{saved.notes}</p>}
              <div className="actions">
                {entry.mapsUrl && (
                  <a
                    className="button secondary"
                    href={entry.mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open Google Maps ↗
                  </a>
                )}
                {entry.href && (
                  <Link className="button secondary" href={entry.href}>
                    {entry.source === "booking"
                      ? "Open booking"
                      : entry.kind === "idea"
                        ? "Open Ideas"
                        : "Open itinerary"}{" "}
                    ↗
                  </Link>
                )}
              </div>
              {saved && canEdit && (
                <div className="actions">
                  <form action={placeToIdea}>
                    <input type="hidden" name="trip_id" value={trip.id} />
                    <input type="hidden" name="place_id" value={saved.id} />
                    <Submit>Save to Ideas</Submit>
                  </form>
                  <RemovePlace trip={trip.id} id={saved.id} />
                </div>
              )}
            </article>
          );
        })}
      </div>
      {!shown.length && (
        <div className="empty">
          No trip locations match these filters. Choose another day or type.
        </div>
      )}
      {canEdit && (
        <>
          <form action={savePlace} className="form">
            <h3>Save a city or your own place notes</h3>
            <input type="hidden" name="trip_id" value={trip.id} />
            <input type="hidden" name="source" value="city" />
            <label>
              Your label
              <input name="title" required maxLength={200} />
            </label>
            <LocationPicker label="City" required />
            <label>
              Category
              <select name="category">
                {["food", "activity", "stay", "transport", "other"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              Your notes / address
              <textarea name="notes" maxLength={2000} />
            </label>
            <Submit>Save city & notes</Submit>
          </form>
          <form action={search} className="form" data-viewer-allowed>
            <h3>Discover with Google Places</h3>
            <p className="muted">
              Search only when you ask. Results are current provider data, not
              AI recommendations.
            </p>
            <label>
              Search query
              <input
                defaultValue={searchQuery || ""}
                name="query"
                required
                minLength={2}
                maxLength={200}
                placeholder={
                  "Restaurants in " +
                  (segments.find((s) => s.kind === "destination")?.title ||
                    "your destination")
                }
              />
            </label>
            {!livePlaces && (
              <p className="muted">
                Google Places search is not configured yet. Your saved trip list
                and Maps links work without it.
              </p>
            )}
            {!online && (
              <p role="status">
                Reconnect to search or load current place details.
              </p>
            )}
            <Button disabled={loading || !online || !livePlaces}>
              {loading ? "Searching…" : "Search places"}
            </Button>
          </form>
        </>
      )}
      {results.length > 0 && <h3>Fresh search results · not saved</h3>}
      <div className="grid" aria-label="Place search results">
        {results.map((p) => (
          <article
            className={
              "card map-location " +
              (activeSelection === "result:" + p.id ? "lime" : "")
            }
            key={p.id}
            id={"map-item-result:" + p.id}
            tabIndex={-1}
          >
            <span className="pill">Search result · not saved</span>
            <h3>{p.name}</h3>
            <Button
              variant="secondary"
              onClick={() => selectFromList("result:" + p.id)}
            >
              Highlight this result
            </Button>
            <p>{p.address}</p>
            <Attribution place={p} />
            <a href={p.mapsUrl} target="_blank" rel="noopener noreferrer">
              View on Google Maps ↗
            </a>
            {canEdit && (
              <form action={savePlace}>
                <input type="hidden" name="trip_id" value={trip.id} />
                <input type="hidden" name="source" value="google" />
                <input type="hidden" name="google_place_id" value={p.id} />
                <input type="hidden" name="category" value="other" />
                <label>
                  Your own label
                  <input
                    name="title"
                    required
                    maxLength={200}
                    placeholder="e.g. A dinner option"
                  />
                </label>
                <label>
                  Your notes
                  <textarea name="notes" maxLength={2000} />
                </label>
                <Submit>Save to places</Submit>
              </form>
            )}
          </article>
        ))}
      </div>
      <Link href={"/trips/" + trip.id + "?view=ideas"}>Open Ideas ↗</Link>
    </>
  );
}
