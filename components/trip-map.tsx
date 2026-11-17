"use client";
import { DestinationSortList } from "./destination-sort-list";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Component, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Expand, MapPin } from "lucide-react";
import {
  associatedPlaces,
  type TripMapData,
  type MapPoint,
} from "../lib/trip-map";
import { reorderDestinations } from "../app/trip-map-actions";
const Canvas = dynamic(() => import("./trip-map-canvas"), {
  ssr: false,
  loading: () => (
    <div className="pfew-map-state" role="status">
      Opening your trip map…
    </div>
  ),
});
class MapBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <p className="pfew-map-state" role="status">
        The map couldn’t load. Your destinations are still listed below.
      </p>
    ) : (
      this.props.children
    );
  }
}
function Surface({
  data,
  selected,
  onSelect,
  expanded = false,
  connect = true,
}: {
  data: TripMapData;
  selected: string;
  onSelect: (id: string) => void;
  expanded?: boolean;
  connect?: boolean;
}) {
  const mapped = [...data.destinations, ...(expanded ? data.places : [])].some(
    (p) => p.coordinates,
  );
  return (
    <div className="pfew-map-surface">
      {mapped ? (
        <MapBoundary>
          <Canvas
            destinations={data.destinations}
            places={data.places}
            expanded={expanded}
            connect={connect}
            selected={selected}
            onSelect={onSelect}
          />
        </MapBoundary>
      ) : (
        <div className="pfew-map-state">
          <MapPin aria-hidden="true" />
          <p>
            {data.destinations.length
              ? "Your saved destinations don’t have mapped coordinates yet."
              : "Add destinations to see your trip on the map."}
          </p>
          <Link href={`/trips/${data.tripId}?view=destinations`}>
            Review destinations
          </Link>
        </div>
      )}
    </div>
  );
}
export function TripMapCard({ data }: { data: TripMapData }) {
  const [selected, setSelected] = useState("");
  return (
    <section
      className="overview-card pfew-trip-map-card"
      aria-label="Your trip map"
    >
      <header>
        <div>
          <h2>Your trip map</h2>
          <p>
            {data.destinations.length} destinations · {data.places.length} saved
            places
          </p>
        </div>
        <Link
          className="overview-text-link"
          href={`/trips/${data.tripId}?view=map`}
        >
          <Expand size={16} aria-hidden="true" /> Expand map
        </Link>
      </header>
      <Surface data={data} selected={selected} onSelect={setSelected} />
      <ol className="pfew-map-stops" aria-label="Ordered destinations">
        {data.destinations.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              aria-pressed={selected === p.id}
              aria-label={`${p.order || ""} ${p.title}`.trim()}
              onClick={() => setSelected(p.id)}
            >
              <span>{p.order || "•"}</span>
              {p.title}
              {!p.coordinates && <small>Location not mapped</small>}
            </button>
          </li>
        ))}
      </ol>
      {data.orderAmbiguous && (
        <p className="muted">
          Some saved stops have no position in the dated route.
        </p>
      )}
      {!!data.unavailable.length && (
        <p className="muted" role="status">
          Some saved locations couldn’t be loaded. Open the map to retry.
        </p>
      )}
    </section>
  );
}
export type DestinationOrder = {
  revision: number;
  ids: string[];
  segments: { id: string; revision: number }[];
};
export function TripExplorer({
  data,
  canEdit,
  order,
}: {
  data: TripMapData;
  canEdit: boolean;
  order?: DestinationOrder;
}) {
  const router = useRouter(),
    refs = useRef<Record<string, HTMLElement | null>>({}),
    running = useRef(false);
  const [selected, setSelected] = useState(""),
    [connect, setConnect] = useState(true),
    [sheet, setSheet] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  function select(id: string) {
    const point = data.places.find((p) => p.id === id);
    if (point && (id.startsWith("booking:") || id.startsWith("end:"))) {
      router.push(point.href);
      return;
    }
    setSelected(id);
    setSheet(true);
    requestAnimationFrame(() => {
      const target = refs.current[id];
      if (target) {
        target.scrollIntoView({ block: "nearest", behavior: "instant" });
        target.focus({ preventScroll: true });
      }
    });
  }
  async function move(index: number, target: number) {
    if (!order || running.current) return false;
    running.current = true;
    setBusy(true);
    setError("");
    const ids = [...order.ids];
    const moved = ids.splice(index, 1)[0];
    ids.splice(target, 0, moved);
    try {
      const result = await reorderDestinations({
        trip: data.tripId,
        revision: order.revision,
        ids,
        segments: order.segments,
      });
      if (result.error) {
        setError(result.error);
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError("Couldn’t save the order. Refresh before retrying.");
      return false;
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  function place(p: MapPoint) {
    return (
      <li
        key={p.id}
        ref={(node) => {
          refs.current[p.id] = node;
        }}
        tabIndex={-1}
        className={selected === p.id ? "is-selected" : ""}
      >
        <button
          type="button"
          aria-pressed={selected === p.id}
          aria-label={`${p.order || ""} ${p.title}`.trim()}
          onClick={() =>
            p.id.startsWith("booking:") || p.id.startsWith("end:")
              ? router.push(p.href)
              : setSelected(p.id)
          }
        >
          {p.title}
          <small>
            {p.category === "stay" ? "Accommodation" : p.category}
            {!p.coordinates ? " · Location not mapped" : ""}
          </small>
        </button>
        <Link href={p.href}>
          {p.id.startsWith("booking:") || p.id.startsWith("end:")
            ? "View booking"
            : "View details"}
        </Link>
      </li>
    );
  }
  const unassigned = data.places.filter(
    (p) => !data.destinations.some((d) => associatedPlaces(d, [p]).length),
  );
  return (
    <section className="pfew-trip-explorer">
      <header className="pfew-explorer-header">
        <Link href={`/trips/${data.tripId}`}>
          <ArrowLeft size={16} aria-hidden="true" /> Back to trip
        </Link>
        <h1>{data.tripName}</h1>
        <label>
          <input
            type="checkbox"
            checked={connect}
            onChange={(e) => setConnect(e.target.checked)}
          />{" "}
          Connect pins
        </label>
      </header>
      <div className="pfew-explorer-grid">
        <aside
          className={`pfew-explorer-panel ${sheet ? "is-expanded" : ""}`}
          aria-label="Destinations and saved places"
        >
          <button
            type="button"
            className="pfew-sheet-toggle"
            aria-expanded={sheet}
            aria-controls="trip-map-details"
            onClick={() => setSheet((v) => !v)}
          >
            Destinations & places {sheet ? "−" : "+"}
          </button>
          <div id="trip-map-details" className="pfew-explorer-details">
            {data.orderAmbiguous && (
              <p className="muted">
                Some saved stops have no position in the dated route. Review
                destinations to set their order.
              </p>
            )}
            <DestinationSortList
              items={data.destinations}
              canReorder={canEdit && !!order}
              busy={busy}
              onMove={move}
              render={(p) => (
                <section
                  key={p.id}
                  ref={(node) => {
                    refs.current[p.id] = node;
                  }}
                  tabIndex={-1}
                  className={`pfew-destination-card ${selected === p.id ? "is-selected" : ""}`}
                >
                  <button
                    type="button"
                    className="pfew-destination-title"
                    aria-pressed={selected === p.id}
                    aria-label={`${p.order || ""} ${p.title}`.trim()}
                    onClick={() => setSelected(p.id)}
                  >
                    <span>{p.order || "•"}</span>
                    <strong>{p.title}</strong>
                  </button>
                  {p.start && (
                    <small>
                      {p.start}
                      {p.end && p.end !== p.start ? ` – ${p.end}` : ""}
                    </small>
                  )}
                  {!p.coordinates && (
                    <p className="muted">Location not mapped</p>
                  )}
                  <ul>{associatedPlaces(p, data.places).map(place)}</ul>
                  <Link href={p.href}>View destination</Link>
                </section>
              )}
            />
            {!data.destinations.length && (
              <p>Add destinations to see your trip on the map.</p>
            )}
            {!!unassigned.length && (
              <section>
                <h2>Other saved places</h2>
                <ul>{unassigned.map(place)}</ul>
              </section>
            )}
            <Link href={`/trips/${data.tripId}?view=destinations`}>
              Edit destinations
            </Link>{" "}
            ·{" "}
            <Link href={`/trips/${data.tripId}?view=places`}>
              Saved place tools
            </Link>
            {!!data.unavailable.length && (
              <p role="status">
                Couldn’t load {data.unavailable.join(" and ").toLowerCase()}.{" "}
                <button type="button" onClick={() => router.refresh()}>
                  Retry
                </button>
              </p>
            )}
            {error && <p role="alert">{error}</p>}
          </div>
        </aside>
        <div className="pfew-explorer-map">
          <Surface
            data={data}
            selected={selected}
            onSelect={select}
            expanded
            connect={connect}
          />
        </div>
      </div>
    </section>
  );
}
