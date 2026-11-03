"use client";
import { useState, useMemo } from "react";
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
export type SavedPlace = {
  id: string;
  title: string;
  notes: string;
  category: string;
  source: "city" | "google";
  location_id: string | null;
  latitude: number | null;
  longitude: number | null;
  google_place_id: string | null;
};
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
  canEdit = true,
  searchQuery,
}: {
  trip: Trip;
  segments: Segment[];
  places: SavedPlace[];
  canEdit?: boolean;
  searchQuery?: string;
}) {
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState("");
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [details, setDetails] = useState<Record<string, PlaceResult>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const shown = places.filter((p) => filter === "all" || p.category === filter);
  const pins = useMemo<MapPin[]>(
    () => [
      ...segments
        .filter(
          (s) =>
            s.location_id &&
            s.latitude !== null &&
            s.latitude !== undefined &&
            s.longitude !== null &&
            s.longitude !== undefined,
        )
        .map((s) => ({
          id: s.id,
          label: s.title + " (approximate location)",
          latitude: s.latitude!,
          longitude: s.longitude!,
        })),
      ...places
        .filter((p) => filter === "all" || p.category === filter)
        .flatMap((p) =>
          p.source === "city" && p.latitude !== null && p.longitude !== null
            ? [
                {
                  id: p.id,
                  label: p.title + " (approximate location)",
                  latitude: p.latitude,
                  longitude: p.longitude,
                },
              ]
            : p.google_place_id && details[p.google_place_id]
              ? [
                  {
                    id: p.id,
                    label: details[p.google_place_id].name,
                    latitude: details[p.google_place_id].latitude,
                    longitude: details[p.google_place_id].longitude,
                  },
                ]
              : [],
        ),
      ...results.map((p) => ({
        id: p.id,
        label: p.name + " (search result)",
        latitude: p.latitude,
        longitude: p.longitude,
      })),
    ],
    [segments, places, filter, details, results],
  );
  async function search(form: FormData) {
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
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/place-details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trip_id: trip.id, place_id: id }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Place details unavailable");
      setDetails((current) => ({
        ...current,
        [id]: placeSchema.parse(data.result),
      }));
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
        Place points mark approximate locations. Venue points appear only from
        fresh Google place data. No offline maps are provided.
      </p>
      <GoogleMap pins={pins} selected={selected} onSelect={setSelected} />
      <div className="grid">
        {segments
          .filter(
            (s) => s.location_id && s.latitude != null && s.longitude != null,
          )
          .map((s) => (
            <article
              key={s.id}
              className={"card " + (selected === s.id ? "lime" : "")}
            >
              <span className="pill">{s.kind} · approximate location</span>
              <h3>{s.title}</h3>
              <p>
                {s.start_date} → {s.end_date}
              </p>
              <Button variant="secondary" onClick={() => setSelected(s.id)}>
                Highlight this point
              </Button>
              <a
                href={
                  "https://www.google.com/maps/search/?api=1&query=" +
                  s.latitude +
                  "," +
                  s.longitude
                }
                target="_blank"
                rel="noopener noreferrer"
              >
                Open Google Maps ↗
              </a>
            </article>
          ))}
      </div>
      <label>
        Filter saved places
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          {["all", "food", "activity", "stay", "transport", "other"].map(
            (v) => (
              <option key={v}>{v}</option>
            ),
          )}
        </select>
      </label>
      <div className="grid">
        {shown.map((p) => {
          const detail = p.google_place_id ? details[p.google_place_id] : null;
          const link = p.google_place_id
            ? "https://www.google.com/maps/search/?api=1&query=" +
              encodeURIComponent(p.title) +
              "&query_place_id=" +
              encodeURIComponent(p.google_place_id)
            : "https://www.google.com/maps/search/?api=1&query=" +
              p.latitude +
              "," +
              p.longitude;
          return (
            <article
              className={"card " + (selected === p.id ? "lime" : "")}
              key={p.id}
            >
              <span className="pill">
                {p.source === "city"
                  ? "Saved place · approximate location"
                  : "Saved Google place"}
              </span>
              <h3>{p.title}</h3>
              <Button variant="secondary" onClick={() => setSelected(p.id)}>
                Highlight this place
              </Button>
              <p className="notes">{p.notes}</p>
              {detail && (
                <>
                  <p>
                    {detail.name} · {detail.address}
                  </p>
                  <Attribution place={detail} />
                </>
              )}
              <a
                className="button secondary"
                href={link}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open Google Maps ↗
              </a>
              {p.google_place_id && canEdit && (
                <Button
                  disabled={loading}
                  variant="secondary"
                  onClick={() => loadDetails(p.google_place_id!)}
                >
                  Load current place details
                </Button>
              )}
              {canEdit && (
                <div className="actions">
                  <form action={placeToIdea}>
                    <input type="hidden" name="trip_id" value={trip.id} />
                    <input type="hidden" name="place_id" value={p.id} />
                    <Submit>Save to Ideas</Submit>
                  </form>
                  <RemovePlace trip={trip.id} id={p.id} />
                </div>
              )}
            </article>
          );
        })}
      </div>
      {!shown.length && (
        <div className="empty">No saved places in this category yet.</div>
      )}
      {canEdit && (
        <>
          <form action={savePlace} className="form">
            <h3>Save a place or your own place notes</h3>
            <input type="hidden" name="trip_id" value={trip.id} />
            <input type="hidden" name="source" value="city" />
            <label>
              Your label
              <input name="title" required maxLength={200} />
            </label>
            <LocationPicker label="Place" required />
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
            <Submit>Save place & notes</Submit>
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
            <Button disabled={loading}>
              {loading ? "Searching…" : "Search places"}
            </Button>
            {error && (
              <p role="status" className="error">
                {error}
              </p>
            )}
          </form>
        </>
      )}
      <div className="grid">
        {results.map((p) => (
          <article
            className={"card " + (selected === p.id ? "lime" : "")}
            key={p.id}
          >
            <span className="pill">Search result · not saved</span>
            <h3>{p.name}</h3>
            <Button variant="secondary" onClick={() => setSelected(p.id)}>
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
