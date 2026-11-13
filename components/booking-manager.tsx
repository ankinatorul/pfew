"use client";
import {
  useState,
  useRef,
  useEffect,
  type ReactNode,
  type ElementType,
} from "react";
import { Ticket, FileText, ArrowLeft, MoreHorizontal } from "lucide-react";
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
import { BookingEditor, BookingOptions, BookingCard } from "./shared-booking";
import {
  emptyCollectionEntry,
  type CollectionEntry,
} from "../lib/booking-collection";
import { managedBookingEntry } from "../lib/simple-booking";
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
  paymentDueReady?: boolean;
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
  paymentDueReady = false,
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
    [dirty, setDirty] = useState(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [returnFocus, setReturnFocus] = useState<HTMLElement | null>(null);
  const guard = useRef(false),
    detailRef = useRef<HTMLElement>(null),
    feedback = useRef<HTMLParagraphElement>(null),
    collectionRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!dirty) return;
    const protect = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [dirty]);
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
    setDirty(false);
    setReturnFocus(
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null,
    );
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
        setDirty(false);
        setEditor(null);
        setDetails(null);
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
  async function submit(fields: CollectionEntry["fields"], reviewed = false) {
    if (!editor) return;
    const form = new FormData();
    for (const [key, value] of Object.entries(fields))
      form.set(key, value == null ? "" : String(value));
    form.set("trip_id", trip.id);
    form.set("id", editor.id);
    form.set("revision", String(editor.item?.finance_revision || 0));
    form.set("simplified", "1");
    if (!paymentDueReady) form.delete("payment_due_date");
    form.set(
      "verification",
      reviewed ? "user confirmed" : editor.item?.verification || "unverified",
    );
    const parsed = bookingSchema.safeParse({
      ...fields,
      trip_id: trip.id,
      verification: form.get("verification"),
    });
    if (!parsed.success) {
      setError(
        !fields.start_date || !fields.end_date
          ? "Add the booking dates before saving this scheduled reservation. Your changes are still here."
          : parsed.error.issues[0].message,
      );
      return;
    }
    await execute(() => save(form), true);
  }
  function closeEditor() {
    if (guard.current) return;
    if (dirty && !window.confirm("Discard unsaved booking changes?")) return;
    setEditor(null);
    setDirty(false);
    setError("");
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
      {owner ? (
        <div ref={collectionRef} className="money-collection">
          {collection}
        </div>
      ) : (
        canEdit && (
          <BookingOptions
            disabled={!allowed || pending}
            uploadDisabled
            onFiles={() => {}}
            onManual={() => edit()}
          />
        )
      )}
      {owner && !collectionReady && (
        <p className="money-notice">
          Booking collection is temporarily unavailable. Existing bookings stay
          available.
        </p>
      )}
      <div className="money-toolbar">
        <LinkComponent href={tripSectionUrl(trip.id, "itinerary")}>
          Open itinerary →
        </LinkComponent>
      </div>
      <p
        ref={feedback}
        tabIndex={-1}
        className={error ? "money-notice money-error" : "money-feedback"}
        role={error ? "alert" : "status"}
      >
        {error || message}
      </p>
      {editor && allowed && (
        <ManagedBookingEditor
          key={editor.id}
          entry={
            editor.item
              ? managedBookingEntry(editor.item)
              : {
                  ...emptyCollectionEntry(editor.id),
                  fields: {
                    ...emptyCollectionEntry(editor.id).fields,
                    currency: trip.currency,
                    timezone: trip.timezone,
                  },
                }
          }
          trip={trip}
          title={
            editor.item
              ? editor.item.verification === "user confirmed"
                ? "Edit booking"
                : "Review booking"
              : "Add a booking"
          }
          busy={pending}
          error={error}
          paymentDueReady={paymentDueReady}
          returnFocus={returnFocus}
          onClose={closeEditor}
          onDirty={() => setDirty(true)}
          onSave={submit}
          confirmationHref={
            editor.item &&
            files(editor.item.id).find((f) => f.state === "ready")
              ? "/api/attachments/" +
                files(editor.item.id).find((f) => f.state === "ready")!.id
              : undefined
          }
        />
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
                    <BookingCard
                      entry={managedBookingEntry(b)}
                      title={b.title}
                      disabled={pending || !allowed}
                      onOpen={() => edit(b)}
                      key={b.id}
                    >
                      <div className="money-badges">
                        {b.verification === "user confirmed" && (
                          <span className="money-badge reviewed">Reviewed</span>
                        )}
                        <span className="money-reservation">
                          {b.reservation_status || "unknown"}
                        </span>
                      </div>
                      <details className="booking-card-menu">
                        <summary aria-label={`More actions for ${b.title}`}>
                          <MoreHorizontal size={20} />
                        </summary>
                        <div className="actions">
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
                              <button
                                disabled={pending}
                                onClick={() => edit(b)}
                              >
                                {b.verification === "user confirmed"
                                  ? "Edit"
                                  : "Review"}
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
                      </details>
                    </BookingCard>
                  ))}
              </div>
            </section>
          ))
      )}
    </div>
  );
}

function ManagedBookingEditor({
  entry,
  onDirty,
  onSave,
  ...props
}: Omit<
  import("react").ComponentProps<typeof BookingEditor>,
  "onChange" | "onSave"
> & {
  onDirty: () => void;
  onSave: (
    fields: CollectionEntry["fields"],
    reviewed?: boolean,
  ) => Promise<void>;
}) {
  const [reviewed, setReviewed] = useState(false);
  return (
    <BookingEditor
      {...props}
      entry={entry}
      onChange={onDirty}
      onSave={(fields) => onSave(fields, reviewed)}
    >
      {entry.review_status === "needs_review" && (
        <label className="booking-review-check">
          <input
            type="checkbox"
            checked={reviewed}
            onChange={(event) => setReviewed(event.target.checked)}
          />
          I’ve reviewed these details
        </label>
      )}
    </BookingEditor>
  );
}
