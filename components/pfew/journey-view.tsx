import type { ElementType, ReactNode } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BedDouble,
  CalendarDays,
  Compass,
  Heart,
  MapPin,
  Plus,
  Route,
  Sparkles,
  TrainFront,
  Plane,
  CarFront,
  Ship,
  Bus,
  Users,
  MoveRight,
} from "lucide-react";
import type { Trip, Segment } from "../../lib/domain";
import {
  friendlyDate,
  friendlyDateRange,
  calendarNights,
  type Journey,
  type JourneyStop,
  type JourneyConnection,
} from "../../lib/journey";
import {
  PfewPageHeader,
  PfewSectionHeader,
  PfewEditorialCard,
  PfewStatusPill,
  PfewEmptyState,
  PfewInsightCard,
} from "./primitives";
export type JourneyInsight = {
  checkedAt: string | null;
  visibleCount: number;
  title: string | null;
};
export function JourneyHeader({
  trip,
  canEdit,
  LinkComponent = "a",
}: {
  trip: Trip;
  canEdit: boolean;
  LinkComponent?: ElementType;
}) {
  const nights = calendarNights(trip.start_date, trip.end_date);
  return (
    <PfewPageHeader
      eyebrow="Your travel story"
      title={trip.name}
      description={
        <>
          <span>
            <CalendarDays size={16} aria-hidden="true" />
            {friendlyDateRange(trip.start_date, trip.end_date)}
          </span>
          <span>
            <Users size={16} aria-hidden="true" />
            {trip.travelers} {trip.travelers === 1 ? "traveler" : "travelers"}
          </span>
          <span>
            {nights + 1} {nights === 0 ? "day" : "days"} · {trip.style}
          </span>
        </>
      }
      actions={
        canEdit && (
          <LinkComponent
            className="pfew-button pfew-button-dark"
            href={"/trips/" + trip.id + "?view=add"}
          >
            <Plus size={18} aria-hidden="true" />
            Smart Add
          </LinkComponent>
        )
      }
    />
  );
}
export function PfewDestinationCard({
  stop,
  index,
  tripId,
  menu,
  LinkComponent = "a",
}: {
  stop: JourneyStop;
  index: number;
  tripId: string;
  menu?: ReactNode;
  LinkComponent?: ElementType;
}) {
  const destination = stop.destination,
    base = "/trips/" + tripId;
  const tone = ["lavender", "lime", "pink"][index % 3] as
    "lavender" | "lime" | "pink";
  return (
    <article
      className={`pfew-destination pfew-tone-${tone}`}
      aria-labelledby={"destination-" + destination.id}
    >
      <div className="pfew-destination-top">
        <span className="pfew-eyebrow">
          Stop {String(index + 1).padStart(2, "0")}
        </span>
        <div className="pfew-destination-tools">
          <PfewStatusPill
            tone={destination.status === "confirmed" ? "confirmed" : "planned"}
          >
            {destination.status === "confirmed"
              ? "Confirmed plan"
              : "Planned stop"}
          </PfewStatusPill>
          {menu}
        </div>
      </div>
      <div className="pfew-destination-heading">
        <div>
          <h3 id={"destination-" + destination.id}>
            <LinkComponent
              href={base + "?view=itinerary&day=" + destination.start_date}
            >
              {destination.title}
            </LinkComponent>
          </h3>
          {destination.location_label &&
            destination.location_label !== destination.title && (
              <p className="pfew-location-label">
                {destination.location_label}
              </p>
            )}
        </div>
        <span className="pfew-destination-symbol" aria-hidden="true">
          <MapPin strokeWidth={1.4} />
        </span>
      </div>
      <div className="pfew-destination-dates">
        <span>{stop.dates}</span>
        <span className="pfew-duration">
          {stop.nights
            ? `${stop.nights} ${stop.nights === 1 ? "night" : "nights"}`
            : "Same-day stop"}
        </span>
      </div>
      <div className="pfew-destination-bottom">
        <div className="pfew-stop-summaries">
          <LinkComponent
            href={base + "?view=stays&day=" + destination.start_date}
          >
            <BedDouble size={17} aria-hidden="true" />
            {stop.stays} {stop.stays === 1 ? "stay" : "stays"}
          </LinkComponent>
          <LinkComponent
            href={base + "?view=itinerary&day=" + destination.start_date}
          >
            <Compass size={17} aria-hidden="true" />
            {stop.activities}{" "}
            {stop.activities === 1 ? "activity" : "activities"}
          </LinkComponent>
          <LinkComponent href={base + "?view=ideas"}>
            <Heart size={17} aria-hidden="true" />
            {stop.ideas} {stop.ideas === 1 ? "idea" : "ideas"}
          </LinkComponent>
        </div>
        <LinkComponent
          className="pfew-circle-link"
          aria-label={"Explore " + destination.title + " itinerary"}
          href={base + "?view=itinerary&day=" + destination.start_date}
        >
          <ArrowUpRight size={21} aria-hidden="true" />
        </LinkComponent>
      </div>
    </article>
  );
}
function TransportIcon({ mode }: { mode: string }) {
  const Icon =
    mode === "flight"
      ? Plane
      : mode === "train"
        ? TrainFront
        : mode === "ferry"
          ? Ship
          : mode === "bus"
            ? Bus
            : ["rental car", "transfer"].includes(mode)
              ? CarFront
              : Route;
  return <Icon size={20} aria-hidden="true" />;
}
export function PfewTransportConnection({
  connection,
  next,
  tripId,
  canEdit,
  LinkComponent = "a",
}: {
  connection: JourneyConnection;
  next: JourneyStop;
  tripId: string;
  canEdit: boolean;
  LinkComponent?: ElementType;
}) {
  const base = "/trips/" + tripId;
  return (
    <div
      className="pfew-connection"
      aria-label={"Travel connection to " + next.destination.title}
    >
      <span className="pfew-connection-line" aria-hidden="true" />
      {connection.legs.length ? (
        <div className="pfew-connection-legs">
          {connection.legs.map(({ segment, match }) => (
            <div className="pfew-connection-row" key={segment.id}>
              <span className="pfew-transport-icon">
                <TransportIcon mode={segment.transport_mode} />
              </span>
              <div className="pfew-connection-copy">
                <strong>{segment.title}</strong>
                <p>
                  {friendlyDate(segment.start_date)}
                  {segment.end_date !== segment.start_date
                    ? " – " + friendlyDate(segment.end_date)
                    : ""}
                  {segment.local_time
                    ? " · " + segment.local_time
                    : " · Time not entered"}
                  {segment.arrival_time ? " → " + segment.arrival_time : ""}
                  {segment.transport_mode ? " · " + segment.transport_mode : ""}
                </p>
                <span className="pfew-connection-note">
                  {segment.source === "booking"
                    ? segment.status
                    : segment.status === "confirmed"
                      ? "Confirmed plan"
                      : "Planned journey"}
                  {" · "}
                  {match === "dates"
                    ? "Linked around this change · review the saved route"
                    : "Saved departure and arrival cities match these stops"}
                </span>
              </div>
              <LinkComponent
                className="pfew-connection-open"
                href={
                  base +
                  (segment.source === "booking"
                    ? "?view=bookings&edit=" + segment.bookingId
                    : canEdit
                      ? "?view=add&edit=" + segment.id
                      : "?view=transport")
                }
                aria-label={"Review " + segment.title}
              >
                <ArrowUpRight size={18} aria-hidden="true" />
              </LinkComponent>
            </div>
          ))}
        </div>
      ) : (
        <div className="pfew-connection-row pfew-connection-missing">
          <span className="pfew-transport-icon">
            <MoveRight size={20} aria-hidden="true" />
          </span>
          <div className="pfew-connection-copy">
            <strong>On to {next.destination.title}</strong>
            <p>
              No connecting journey saved. You may have arranged it elsewhere.
            </p>
          </div>
          <LinkComponent
            className="pfew-text-link"
            href={
              base + (canEdit ? "?view=add&kind=transport" : "?view=transport")
            }
          >
            {canEdit ? "Add travel" : "View travel"}
            <Plus size={15} aria-hidden="true" />
          </LinkComponent>
        </div>
      )}
      <span className="pfew-connection-line" aria-hidden="true" />
    </div>
  );
}
export function JourneyOverviewView({
  trip,
  journey,
  insight,
  canEdit,
  renderMenu,
  checkAction,
  LinkComponent = "a",
}: {
  trip: Trip;
  journey: Journey;
  insight: JourneyInsight;
  canEdit: boolean;
  renderMenu?: (segment: Segment) => ReactNode;
  checkAction?: ReactNode;
  LinkComponent?: ElementType;
}) {
  const base = "/trips/" + trip.id;
  return (
    <section className="pfew-journey" aria-label="Journey Overview">
      <div className="pfew-journey-intro">
        <PfewSectionHeader
          eyebrow="The big picture"
          title="A journey, uniquely yours."
          detail="A few favorite places. All the little plans in between."
        />
        <LinkComponent
          className="pfew-text-link"
          href={base + "?view=itinerary"}
        >
          Day itinerary
          <ArrowRight size={17} aria-hidden="true" />
        </LinkComponent>
      </div>
      <div className="pfew-journey-layout">
        <div className="pfew-journey-story">
          <div className="pfew-story-heading">
            <span>
              {journey.stops.length}{" "}
              {journey.stops.length === 1 ? "destination" : "destinations"}
            </span>
            <span>
              {journey.nights} {journey.nights === 1 ? "night" : "nights"} away
            </span>
          </div>
          {journey.stops.length ? (
            <ol className="pfew-stop-list">
              {journey.stops.map((stop, index) => (
                <li key={stop.destination.id}>
                  <PfewDestinationCard
                    stop={stop}
                    index={index}
                    tripId={trip.id}
                    menu={canEdit ? renderMenu?.(stop.destination) : undefined}
                    LinkComponent={LinkComponent}
                  />
                  {journey.connections[index] && (
                    <PfewTransportConnection
                      connection={journey.connections[index]}
                      next={journey.stops[index + 1]}
                      tripId={trip.id}
                      canEdit={canEdit}
                      LinkComponent={LinkComponent}
                    />
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <PfewEmptyState
              title="Every journey starts somewhere."
              actions={
                canEdit && (
                  <LinkComponent
                    className="pfew-button pfew-button-dark"
                    href={base + "?view=add&kind=destination"}
                  >
                    <Plus size={18} aria-hidden="true" />
                    Add your first destination
                  </LinkComponent>
                )
              }
            >
              Add a place you have in mind. You can work out the little details
              later.
            </PfewEmptyState>
          )}
          {canEdit && journey.stops.length > 0 && (
            <LinkComponent
              className="pfew-add-stop"
              href={base + "?view=add&kind=destination"}
            >
              <Plus size={20} aria-hidden="true" />
              Make room for another place
            </LinkComponent>
          )}
          {journey.otherTransport.length > 0 && (
            <details className="pfew-other-travel">
              <summary>
                {journey.otherTransport.length} other saved{" "}
                {journey.otherTransport.length === 1 ? "journey" : "journeys"}
              </summary>
              <p>
                These records are not matched to a connection between the stops
                above.
              </p>
              {journey.otherTransport.map((leg) => (
                <LinkComponent
                  key={leg.id}
                  href={
                    base +
                    (leg.source === "booking"
                      ? "?view=bookings&edit=" + leg.bookingId
                      : "?view=transport")
                  }
                >
                  <TransportIcon mode={leg.transport_mode} />
                  {leg.title}
                  <span>{friendlyDateRange(leg.start_date, leg.end_date)}</span>
                  <ArrowUpRight size={16} aria-hidden="true" />
                </LinkComponent>
              ))}
            </details>
          )}
        </div>
        <aside className="pfew-journey-aside" aria-label="Journey insights">
          <PfewInsightCard
            title="A second look. A little peace of mind."
            action={
              checkAction || (
                <LinkComponent href={base + "?view=check"}>
                  Open Trip Check
                </LinkComponent>
              )
            }
            footer="Based on saved information. Your arrangements may live elsewhere."
          >
            {!insight.checkedAt ? (
              <p>
                Give your plans a gentle once-over. Check saved stay details,
                travel connections and things still to prepare.
              </p>
            ) : (
              <>
                <p>
                  {insight.visibleCount
                    ? `${insight.visibleCount} saved ${insight.visibleCount === 1 ? "finding" : "findings"} to review.`
                    : "No open findings in your last saved check."}
                </p>
                {insight.title && (
                  <p className="pfew-insight-finding">{insight.title}</p>
                )}
                <p className="pfew-insight-checked">
                  Last checked{" "}
                  {new Intl.DateTimeFormat("en-GB", {
                    day: "numeric",
                    month: "short",
                    timeZone: trip.timezone,
                  }).format(new Date(insight.checkedAt))}
                  . Rerun after changing plans.
                </p>
              </>
            )}
          </PfewInsightCard>
          <PfewEditorialCard tone="pink" className="pfew-ideas-card">
            <Heart size={24} strokeWidth={1.6} aria-hidden="true" />
            <h3>
              Leave a little
              <br />
              room for maybe.
            </h3>
            <p>
              {journey.ideaCount
                ? `${journey.ideaCount} saved ${journey.ideaCount === 1 ? "idea" : "ideas"}, waiting for the right moment.`
                : "Save the places and possibilities you’re curious about. No schedule needed."}
            </p>
            <LinkComponent
              className="pfew-text-link"
              href={base + "?view=ideas"}
            >
              Your ideas
              <ArrowUpRight size={17} aria-hidden="true" />
            </LinkComponent>
          </PfewEditorialCard>
          <LinkComponent
            className="pfew-map-shortcut"
            href={base + "?view=map"}
          >
            <MapPin size={21} aria-hidden="true" />
            <span>
              See your places together<strong>Open trip map</strong>
            </span>
            <ArrowUpRight size={20} aria-hidden="true" />
          </LinkComponent>
        </aside>
      </div>
      <div className="pfew-journey-signoff">
        <Sparkles size={16} aria-hidden="true" />
        <span>A little less planning. A little more living.</span>
      </div>
    </section>
  );
}
