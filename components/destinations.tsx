"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Plus, MapPin } from "lucide-react";
import type { Trip, Segment } from "../lib/domain";
import {
  destinationEntries,
  destinationOrder,
  type DestinationEntry,
} from "../lib/destination-management";
import { BookingDrawer } from "./booking-drawer";
import { LocationPicker } from "./location-picker";
import { DestinationSortList } from "./destination-sort-list";
import { changeDestination } from "../app/destination-actions";
import { reorderDestinations } from "../app/trip-map-actions";
function DestinationEditor({
  trip,
  entry,
  canEdit,
  onClose,
  opener,
  onSaved,
}: {
  trip: Trip;
  entry?: DestinationEntry;
  canEdit: boolean;
  onClose: () => void;
  opener: HTMLElement | null;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(entry?.title || ""),
    [locationId, setLocationId] = useState(entry?.locationId || ""),
    [start, setStart] = useState(entry?.start || ""),
    [end, setEnd] = useState(entry?.end || ""),
    [notes, setNotes] = useState(entry?.notes || ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const guard = useRef(false),
    dirty =
      title !== (entry?.title || "") ||
      locationId !== (entry?.locationId || "") ||
      start !== (entry?.start || "") ||
      end !== (entry?.end || "") ||
      notes !== (entry?.notes || "");
  function close() {
    if (!dirty || window.confirm("Discard your unsaved destination changes?"))
      onClose();
  }
  async function submit(operation: "save" | "remove") {
    if (guard.current || !canEdit) return;
    if (
      operation === "save" &&
      (!title.trim() ||
        (start && end && end < start) ||
        (entry?.source === "segment" && (!start || !end)))
    ) {
      setError(
        !title.trim()
          ? "Add a destination name."
          : entry?.source === "segment" && (!start || !end)
            ? "Choose both dates for this dated stop."
            : "The end date can’t be before the start date.",
      );
      return;
    }
    if (
      operation === "remove" &&
      !window.confirm(
        "Remove this destination? Bookings and activities stay saved. Existing destination links will be cleared where supported.",
      )
    )
      return;
    guard.current = true;
    setBusy(true);
    setError("");
    try {
      const r = await changeDestination({
        trip: trip.id,
        tripRevision: trip.trip_revision || 0,
        source: entry?.source || "saved",
        key: entry?.key || "new",
        revision: entry?.revision || 0,
        operation,
        title,
        locationId,
        start,
        end,
        notes,
      });
      if (r.error) setError(r.error);
      else {
        onSaved();
        onClose();
      }
    } catch {
      setError("Couldn’t save. Your changes are still here. Please retry.");
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }
  return (
    <BookingDrawer
      title={
        canEdit
          ? entry
            ? "Edit destination"
            : "Add destination"
          : "Destination details"
      }
      busy={busy}
      onClose={close}
      returnFocus={opener}
      closeLabel="Close destination editor"
    >
      <form
        className="destination-editor"
        onSubmit={(e) => {
          e.preventDefault();
          void submit("save");
        }}
      >
        <fieldset disabled={busy || !canEdit}>
          <label>
            Name
            <input
              name="title"
              value={title}
              required
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <LocationPicker
            label="Place"
            initialId={entry?.locationId}
            initialLabel={entry?.locationLabel}
            required={!entry || !!entry.locationId}
            scope="destination"
            compact
            onResolved={(location) => setLocationId(location?.id || "")}
          />
          <div className="destination-dates">
            <label>
              From
              <input
                type="date"
                value={start}
                min={trip.start_date}
                max={trip.end_date}
                required={entry?.source === "segment"}
                onChange={(e) => setStart(e.target.value)}
              />
            </label>
            <label>
              To
              <input
                type="date"
                value={end}
                min={start || trip.start_date}
                max={trip.end_date}
                required={entry?.source === "segment"}
                onChange={(e) => setEnd(e.target.value)}
              />
            </label>
          </div>
          <label>
            Notes
            <textarea
              maxLength={4000}
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          {canEdit && (
            <button type="submit" className="button primary">
              {busy ? "Saving…" : "Save destination"}
            </button>
          )}
        </fieldset>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {canEdit && entry && (
          <div className="destination-danger">
            <button
              type="button"
              className="button danger"
              disabled={busy}
              onClick={() => void submit("remove")}
            >
              Remove destination
            </button>
          </div>
        )}
      </form>
    </BookingDrawer>
  );
}
export function Destinations({
  trip,
  segments,
  canEdit,
  ready,
  orderReady,
  mixedReady = false,
  initialEdit,
}: {
  trip: Trip;
  segments: Segment[];
  canEdit: boolean;
  ready: boolean;
  orderReady: boolean;
  mixedReady?: boolean;
  initialEdit?: string;
}) {
  const router = useRouter(),
    entries = destinationEntries(trip, segments),
    order = destinationOrder(trip, segments, mixedReady);
  const [editor, setEditor] = useState<{
      entry?: DestinationEntry;
      opener: HTMLElement | null;
    } | null>(() => {
      if (initialEdit === "new") return canEdit ? { opener: null } : null;
      const entry = entries.find(
        (e) =>
          e.id === initialEdit ||
          (e.source === "saved" && `saved:${e.key}` === initialEdit),
      );
      return entry ? { entry, opener: null } : null;
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const guard = useRef(false);
  async function move(from: number, to: number) {
    if (!order || guard.current) return false;
    guard.current = true;
    setBusy(true);
    setError("");
    const ids = [...order.ids],
      moved = ids.splice(from, 1)[0];
    ids.splice(to, 0, moved);
    try {
      const r = await reorderDestinations({
        trip: trip.id,
        revision: order.revision,
        ids,
        segments: order.segments,
      });
      if (r.error) {
        setError(r.error);
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError("Couldn’t save the order. Refresh before retrying.");
      return false;
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="trip-destinations">
      <header className="destination-heading">
        <div>
          <Link href={`/trips/${trip.id}`}>← Back to trip</Link>
          <h1>Your destinations</h1>
          <p>{trip.name}</p>
        </div>
        {canEdit && (
          <button
            type="button"
            className="button primary"
            disabled={!ready}
            onClick={(e) => setEditor({ opener: e.currentTarget })}
          >
            <Plus size={16} aria-hidden="true" /> Add destination
          </button>
        )}
      </header>
      {!entries.length ? (
        <div className="destination-empty">
          <MapPin aria-hidden="true" />
          <h2>No destinations yet</h2>
        </div>
      ) : (
        <DestinationSortList
          items={entries}
          canReorder={canEdit && orderReady && !!order}
          busy={busy}
          onMove={move}
          render={(item, index) => (
            <button
              type="button"
              className="destination-open"
              disabled={canEdit && !ready}
              aria-label={`${canEdit ? "Edit" : "View"} ${item.title}`}
              onClick={(e) =>
                setEditor({ entry: item, opener: e.currentTarget })
              }
            >
              <span className="destination-number">{index + 1}</span>
              <span>
                <strong>{item.title}</strong>
                {item.context && <small>{item.context}</small>}
                {(item.start || item.end) && (
                  <small>
                    {item.start || "Start date not set"}
                    {item.end ? ` – ${item.end}` : ""}
                  </small>
                )}
              </span>
              <Pencil size={17} aria-hidden="true" />
            </button>
          )}
        />
      )}
      <Link
        className="destination-map-link"
        href={`/trips/${trip.id}?view=map`}
      >
        View trip map
      </Link>
      {canEdit && !ready && (
        <p role="status" className="muted">
          Destination editing is available after the next project update.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {editor && (
        <DestinationEditor
          key={editor.entry?.id || "new"}
          trip={trip}
          entry={editor.entry}
          canEdit={canEdit && ready}
          opener={editor.opener}
          onSaved={() => router.refresh()}
          onClose={() => setEditor(null)}
        />
      )}
    </section>
  );
}
