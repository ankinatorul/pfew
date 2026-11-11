"use client";
import {
  useRef,
  useState,
  useEffect,
  type ElementType,
  type FormEvent,
} from "react";
import {
  CalendarDays,
  MapPin,
  Plus,
  Sparkles,
  ArrowUp,
  ArrowDown,
  Pencil,
  Trash2,
  Check,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { Trip } from "../lib/domain";
import type { Booking } from "../lib/essentials";
import {
  activityCategories,
  activityEnd,
  activityInput,
  dailyItinerary,
  dateRange,
  destinationForDay,
  itineraryDestinations,
  type ActivityInput,
  type ItineraryActivity,
  type ItineraryCommand,
  type ItineraryIdea,
  type ItineraryResult,
} from "../lib/itinerary";
import { travelStyleLabel } from "../lib/trip-style";
import { tripSectionUrl } from "../lib/trip-navigation";
export type ItineraryProps = {
  trip: Trip;
  segments: ItineraryActivity[];
  bookings: Booking[];
  ideas: ItineraryIdea[];
  initialDay?: string;
  initialExplore?: boolean;
  canEdit: boolean;
  ready: boolean;
  live: boolean;
  pendingBookings: number;
  loadError?: string;
  today: string;
};
export function ItineraryView({
  trip,
  segments,
  bookings,
  ideas,
  initialDay,
  initialExplore = false,
  canEdit,
  ready,
  live,
  pendingBookings,
  loadError,
  today,
  mutate,
  explore,
  onDayChange,
  LinkComponent = "a",
}: ItineraryProps & {
  mutate: (command: ItineraryCommand) => Promise<ItineraryResult>;
  explore: (input: {
    requestId: string;
    day: string;
    destination: string;
    interests: string;
  }) => Promise<ItineraryResult>;
  onDayChange?: (day: string) => void;
  LinkComponent?: ElementType;
}) {
  const [selected, setSelected] = useState(initialDay || trip.start_date),
    [showExplore, setShowExplore] = useState(initialExplore),
    [editor, setEditor] = useState<ActivityInput | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [pending, setPending] = useState(false),
    [destination, setDestination] = useState(""),
    [interests, setInterests] = useState(""),
    [requestId, setRequestId] = useState<string | null>(null);
  const guard = useRef(false),
    titleRef = useRef<HTMLInputElement>(null),
    editorRef = useRef<HTMLFormElement>(null),
    addRef = useRef<HTMLButtonElement>(null),
    feedback = useRef<HTMLParagraphElement>(null);
  const range = dateRange(trip, selected),
    day = range?.day || "",
    destinations = itineraryDestinations(trip, segments),
    context = destinationForDay(trip, segments, day),
    daily = dailyItinerary(trip, segments, bookings, day),
    enabled = canEdit && ready && !loadError;
  const href = (view: string) => tripSectionUrl(trip.id, view, day);
  const editorId = editor?.id;
  useEffect(() => {
    if (editorId) {
      titleRef.current?.focus();
      editorRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [editorId]);
  async function run(command: ItineraryCommand, close = false) {
    if (guard.current) return;
    guard.current = true;
    setPending(true);
    setError("");
    setMessage("");
    try {
      const result = await mutate(command);
      if (result.error) {
        setError(result.error);
        requestAnimationFrame(() => feedback.current?.focus());
        return;
      }
      setMessage(result.message || "Saved.");
      if (close) {
        setEditor(null);
        requestAnimationFrame(() => addRef.current?.focus());
      }
    } catch {
      setError(
        "Your change could not be saved. Your input is still here. Check your connection and try again.",
      );
    } finally {
      setPending(false);
      guard.current = false;
    }
  }
  function changeDay(value: string) {
    if (
      editor &&
      !window.confirm(
        "Leave this unsaved activity? Your saved plans will stay unchanged.",
      )
    )
      return;
    setEditor(null);
    setSelected(value);
    setError("");
    setMessage("");
    onDayChange?.(value);
  }
  function open(item?: ItineraryActivity) {
    setError("");
    setMessage("");
    setEditor({
      id: item?.id || crypto.randomUUID(),
      revision: item?.itinerary_revision || 0,
      title: item?.title || "",
      day: item?.start_date || day,
      start: item?.local_time || "",
      end: item ? activityEnd(item) : "",
      location: item?.address || "",
      notes: item?.notes || "",
      category: (item?.activity_category as ActivityInput["category"]) || "",
      destination: item?.destination_location_id || item?.destination_id || "",
    });
  }
  function reorder(item: ItineraryActivity, offset: number) {
    const list = daily.untimed.filter(
        (s) =>
          (s.kind === "activity" || s.kind === "note") &&
          s.start_date === s.end_date &&
          !s.local_time,
      ),
      index = list.findIndex((s) => s.id === item.id);
    if (index < 0 || !list[index + offset]) return;
    [list[index], list[index + offset]] = [list[index + offset], list[index]];
    void run({
      op: "reorder",
      day,
      order: list.map((s) => ({
        id: s.id,
        revision: s.itinerary_revision || 0,
      })),
    });
  }
  function bookingDetails(b: Booking, linked = false) {
    return (
      <div className="itinerary-booking-detail" key={b.id}>
        <span>
          {linked ? "Linked booking · " : ""}
          {b.title}
        </span>
        <small>
          {b.verification === "user confirmed"
            ? "Details reviewed"
            : "Needs review"}{" "}
          · Reservation {b.reservation_status || "unknown"}
        </small>
        <small>
          {b.start_date}
          {b.local_time
            ? " · " + b.local_time + " " + b.timezone
            : " · Start time not supplied"}
          {b.end_date && (b.end_date !== b.start_date || b.end_local_time)
            ? " → " +
              b.end_date +
              (b.end_local_time
                ? " · " +
                  b.end_local_time +
                  (b.end_timezone
                    ? " " + b.end_timezone
                    : " (end time zone not supplied)")
                : " · End time not supplied")
            : ""}
        </small>
        <LinkComponent href={href("bookings") + "&edit=" + b.id}>
          Review booking
        </LinkComponent>
        {linked && enabled && (
          <button
            disabled={pending}
            onClick={() =>
              void run({ op: "unlink", id: b.id, segment: b.segment_id! })
            }
          >
            Remove booking link
          </button>
        )}
      </div>
    );
  }
  function activityCard(item: ItineraryActivity, untimed = false) {
    const editable =
      (item.kind === "activity" || item.kind === "note") &&
      item.start_date === item.end_date &&
      (!item.duration_minutes || !item.local_time || !!activityEnd(item));
    const source = ideas.find((i) => i.accepted_segment_id === item.id),
      association = destinations.find(
        (d) => d.id === (item.destination_location_id || item.destination_id),
      );
    const reorderable = daily.untimed.filter(
        (s) =>
          (s.kind === "activity" || s.kind === "note") &&
          s.start_date === s.end_date &&
          !s.local_time,
      ),
      index = reorderable.findIndex((s) => s.id === item.id);
    return (
      <article
        key={item.id}
        className={
          "itinerary-card itinerary-activity" +
          (item.completed_at ? " is-complete" : "")
        }
        aria-label={item.title}
        data-category={item.activity_category || undefined}
      >
        <div className="itinerary-time">
          {untimed
            ? item.start_date !== day
              ? "Continuing"
              : "Any time"
            : item.local_time}
          {!untimed && activityEnd(item) && (
            <small>– {activityEnd(item)}</small>
          )}
          <small>{item.timezone}</small>
        </div>
        <div className="itinerary-card-body">
          <div className="itinerary-card-title">
            <h3>{item.title}</h3>
            {item.completed_at && (
              <span className="itinerary-tag">
                <Check size={14} /> Completed
              </span>
            )}
          </div>
          <p className="itinerary-meta">
            {item.activity_category || item.kind}
            {association ? " · " + association.label : ""}
            {item.status === "confirmed" ? " · Plan marked confirmed" : ""}
          </p>
          {(item.address || item.location_label) && (
            <p className="itinerary-location">
              <MapPin size={15} />
              {item.address || item.location_label}
            </p>
          )}
          {item.notes && <p className="itinerary-notes">{item.notes}</p>}
          {source && (
            <small>
              {source.source === "mock" ? "Sample idea" : "AI-assisted idea"} ·
              Check details before making plans.
            </small>
          )}
          {bookings
            .filter((b) => b.segment_id === item.id)
            .map((b) => bookingDetails(b, true))}
          <div className="itinerary-card-actions">
            {enabled &&
              (editable ? (
                <>
                  <button disabled={pending} onClick={() => open(item)}>
                    <Pencil size={14} /> Edit / move
                  </button>
                  <button
                    disabled={pending}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Delete “" +
                            item.title +
                            "”? This removes the itinerary activity and its suggestion link. Linked bookings and their files stay saved in Bookings.",
                        )
                      )
                        void run({
                          op: "delete",
                          id: item.id,
                          revision: item.itinerary_revision || 0,
                        });
                    }}
                  >
                    <Trash2 size={14} /> Delete
                  </button>
                  {item.start_date <= today && (
                    <button
                      disabled={pending}
                      onClick={() =>
                        void run({
                          op: "complete",
                          id: item.id,
                          revision: item.itinerary_revision || 0,
                        })
                      }
                    >
                      {item.completed_at ? "Mark incomplete" : "Mark completed"}
                    </button>
                  )}
                  {untimed && index >= 0 && (
                    <>
                      <button
                        aria-label={"Move " + item.title + " earlier"}
                        disabled={pending || index === 0}
                        onClick={() => reorder(item, -1)}
                      >
                        <ArrowUp size={15} />
                      </button>
                      <button
                        aria-label={"Move " + item.title + " later"}
                        disabled={pending || index === reorderable.length - 1}
                        onClick={() => reorder(item, 1)}
                      >
                        <ArrowDown size={15} />
                      </button>
                    </>
                  )}
                </>
              ) : (
                <LinkComponent href={href("add") + "&edit=" + item.id}>
                  Edit saved plan
                </LinkComponent>
              ))}
          </div>
        </div>
      </article>
    );
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editor) return;
    const parsed = activityInput.safeParse(editor);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      feedback.current?.focus();
      return;
    }
    await run({ op: "save", input: parsed.data }, true);
  }
  async function findIdeas() {
    if (guard.current) return;
    guard.current = true;
    setPending(true);
    setError("");
    setMessage("");
    const id = requestId || crypto.randomUUID();
    setRequestId(id);
    try {
      const result = await explore({
        requestId: id,
        day,
        destination,
        interests,
      });
      if (result.error) setError(result.error);
      else {
        setMessage(result.message || "Ideas saved.");
        setRequestId(null);
      }
    } catch {
      setError(
        "The ideas request was interrupted. Retry this request to check it before starting another search.",
      );
    } finally {
      guard.current = false;
      setPending(false);
    }
  }
  const visibleIdeas = ideas.filter(
    (i) => !i.dismissed && !i.accepted_segment_id,
  );
  const scheduled = [
    ...daily.timed.map((s) => ({
      key: s.id,
      time: s.local_time,
      item: s,
      booking: null as Booking | null,
    })),
    ...daily.standalone
      .filter((b) => b.local_time && b.start_date === day)
      .map((b) => ({ key: b.id, time: b.local_time, item: null, booking: b })),
  ].sort((a, b) => a.time.localeCompare(b.time) || a.key.localeCompare(b.key));
  const outside = segments.filter(
    (s) =>
      s.status !== "idea" &&
      (s.start_date < trip.start_date || s.end_date > trip.end_date),
  );
  return (
    <div className="trip-itinerary">
      <header className="itinerary-header">
        <div>
          <p className="eyebrow">Make room for the good stuff</p>
          <h1>Your itinerary</h1>
          <p>
            {trip.name}
            {destinations.length
              ? " · " + destinations.map((d) => d.label).join(" → ")
              : ""}
          </p>
        </div>
        <LinkComponent className="button" href={tripSectionUrl(trip.id, "hub")}>
          Trip overview
        </LinkComponent>
      </header>
      <nav className="itinerary-trip-links" aria-label="Trip sections">
        {[
          ["hub", "Overview"],
          ["bookings", "Bookings"],
          ["itinerary", "Itinerary"],
          ["packing", "Packing"],
          ["documents", "Documents"],
          ["budget", "Budget"],
        ].map(([view, label]) => (
          <LinkComponent
            key={view}
            href={href(view)}
            aria-current={view === "itinerary" ? "page" : undefined}
          >
            {label}
          </LinkComponent>
        ))}
      </nav>
      {!canEdit && (
        <p className="itinerary-notice">
          You have view-only access. Your saved plans are shown below.
        </p>
      )}
      {!ready && (
        <p className="itinerary-notice" role="status">
          Your saved itinerary is available. New planning tools need database
          update 014, which has not been applied automatically.{" "}
          <LinkComponent href={href("add")}>
            Open the existing plan editor
          </LinkComponent>
          .
        </p>
      )}
      {loadError && (
        <p className="itinerary-notice" role="alert">
          {loadError}
        </p>
      )}
      {!range ? (
        <section className="itinerary-card">
          <h2>Add trip dates to plan your days</h2>
          <p>
            This older trip has incomplete dates. Nothing has been assigned a
            date automatically.
          </p>
          <LinkComponent href={href("hub")}>Review trip details</LinkComponent>
        </section>
      ) : (
        <>
          <div className="itinerary-date-controls">
            <button
              aria-label="Previous day"
              disabled={!range.previous || pending}
              onClick={() => range.previous && changeDay(range.previous)}
            >
              <ChevronLeft size={18} />
            </button>
            <nav className="itinerary-days" aria-label="Itinerary days">
              {range.days.map((d) => (
                <button
                  key={d.day}
                  aria-current={day === d.day ? "date" : undefined}
                  onClick={() => changeDay(d.day)}
                  disabled={pending}
                >
                  <strong>Day {d.number}</strong>
                  <span>
                    {new Date(d.day + "T12:00:00Z").toLocaleDateString("en", {
                      month: "short",
                      day: "numeric",
                      timeZone: "UTC",
                    })}
                  </span>
                </button>
              ))}
            </nav>
            <button
              aria-label="Next day"
              disabled={!range.next || pending}
              onClick={() => range.next && changeDay(range.next)}
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="itinerary-day-heading">
            <div>
              <h2>
                Day {range.index + 1}{" "}
                <span>
                  —{" "}
                  {new Date(day + "T12:00:00Z").toLocaleDateString("en", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    timeZone: "UTC",
                  })}
                </span>
              </h2>
              <p>
                {context?.label ||
                  (destinations.length > 1
                    ? "Multiple destinations · Stops have no day allocation"
                    : destinations.length
                      ? "Destination dates have not been allocated"
                      : "Add destinations in trip details")}{" "}
                · {daily.timed.length + daily.untimed.length} planned items
              </p>
            </div>
            <label className="itinerary-jump">
              Jump to date
              <input
                type="date"
                aria-label="Jump to date"
                min={trip.start_date}
                max={trip.end_date}
                value={day}
                disabled={pending}
                onChange={(e) => {
                  if (
                    e.target.value >= trip.start_date &&
                    e.target.value <= trip.end_date
                  )
                    changeDay(e.target.value);
                }}
              />
            </label>
          </div>
          <div className="itinerary-toolbar">
            {canEdit && (
              <button
                ref={addRef}
                className="button primary"
                disabled={!enabled || pending}
                onClick={() => open()}
              >
                <Plus size={17} /> Add activity
              </button>
            )}
            <button
              className="button"
              aria-expanded={showExplore}
              aria-controls="itinerary-ideas"
              onClick={() => setShowExplore(!showExplore)}
            >
              <Sparkles size={17} /> Explore ideas
            </button>
            <LinkComponent href={href("bookings")}>
              Manage bookings →
            </LinkComponent>
          </div>
          <p
            className={
              error ? "itinerary-notice itinerary-error" : "itinerary-feedback"
            }
            ref={feedback}
            tabIndex={-1}
            role={error ? "alert" : "status"}
          >
            {error || message}
          </p>
          {editor && (
            <form
              ref={editorRef}
              onSubmit={save}
              className="itinerary-card itinerary-editor"
              aria-label="Activity editor"
            >
              <div className="section-top">
                <h2>
                  {segments.some((s) => s.id === editor.id)
                    ? "Edit your activity"
                    : "A little something to look forward to"}
                </h2>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setEditor(null);
                    addRef.current?.focus();
                  }}
                >
                  Cancel
                </button>
              </div>
              <fieldset
                disabled={pending}
                className="itinerary-form-grid"
                aria-busy={pending}
              >
                <label className="itinerary-wide">
                  Activity name
                  <input
                    ref={titleRef}
                    required
                    maxLength={200}
                    disabled={pending}
                    value={editor.title}
                    onChange={(e) =>
                      setEditor({ ...editor, title: e.target.value })
                    }
                  />
                </label>
                <label>
                  Date
                  <input
                    type="date"
                    required
                    min={trip.start_date}
                    max={trip.end_date}
                    disabled={pending}
                    value={editor.day}
                    onChange={(e) =>
                      setEditor({ ...editor, day: e.target.value })
                    }
                  />
                </label>
                <label>
                  Category
                  <select
                    aria-label="Category"
                    disabled={pending}
                    value={editor.category}
                    onChange={(e) =>
                      setEditor({
                        ...editor,
                        category: e.target.value as ActivityInput["category"],
                      })
                    }
                  >
                    <option value="">No category</option>
                    {activityCategories.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Start time (optional)
                  <input
                    type="time"
                    disabled={pending}
                    value={editor.start}
                    onChange={(e) =>
                      setEditor({ ...editor, start: e.target.value })
                    }
                  />
                </label>
                <label>
                  End time (optional)
                  <input
                    type="time"
                    disabled={pending}
                    value={editor.end}
                    onChange={(e) =>
                      setEditor({ ...editor, end: e.target.value })
                    }
                  />
                </label>
                <label className="itinerary-wide">
                  Destination (optional)
                  <select
                    aria-label="Destination (optional)"
                    disabled={pending}
                    value={editor.destination}
                    onChange={(e) =>
                      setEditor({ ...editor, destination: e.target.value })
                    }
                  >
                    <option value="">No destination association</option>
                    {destinations.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="itinerary-wide">
                  Location (optional)
                  <input
                    maxLength={500}
                    placeholder="A place or address you know"
                    disabled={pending}
                    value={editor.location}
                    onChange={(e) =>
                      setEditor({ ...editor, location: e.target.value })
                    }
                  />
                </label>
                <label className="itinerary-wide">
                  Notes (optional)
                  <textarea
                    maxLength={4000}
                    rows={3}
                    disabled={pending}
                    value={editor.notes}
                    onChange={(e) =>
                      setEditor({ ...editor, notes: e.target.value })
                    }
                  />
                </label>
              </fieldset>
              <p className="itinerary-meta">
                Times use the saved destination’s time zone, or this activity’s
                existing zone (
                {segments.find((s) => s.id === editor.id)?.timezone ||
                  trip.timezone}
                ). No reservation is created. Leave both times blank for an
                untimed activity.
              </p>
              <button className="button primary" disabled={pending}>
                {pending ? "Saving…" : "Save activity"}
              </button>
            </form>
          )}
          <div className={"itinerary-grid" + (showExplore ? " has-ideas" : "")}>
            <section className="itinerary-schedule" aria-label="Daily schedule">
              {daily.warnings.length > 0 && (
                <aside className="itinerary-notice" aria-label="Planning notes">
                  <strong>A little planning check</strong>
                  {daily.warnings.slice(0, 5).map((w) => (
                    <p key={w}>{w}</p>
                  ))}
                </aside>
              )}
              {!scheduled.length &&
                !daily.untimed.length &&
                !daily.standalone.length && (
                  <div className="itinerary-empty">
                    <span className="itinerary-empty-icon">
                      <CalendarDays size={26} />
                    </span>
                    <h2>Your adventure, your schedule.</h2>
                    <p>
                      Start adding activities or explore ideas for your trip.
                    </p>
                    <p className="itinerary-meta">
                      A little space for spontaneity is a good thing.
                    </p>
                  </div>
                )}
              {scheduled.length > 0 && (
                <>
                  <h3 className="itinerary-section-label">On the schedule</h3>
                  <div className="itinerary-timeline">
                    {scheduled.map((row) =>
                      row.item ? (
                        activityCard(row.item)
                      ) : (
                        <article
                          key={row.key}
                          className="itinerary-card itinerary-activity"
                        >
                          <div className="itinerary-time">
                            {row.time}
                            <small>{row.booking!.timezone}</small>
                          </div>
                          <div className="itinerary-card-body">
                            <h3>{row.booking!.title}</h3>
                            {bookingDetails(row.booking!)}
                            <p className="itinerary-meta">
                              {row.booking!.category}
                            </p>
                          </div>
                        </article>
                      ),
                    )}
                  </div>
                </>
              )}
              {(daily.untimed.length > 0 ||
                daily.standalone.some(
                  (b) => !b.local_time || b.start_date !== day,
                )) && (
                <>
                  <h3 className="itinerary-section-label">
                    Flexible plans & ongoing stays
                  </h3>
                  <p className="itinerary-meta">
                    Untimed activities stay flexible. Use the arrows to order
                    them.
                  </p>
                  {daily.untimed.map((s) => activityCard(s, true))}
                  {daily.standalone
                    .filter((b) => !b.local_time || b.start_date !== day)
                    .map((b) => (
                      <article className="itinerary-card" key={b.id}>
                        {bookingDetails(b)}
                        <p className="itinerary-meta">
                          {b.category} ·{" "}
                          {b.start_date === day
                            ? "Time not supplied"
                            : "Ongoing booking"}{" "}
                          · {b.start_date} – {b.end_date}
                        </p>
                      </article>
                    ))}
                </>
              )}
              {daily.gaps.length > 0 && (
                <details className="itinerary-card itinerary-gaps">
                  <summary>Space between saved plans</summary>
                  <p>
                    These are gaps between saved time intervals, without travel
                    time or feasibility checks.
                  </p>
                  {daily.gaps.slice(0, 5).map((g, i) => (
                    <p key={i}>
                      {g.minutes} minutes between {g.after} and {g.before}.
                    </p>
                  ))}
                </details>
              )}
              {(daily.uncertain.length > 0 ||
                daily.timed.some((s) => !s.duration_minutes)) && (
                <p className="itinerary-meta">
                  Some plans have no reliable end time. Overlap checks only use
                  saved, valid start and end times.
                </p>
              )}
              {(pendingBookings > 0 || daily.undatedBookings > 0) && (
                <p className="itinerary-notice">
                  <LinkComponent href={href("bookings")}>
                    {pendingBookings} booking{" "}
                    {pendingBookings === 1 ? "entry needs" : "entries need"}{" "}
                    review
                  </LinkComponent>
                  . Undated entries stay in Bookings until their dates are
                  reviewed.
                  {daily.undatedBookings > 0
                    ? " " +
                      daily.undatedBookings +
                      " saved bookings have no usable date."
                    : ""}
                </p>
              )}
              {segments.some((s) => s.status === "idea") && (
                <details className="itinerary-card">
                  <summary>
                    Saved ideas without a scheduled day (
                    {segments.filter((s) => s.status === "idea").length})
                  </summary>
                  <p>
                    Choose a day explicitly before scheduling these saved ideas.
                  </p>
                  {segments
                    .filter((s) => s.status === "idea")
                    .map((s) => (
                      <div key={s.id} className="itinerary-saved-idea">
                        <strong>{s.title}</strong>
                        <p>{s.notes}</p>
                        {enabled && (
                          <button
                            disabled={pending}
                            onClick={() =>
                              open({ ...s, start_date: day, end_date: day })
                            }
                          >
                            Choose day / edit
                          </button>
                        )}
                      </div>
                    ))}
                </details>
              )}
              {outside.length > 0 && (
                <details className="itinerary-card">
                  <summary>
                    Plans outside the current dates ({outside.length})
                  </summary>
                  {outside.map((s) => (
                    <p key={s.id}>
                      {s.title} · {s.start_date} – {s.end_date}{" "}
                      {enabled && (
                        <LinkComponent href={href("add") + "&edit=" + s.id}>
                          Review dates
                        </LinkComponent>
                      )}
                    </p>
                  ))}
                </details>
              )}
            </section>
            {showExplore && (
              <aside className="itinerary-ideas" id="itinerary-ideas">
                <section className="itinerary-card itinerary-explore">
                  <span className="eyebrow">
                    <Sparkles size={16} /> A little inspiration
                  </span>
                  <h2>Find something amazing to do</h2>
                  <p>
                    Discover ideas that fit your destination and travel style.
                  </p>
                  <span className="itinerary-tag">
                    {travelStyleLabel(trip.style)} preference
                  </span>
                  <p className="itinerary-meta">
                    Ideas are unverified planning suggestions, not reservations.
                    Check details before making plans.
                  </p>
                  {!live ? (
                    <p role="status">
                      Live ideas are not configured yet. Your own plans and
                      saved ideas are still available.
                    </p>
                  ) : !ready ? (
                    <p>
                      Ideas need database update 014 before they can be saved.
                    </p>
                  ) : !canEdit ? (
                    <p>Ask a trip editor to request ideas.</p>
                  ) : (
                    <div className="itinerary-ideas-form">
                      <label>
                        Ideas for destination
                        <select
                          aria-label="Ideas for destination"
                          disabled={pending}
                          value={destination}
                          onChange={(e) => {
                            setDestination(e.target.value);
                            setRequestId(null);
                          }}
                        >
                          <option value="">
                            All saved destinations (no stop allocation)
                          </option>
                          {destinations.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Your interests (optional)
                        <textarea
                          rows={2}
                          maxLength={500}
                          disabled={pending}
                          value={interests}
                          onChange={(e) => {
                            setInterests(e.target.value);
                            setRequestId(null);
                          }}
                          placeholder="Art, quiet walks, local food…"
                        />
                      </label>
                      <button
                        className="button primary"
                        disabled={pending}
                        onClick={() => void findIdeas()}
                      >
                        {pending
                          ? "Finding ideas…"
                          : requestId
                            ? "Retry this request"
                            : "Explore ideas"}
                      </button>
                      {requestId && (
                        <button
                          disabled={pending}
                          onClick={() => {
                            setRequestId(null);
                            setMessage(
                              "A new search will make a new AI request when you click Explore ideas.",
                            );
                          }}
                        >
                          Start a new search
                        </button>
                      )}
                      <small>
                        Uses your existing AI request allowance. Nothing is
                        added automatically.
                      </small>
                    </div>
                  )}
                </section>
                {visibleIdeas.length === 0 && (
                  <p className="itinerary-meta">
                    No saved suggestions to review yet.
                  </p>
                )}
                {visibleIdeas.map((i) => (
                  <article className="itinerary-card itinerary-idea" key={i.id}>
                    <span className="itinerary-tag">
                      {i.source === "mock"
                        ? "Sample idea · not live AI"
                        : "AI-assisted · unverified"}
                    </span>
                    <h3>{i.title}</h3>
                    <p>{i.note}</p>
                    <p className="itinerary-meta">
                      {i.category}
                      {i.context?.destination
                        ? " · " + i.context.destination
                        : ""}
                      {i.context?.day
                        ? " · Requested for " + i.context.day
                        : ""}
                    </p>
                    {enabled && (
                      <>
                        <p className="itinerary-meta">
                          Adds an untimed activity to Day {range.index + 1}. You
                          can edit its time later.
                        </p>
                        <div className="itinerary-idea-actions">
                          <button
                            className="button primary"
                            disabled={pending}
                            onClick={() =>
                              void run({
                                op: "add-idea",
                                id: i.id,
                                day,
                                destination:
                                  destination ||
                                  i.context?.destination_id ||
                                  "",
                              })
                            }
                          >
                            Add to itinerary
                          </button>
                          <button
                            disabled={pending}
                            onClick={() =>
                              void run({
                                op: "dismiss-idea",
                                id: i.id,
                                day,
                                destination: "",
                              })
                            }
                          >
                            Dismiss
                          </button>
                        </div>
                      </>
                    )}
                  </article>
                ))}
              </aside>
            )}
          </div>
        </>
      )}
    </div>
  );
}
