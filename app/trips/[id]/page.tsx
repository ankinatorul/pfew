import { Suspense } from "react";
import { Itinerary } from "../../../components/itinerary";
import { savedTripDestinations } from "../../../lib/trip-destinations";
import { travelStyleLabel } from "../../../lib/trip-style";
import { TripNavigation } from "../../../components/trip-navigation";
import { TripDocuments } from "../../../components/trip-documents";
import { TripDashboard } from "../../../components/trip-overview";
import { TripEdit } from "../../../components/trip-edit";
import { QuickAdd } from "../../../components/quick-add";
import { DayPlanControls } from "../../../components/day-plan-controls";
import { DayOverview } from "../../../components/day-overview";
import { TravelNotes } from "../../../components/travel-notes";
import { ResearchView } from "../../../components/research-view";
import { BookingImport } from "../../../components/booking-import";
import { OfflineView } from "../../../components/offline-view";
import { CollaborationView } from "../../../components/collaboration-view";
import { displayTrip } from "../../../lib/finalized-trips";
import { tripRole } from "../../../lib/trip-role";
import { Intelligence } from "../../../components/intelligence";
import { DayBookings } from "../../../components/essentials/day-bookings";
import { EssentialsView } from "../../../components/essentials/view";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { access } from "../../../lib/access";
import { days, lifecycle, type Trip, type Segment } from "../../../lib/domain";
import { SegmentForm, Delete, Submit } from "../../../components/forms";
import { saveLayout } from "../../actions";
export default async function Hub({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    view?: string;
    day?: string;
    edit?: string;
    kind?: string;
    group?: string;
    search?: string;
  }>;
}) {
  const { id } = await params;
  const q = await searchParams;
  const { db, user } = await access();
  const { data, error } = await db
    .from("trips")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) notFound();
  if (data.creation_state === "draft") {
    if (data.owner_id !== user.id) notFound();
    redirect("/trips/new?draft=" + id);
  }
  const trip = displayTrip(data as Trip);
  const role = await tripRole(db, trip, user.id);
  const canEdit = role !== "viewer";
  const [{ data: items, error: itemError }, { data: prefs, error: prefError }] =
    await Promise.all([
      db
        .from("trip_segments")
        .select("*")
        .eq("trip_id", id)
        .order("local_time")
        .order("position"),
      db
        .from("trip_hub_preferences")
        .select("layout")
        .eq("trip_id", id)
        .maybeSingle(),
    ]);
  if (itemError || prefError)
    throw new Error("Trip details could not be loaded");
  const segments = (items || []) as Segment[];
  const view = q.view || "hub";
  const overviewNow = new Date();
  if (view === "hub")
    return (
      <TripDashboard
        trip={trip}
        segments={segments}
        role={role}
        day={q.day}
        now={overviewNow}
      />
    );
  if (view === "itinerary" || view === "ideas")
    return (
      <Suspense
        key={id + ":" + (q.day || "")}
        fallback={
          <div className="trip-itinerary" aria-busy="true">
            <h1>Your itinerary</h1>
            <p role="status">Loading your saved plans…</p>
          </div>
        }
      >
        <Itinerary
          trip={trip}
          segments={segments}
          canEdit={canEdit}
          day={q.day}
          explore={view === "ideas"}
        />
      </Suspense>
    );
  const day = days(trip.start_date, trip.end_date).includes(q.day || "")
    ? q.day!
    : trip.start_date;
  if (view === "settings") {
    if (role !== "owner") notFound();
    return <TripEdit trip={trip} day={day} LinkComponent={Link} />;
  }
  const modules = [
    { key: "itinerary", label: "Your days, your way", kind: "activity" },
    { key: "destinations", label: "Places to call yours", kind: "destination" },
    { key: "stays", label: "Somewhere to slow down", kind: "stay" },
    { key: "transport", label: "Getting from A to happy", kind: "transport" },
    { key: "bookings", label: "Your travel wallet", kind: "wallet" },
    { key: "prep", label: "Ready, set, nearly there", kind: "prep" },
    { key: "packing", label: "Bring the little essentials", kind: "packing" },
    { key: "budget", label: "Room for the good stuff", kind: "budget" },
    { key: "map", label: "Your places, connected", kind: "map" },
    { key: "ideas", label: "Save a little possibility", kind: "ideas" },
    { key: "check", label: "A second look at your plans", kind: "check" },
  ];
  type Pref = {
    key: string;
    visible: boolean;
    size: string;
    highlight: boolean;
    order: number;
  };
  const saved = (prefs?.layout || []) as Pref[];
  const layout: Pref[] = modules.map(
    (m, i) =>
      saved.find((p) => p.key === m.key) || {
        key: m.key,
        visible: true,
        size: "normal",
        highlight: i === 0,
        order: i,
      },
  );
  const base = "/trips/" + id;
  const selected = segments.find((s) => s.id === q.edit);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: trip.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const countdown = Math.ceil(
    (Date.parse(trip.start_date) - Date.parse(today)) / 86400000,
  );
  return (
    <div className={role === "viewer" ? "trip-viewer" : undefined}>
      {role === "viewer" && (
        <p className="card" role="status">
          You have view-only access to this shared trip.
        </p>
      )}
      <Link href="/" className="muted">
        ← All your trips
      </Link>
      <div className="section-top">
        <div>
          <span className="eyebrow">
            {lifecycle(trip.start_date, trip.end_date, trip.timezone)}
            {countdown > 0 ? ` · ${countdown} days to go` : ""}
          </span>
          <h1>{trip.name}</h1>
          <p className="muted">
            {trip.start_date} — {trip.end_date} · {trip.travelers} travelers ·{" "}
            {travelStyleLabel(trip.style)} · {trip.timezone}
          </p>
        </div>
        <Link
          data-edit-action
          className="button primary"
          href={base + "?view=add&day=" + day}
        >
          ＋ Smart Add
        </Link>
      </div>
      <TripNavigation
        tripId={id}
        view={view}
        day={day}
        owner={role === "owner"}
      />
      {view === "documents" && <TripDocuments tripId={id} />}
      {["bookings", "prep", "packing", "budget"].includes(view) && (
        <EssentialsView
          trip={trip}
          segments={segments}
          view={view}
          edit={q.edit}
          group={q.group}
        />
      )}
      {["map", "ideas", "check"].includes(view) && (
        <Intelligence
          trip={trip}
          segments={segments}
          view={view}
          canEdit={canEdit}
          searchQuery={
            typeof q.search === "string" ? q.search.slice(0, 200) : undefined
          }
        />
      )}
      {view === "research" && (
        <ResearchView trip={trip} segments={segments} canEdit={canEdit} />
      )}
      {view === "import" && canEdit && (
        <BookingImport
          trip={trip}
          segments={segments}
          live={
            process.env.AI_MODE === "live" && Boolean(process.env.AI_API_KEY)
          }
        />
      )}
      {view === "offline" && <OfflineView tripId={id} />}
      {view === "people" && <CollaborationView trip={trip} role={role} />}
      {view === "customize" && canEdit && (
        <form action={saveLayout} className="form">
          <h2>Make room for what matters.</h2>
          <p className="muted">
            Hiding a card keeps its data and navigation available.
          </p>
          <input type="hidden" name="trip_id" value={id} />
          {modules.map((m, i) => {
            const p = layout.find((p) => p.key === m.key);
            return (
              <fieldset key={m.key}>
                <legend>{m.key}</legend>
                <label>
                  <input
                    type="checkbox"
                    name={m.key}
                    defaultChecked={p?.visible ?? true}
                  />
                  Show on hub
                </label>
                <div className="two">
                  <label>
                    Order
                    <input
                      type="number"
                      name={m.key + "_order"}
                      min="0"
                      max="10"
                      defaultValue={p?.order ?? i}
                    />
                  </label>
                  <label>
                    Size
                    <select
                      name={m.key + "_size"}
                      defaultValue={p?.size || "normal"}
                    >
                      <option>normal</option>
                      <option>wide</option>
                    </select>
                  </label>
                </div>
                <label>
                  <input
                    type="checkbox"
                    name={m.key + "_highlight"}
                    defaultChecked={p?.highlight}
                  />
                  Highlight card
                </label>
              </fieldset>
            );
          })}
          <Submit>Save my hub</Submit>
        </form>
      )}
      {view === "add" && canEdit && (
        <>
          <h2>
            {selected ? "Edit your plan" : "A place, a plan, a possibility."}
          </h2>
          <p className="muted">
            Add a plan manually, or find a place in Map and save it to Ideas.
          </p>
          {!selected && (
            <div className="actions">
              <Link className="button secondary" href={base + "?view=import"}>
                Import a booking confirmation
              </Link>
              <Link className="button secondary" href={base + "?view=map"}>
                Find and save a place
              </Link>
            </div>
          )}
          {!selected && (
            <QuickAdd
              trip={trip}
              destinations={segments.filter(
                (item) => item.kind === "destination",
              )}
              day={day}
              livePlaces={Boolean(process.env.GOOGLE_PLACES_API_KEY)}
            />
          )}
          {!selected && <h2>Or add the full details.</h2>}
          <SegmentForm
            key={selected?.id || q.kind || "new"}
            trip={trip}
            item={selected}
            kind={q.kind}
            destinations={segments.filter((s) => s.kind === "destination")}
          />
        </>
      )}
      {["itinerary", "destinations", "stays", "transport"].includes(view) && (
        <>
          {view === "itinerary" && (
            <div className="tabs" aria-label="Trip days">
              {days(trip.start_date, trip.end_date).map((d, i) => (
                <Link
                  className={d === day ? "selected" : ""}
                  key={d}
                  href={base + "?view=itinerary&day=" + d}
                >
                  Day {i + 1} ·{" "}
                  {new Date(d + "T12:00:00Z").toLocaleDateString("en", {
                    month: "short",
                    day: "numeric",
                    timeZone: "UTC",
                  })}
                </Link>
              ))}
            </div>
          )}
          <div className="row">
            <h2>
              {view === "itinerary"
                ? "Room for the memorable moments."
                : view.charAt(0).toUpperCase() + view.slice(1)}
            </h2>
            <Link
              data-edit-action
              className="button secondary"
              href={
                base +
                "?view=add&day=" +
                day +
                "&kind=" +
                (modules.find((m) => m.key === view)?.kind || "activity")
              }
            >
              Add{" "}
              {view === "itinerary"
                ? "item"
                : view === "stays"
                  ? "stay"
                  : view === "transport"
                    ? "journey"
                    : "destination"}
            </Link>
          </div>
          {view === "itinerary" && (
            <>
              <DayOverview tripId={id} segments={segments} day={day} />
              <DayBookings trip={trip.id} day={day} />
            </>
          )}
          {view === "destinations" &&
            !segments.some((s) => s.kind === "destination") &&
            savedTripDestinations(trip).length > 0 && (
              <section className="card">
                <h3>Your saved destinations</h3>
                <ol>
                  {savedTripDestinations(trip).map((d, i) => (
                    <li key={i}>{d.label}</li>
                  ))}
                </ol>
                <p>
                  Saved in your chosen order. Add a destination period when you
                  know its dates; no stop dates have been assumed.
                </p>
              </section>
            )}
          <div className="timeline">
            {segments
              .filter((s) =>
                view === "itinerary"
                  ? s.status !== "idea" &&
                    s.start_date <= day &&
                    s.end_date >= day
                  : s.kind === modules.find((m) => m.key === view)?.kind,
              )
              .map((s) => (
                <article className="card" key={s.id}>
                  <div className="row">
                    <span className="eyebrow">
                      {s.kind} · {s.local_time || "Flexible"}{" "}
                      {s.local_time && s.timezone}
                    </span>
                    <span className="pill">{s.status}</span>
                  </div>
                  <h3>{s.title}</h3>
                  <small>
                    {s.start_date}
                    {s.end_date !== s.start_date ? " → " + s.end_date : ""}
                  </small>
                  {s.address && <p>{s.address}</p>}
                  {s.provider && <p>Provider: {s.provider}</p>}
                  {s.reference && <p>Reference: {s.reference}</p>}
                  {s.kind === "transport" && (
                    <p>
                      {s.transport_mode} ·{" "}
                      {s.origin || "Departure not specified"} →{" "}
                      {s.arrival_location || "Arrival not specified"}
                      {s.arrival_time &&
                        ` · arrival ${s.end_date} ${s.arrival_time} ${s.arrival_timezone || "(zone unspecified)"}`}
                    </p>
                  )}
                  {s.notes && <TravelNotes text={s.notes} />}
                  {s.duration_minutes && (
                    <p className="muted">
                      Saved duration: {s.duration_minutes} minutes
                    </p>
                  )}
                  {canEdit && (
                    <DayPlanControls
                      key={s.id + String(s.updated_at)}
                      item={s}
                      trip={trip}
                    />
                  )}
                  <div className="actions">
                    <Link
                      data-edit-action
                      className="button secondary"
                      href={base + "?view=add&edit=" + s.id}
                    >
                      Edit / move
                    </Link>
                    <Delete id={s.id} tripId={id} />
                  </div>
                </article>
              ))}
          </div>
          {!segments.some((s) =>
            view === "itinerary"
              ? s.status !== "idea" && s.start_date <= day && s.end_date >= day
              : s.kind === modules.find((m) => m.key === view)?.kind,
          ) && (
            <div className="empty">
              <h3>Nothing here just yet.</h3>
              <p>Keep it open, or add a plan you already have.</p>
            </div>
          )}
          {view === "itinerary" &&
            segments.some((s) => s.status === "idea") && (
              <section className="card">
                <h2>Saved for a maybe</h2>
                {segments
                  .filter((s) => s.status === "idea")
                  .map((s) => (
                    <p key={s.id}>
                      {canEdit ? (
                        <Link href={base + "?view=ideas"}>
                          {s.title} · Choose a day ↗
                        </Link>
                      ) : (
                        <span>{s.title}</span>
                      )}
                    </p>
                  ))}
              </section>
            )}
        </>
      )}
    </div>
  );
}
