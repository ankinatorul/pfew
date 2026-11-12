"use client";
import {
  useState,
  useRef,
  useEffect,
  type ReactNode,
  type ElementType,
  type FormEvent,
} from "react";
import {
  Plus,
  Upload,
  Ticket,
  FileText,
  CalendarDays,
  MapPin,
  ArrowLeft,
} from "lucide-react";
import type { Trip, Segment } from "../lib/domain";
import { categories, bookingSchema } from "../lib/essentials";
import {
  bookingLabels,
  bookingPriceLabel,
  currencyTotals,
  displayMoney,
  type ManagedBooking,
  type PrivateConfirmation,
  type MoneyResult,
} from "../lib/booking-budget";
import { BookingFields } from "./booking-fields";
import { tripSectionUrl } from "../lib/trip-navigation";
export function MoneyHeader({
  trip,
  view,
  LinkComponent = "a",
}: {
  trip: Trip;
  view: "bookings" | "budget" | "packing" | "documents";
  LinkComponent?: ElementType;
}) {
  return (
    <>
      <header className="money-header">
        <div>
          <p className="eyebrow">Your travel space · {trip.name}</p>
          <h1>
            {
              {
                bookings: "Your bookings",
                budget: "Your budget",
                packing: "Your packing list",
                documents: "Your documents",
              }[view]
            }
          </h1>
          <p>
            {
              {
                bookings: "All your reservations, in one happy place.",
                budget: "More adventures, fewer money surprises.",
                packing: "A little less “did I forget…?”",
                documents: "Everything you need, close at hand.",
              }[view]
            }
          </p>
        </div>
        <LinkComponent href={tripSectionUrl(trip.id, "hub")} className="button">
          Trip overview
        </LinkComponent>
      </header>
      <nav className="money-navigation" aria-label="Trip sections">
        {[
          ["hub", "Overview"],
          ["itinerary", "Itinerary"],
          ["bookings", "Bookings"],
          ["packing", "Packing"],
          ["documents", "Documents"],
          ["budget", "Budget"],
        ].map(([key, label]) => (
          <LinkComponent
            key={key}
            href={tripSectionUrl(trip.id, key)}
            aria-current={view === key ? "page" : undefined}
          >
            {label}
          </LinkComponent>
        ))}
      </nav>
    </>
  );
}
export type BookingsProps = {
  trip: Trip;
  segments: Segment[];
  bookings: ManagedBooking[];
  attachments: PrivateConfirmation[];
  canEdit: boolean;
  ready: boolean;
  collectionReady: boolean;
  owner: boolean;
  initialEdit?: string;
  loadError?: string;
  collection: ReactNode;
  fileTools?: Record<string, ReactNode>;
};
export function BookingManager({
  trip,
  segments,
  bookings,
  attachments,
  canEdit,
  ready,
  owner,
  collectionReady,
  initialEdit,
  loadError,
  collection,
  fileTools = {},
  save,
  remove,
  LinkComponent = "a",
}: BookingsProps & {
  save: (form: FormData) => Promise<MoneyResult>;
  remove: (booking: ManagedBooking) => Promise<MoneyResult>;
  LinkComponent?: ElementType;
}) {
  const [category, setCategory] = useState("all"),
    [review, setReview] = useState("all"),
    [reservation, setReservation] = useState("all"),
    [query, setQuery] = useState(""),
    [details, setDetails] = useState<string | null>(null),
    [editor, setEditor] = useState<{
      id: string;
      item?: ManagedBooking;
    } | null>(() =>
      initialEdit
        ? { id: initialEdit, item: bookings.find((b) => b.id === initialEdit) }
        : null,
    ),
    [collect, setCollect] = useState(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const guard = useRef(false),
    editorRef = useRef<HTMLFormElement>(null),
    detailRef = useRef<HTMLElement>(null),
    feedback = useRef<HTMLParagraphElement>(null),
    addRef = useRef<HTMLButtonElement>(null),
    collectionRef = useRef<HTMLDivElement>(null);
  const editorId = editor?.id;
  useEffect(() => {
    if (editorId) {
      const field =
        editorRef.current?.querySelector<HTMLInputElement>("[name=title]");
      field?.focus();
      editorRef.current?.scrollIntoView({ block: "start" });
    }
  }, [editorId]);
  useEffect(() => {
    if (details) {
      detailRef.current?.focus();
      detailRef.current?.scrollIntoView({ block: "start" });
    }
  }, [details]);
  if (loadError)
    return (
      <div className="trip-bookings money-page">
        <MoneyHeader
          trip={trip}
          view="bookings"
          LinkComponent={LinkComponent}
        />
        <p role="alert" className="money-notice">
          {loadError} Saved totals are unavailable, rather than zero.
        </p>
      </div>
    );
  const allowed = canEdit && ready && !loadError;
  const selected = bookings.find((b) => b.id === details);
  const filtered = bookings
    .filter(
      (b) =>
        (category === "all" || b.category === category) &&
        (review === "all" || b.verification === review) &&
        (reservation === "all" ||
          (b.reservation_status || "unknown") === reservation) &&
        [b.title, b.provider, b.reference, b.location_label, b.origin]
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort(
      (a, b) =>
        a.start_date.localeCompare(b.start_date) ||
        a.local_time.localeCompare(b.local_time) ||
        a.id.localeCompare(b.id),
    );
  function edit(item?: ManagedBooking) {
    setError("");
    setDetails(null);
    setEditor({ id: item?.id || crypto.randomUUID(), item });
  }
  async function execute(action: () => Promise<MoneyResult>, close = false) {
    if (guard.current) return;
    guard.current = true;
    setPending(true);
    setError("");
    setMessage("");
    try {
      const r = await action();
      if (r.error) {
        setError(r.error);
        requestAnimationFrame(() => feedback.current?.focus());
        return;
      }
      setMessage(r.message || "Saved.");
      if (close) {
        setEditor(null);
        setDetails(null);
        requestAnimationFrame(() => addRef.current?.focus());
      }
    } catch {
      setError(
        "The request was interrupted. Your input is still here. Check your connection and retry.",
      );
    } finally {
      guard.current = false;
      setPending(false);
    }
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    form.set("trip_id", trip.id);
    const parsed = bookingSchema.safeParse(Object.fromEntries(form));
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      feedback.current?.focus();
      return;
    }
    await execute(() => save(form), true);
  }
  const totals = currencyTotals(
    bookings.filter((b) => b.reservation_status !== "cancelled"),
    (b) => b.price,
  );
  function files(id: string) {
    return attachments.filter((a) => a.booking_id === id);
  }
  return (
    <div className="trip-bookings money-page">
      <MoneyHeader trip={trip} view="bookings" LinkComponent={LinkComponent} />
      {loadError && (
        <p className="money-notice" role="alert">
          {loadError}
        </p>
      )}
      {!ready && (
        <p className="money-notice">
          Your saved bookings remain readable. New edit controls need the
          reviewed database update 015.
        </p>
      )}
      {!canEdit && (
        <p className="money-notice">You have view-only access to this trip.</p>
      )}
      <div className="money-summary">
        <article className="money-card money-lavender">
          <span className="money-icon">
            <Ticket size={20} />
          </span>
          <h2>
            {bookings.length} saved{" "}
            {bookings.length === 1 ? "booking" : "bookings"}
          </h2>
          <p>
            {
              bookings.filter((b) => b.reservation_status === "confirmed")
                .length
            }{" "}
            reservations marked confirmed
          </p>
        </article>
        <article className="money-card">
          <span className="money-icon lime">
            <FileText size={20} />
          </span>
          <h2>
            {bookings.filter((b) => b.verification !== "user confirmed").length}{" "}
            need review
          </h2>
          <p>Reviewing details never confirms a reservation.</p>
        </article>
        <article className="money-card">
          <h2>Saved booking prices</h2>
          {totals.length ? (
            totals.map((t) => (
              <strong className="money-total" key={t.currency}>
                {displayMoney(t.currency, t.amount)}
              </strong>
            ))
          ) : (
            <strong className="money-total">No prices saved</strong>
          )}
          <p>Cancelled bookings excluded. These are not recorded expenses.</p>
        </article>
      </div>
      <div className="money-toolbar">
        {canEdit && (
          <button
            ref={addRef}
            className="button primary"
            disabled={!allowed || pending}
            onClick={() => edit()}
          >
            <Plus size={17} /> Add booking
          </button>
        )}
        {owner && (
          <button
            className="button"
            disabled={!collectionReady || !!loadError}
            aria-expanded={collect}
            onClick={() => {
              setCollect(!collect);
              requestAnimationFrame(() =>
                collectionRef.current?.scrollIntoView({ block: "start" }),
              );
            }}
          >
            <Upload size={17} /> Upload confirmation / review
          </button>
        )}
        <LinkComponent href={tripSectionUrl(trip.id, "itinerary")}>
          Open itinerary →
        </LinkComponent>
      </div>
      {owner && !collectionReady && (
        <p className="money-notice">
          Confirmation collection is unavailable. Check the saved collection and
          reviewed database updates before uploading. Existing bookings stay
          available.
        </p>
      )}
      <p
        ref={feedback}
        tabIndex={-1}
        className={error ? "money-notice money-error" : "money-feedback"}
        role={error ? "alert" : "status"}
      >
        {error || message}
      </p>
      {collect && (
        <div ref={collectionRef} className="money-collection">
          {collection}
        </div>
      )}
      {editor && allowed && (
        <form
          ref={editorRef}
          key={editor.id}
          onSubmit={submit}
          className="money-card money-editor"
          aria-label="Booking editor"
        >
          <div className="money-section-heading">
            <h2>
              {editor.item
                ? "Update your booking"
                : "Save a booking you already have"}
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
          <input type="hidden" name="id" value={editor.id} />
          <input
            type="hidden"
            name="revision"
            value={editor.item?.finance_revision || 0}
          />
          <fieldset disabled={pending}>
            <div className="money-booking-fields">
              <BookingFields
                trip={trip}
                segments={segments}
                item={editor.item}
                draft={
                  editor.item
                    ? undefined
                    : {
                        start_date: "",
                        end_date: "",
                        currency: trip.currency,
                        timezone: trip.timezone,
                      }
                }
                managed
              />
            </div>
            <p className="money-muted">
              Save only dates and amounts you know. “Reviewed” refers to checked
              details, not a confirmed reservation. Linking a saved activity
              does not create a second itinerary entry.
            </p>
            <button className="button primary" disabled={pending}>
              {pending ? "Saving…" : "Save booking"}
            </button>
          </fieldset>
        </form>
      )}
      {selected && (
        <section
          ref={detailRef}
          tabIndex={-1}
          className="money-card money-details"
          aria-label="Booking details"
        >
          <div className="money-section-heading">
            <h2>{selected.title}</h2>
            <button onClick={() => setDetails(null)}>
              <ArrowLeft size={15} /> Back to bookings
            </button>
          </div>
          <div className="money-badges">
            <span className="money-badge">
              {selected.verification === "user confirmed"
                ? "Reviewed"
                : "Needs review"}
            </span>
            <span className="money-badge">
              Reservation {selected.reservation_status || "unknown"}
            </span>
          </div>
          <dl className="money-detail-grid">
            <div>
              <dt>Provider</dt>
              <dd>{selected.provider || "Not supplied"}</dd>
            </div>
            <div>
              <dt>Reservation type</dt>
              <dd>{bookingLabels[selected.category]}</dd>
            </div>
            <div>
              <dt>Start</dt>
              <dd>
                {selected.start_date}{" "}
                {selected.local_time || "· Time not supplied"} ·{" "}
                {selected.timezone}
              </dd>
            </div>
            <div>
              <dt>End</dt>
              <dd>
                {selected.end_date}{" "}
                {selected.end_local_time || "· Time not supplied"}{" "}
                {selected.end_timezone}
              </dd>
            </div>
            <div>
              <dt>Location</dt>
              <dd>
                {selected.location_label || selected.origin || "Not supplied"}
                {selected.end_location_label || selected.destination
                  ? " → " +
                    (selected.end_location_label || selected.destination)
                  : ""}
              </dd>
            </div>
            <div>
              <dt>Travelers</dt>
              <dd>{selected.travelers || "Not supplied"}</dd>
            </div>
            <div>
              <dt>Confirmation reference</dt>
              <dd>{selected.reference || "Not supplied"}</dd>
            </div>
            <div>
              <dt>{bookingPriceLabel(selected)}</dt>
              <dd>
                {selected.price === null
                  ? "Unknown"
                  : displayMoney(selected.currency, selected.price)}
              </dd>
            </div>
            <div>
              <dt>Amount noted as paid</dt>
              <dd>
                {selected.paid_amount === null
                  ? "Unknown"
                  : displayMoney(selected.currency, selected.paid_amount)}{" "}
                · {selected.payment_status}
              </dd>
            </div>
            <div>
              <dt>Itinerary link</dt>
              <dd>
                {segments.find((s) => s.id === selected.segment_id)?.title ||
                  "No linked activity"}
              </dd>
            </div>
          </dl>
          {selected.notes && <p className="money-notes">{selected.notes}</p>}
          <h3>Your private confirmations</h3>
          <p className="money-muted">
            Files are private to your account. Downloads use existing
            authorized, expiring links.
          </p>
          {files(selected.id).length ? (
            files(selected.id).map((f) => (
              <div key={f.id} className="money-file">
                {f.state === "ready" ? (
                  <a className="button" href={"/api/attachments/" + f.id}>
                    Open confirmation · {f.filename}
                  </a>
                ) : (
                  <p>
                    Upload incomplete: {f.filename}. Use the existing file tools
                    to remove it and retry.
                  </p>
                )}
              </div>
            ))
          ) : (
            <p>No private confirmation files are available in this account.</p>
          )}
          {fileTools[selected.id]}
          {allowed && (
            <button
              className="button primary"
              disabled={pending}
              onClick={() => edit(selected)}
            >
              Edit booking
            </button>
          )}
        </section>
      )}
      <div className="money-filters">
        <label>
          Search bookings
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Title, provider or reference"
          />
        </label>
        <label>
          Booking type
          <select
            aria-label="Booking type"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="all">All types</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {bookingLabels[c]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Review status
          <select
            aria-label="Filter review status"
            value={review}
            onChange={(e) => setReview(e.target.value)}
          >
            <option value="all">All reviews</option>
            <option value="unverified">Needs review</option>
            <option value="user confirmed">Reviewed</option>
          </select>
        </label>
        <label>
          Reservation status
          <select
            aria-label="Filter reservation status"
            value={reservation}
            onChange={(e) => setReservation(e.target.value)}
          >
            <option value="all">All reservations</option>
            {["unknown", "confirmed", "pending", "cancelled"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>
      {!bookings.length ? (
        <section className="money-empty">
          <Ticket size={30} />
          <h2>A little less searching, a little more going.</h2>
          <p>Add a reservation or upload a confirmation when you have one.</p>
        </section>
      ) : !filtered.length ? (
        <p className="money-notice">No bookings match these filters.</p>
      ) : (
        categories
          .filter((c) => filtered.some((b) => b.category === c))
          .map((c) => (
            <section key={c} className="money-booking-group">
              <h2>{bookingLabels[c]}</h2>
              <div className="money-booking-grid">
                {filtered
                  .filter((b) => b.category === c)
                  .map((b) => (
                    <article
                      className="money-card money-booking"
                      aria-label={b.title}
                      key={b.id}
                    >
                      <div className="money-badges">
                        <span
                          className={
                            "money-badge" +
                            (b.verification === "user confirmed"
                              ? " reviewed"
                              : "")
                          }
                        >
                          {b.verification === "user confirmed"
                            ? "Reviewed"
                            : "Needs review"}
                        </span>
                        <span className="money-reservation">
                          {b.reservation_status || "unknown"}
                        </span>
                      </div>
                      <h3>{b.title}</h3>
                      {b.provider && <p>{b.provider}</p>}
                      <p>
                        <CalendarDays size={15} /> {b.start_date}
                        {b.end_date !== b.start_date ? " – " + b.end_date : ""}
                        {b.local_time
                          ? " · " + b.local_time + " " + b.timezone
                          : " · Time not supplied"}
                      </p>
                      {(b.location_label || b.origin) && (
                        <p>
                          <MapPin size={15} /> {b.location_label || b.origin}
                        </p>
                      )}
                      {b.reference && (
                        <p className="money-muted">Reference: {b.reference}</p>
                      )}
                      <strong className="money-booking-price">
                        {b.price === null
                          ? "Price not supplied"
                          : displayMoney(b.currency, b.price)}
                      </strong>
                      <p className="money-muted">{bookingPriceLabel(b)}</p>
                      <p className="money-muted">
                        {files(b.id).length} private{" "}
                        {files(b.id).length === 1 ? "file" : "files"} in your
                        account{b.segment_id ? " · Linked to itinerary" : ""}
                      </p>
                      <div className="money-card-actions">
                        <button
                          onClick={() => {
                            setError("");
                            setDetails(b.id);
                          }}
                        >
                          View details
                        </button>
                        {files(b.id).find((f) => f.state === "ready") && (
                          <a
                            className="button"
                            href={
                              "/api/attachments/" +
                              files(b.id).find((f) => f.state === "ready")!.id
                            }
                          >
                            Open confirmation
                          </a>
                        )}
                        {allowed && (
                          <>
                            <button disabled={pending} onClick={() => edit(b)}>
                              {b.verification === "user confirmed"
                                ? "Edit"
                                : "Review / edit"}
                            </button>
                            <button
                              disabled={pending}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    "Remove “" +
                                      b.title +
                                      "”? This deletes this booking and its private confirmation files from your account. Other travelers’ files must be removed by them first. Linked itinerary activities and recorded expenses stay saved; their booking links are cleared.",
                                  )
                                )
                                  void execute(() => remove(b), true);
                              }}
                            >
                              Remove
                            </button>
                          </>
                        )}
                      </div>
                    </article>
                  ))}
              </div>
            </section>
          ))
      )}
    </div>
  );
}
