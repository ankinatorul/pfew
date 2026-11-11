import type { ElementType } from "react";
import { ArrowRight, CalendarDays, Lightbulb, MapPin } from "lucide-react";
import type { DuringTripPlan } from "../lib/during-trip";
import type { TripRole } from "../lib/trip-role";
import { tripSectionUrl } from "../lib/trip-navigation";

export function DuringTripSections({
  plan,
  tripId,
  role,
  LinkComponent = "a",
}: {
  plan: DuringTripPlan;
  tripId: string;
  role: TripRole;
  LinkComponent?: ElementType;
}) {
  const href = (view: string, day = plan.day) =>
    tripSectionUrl(tripId, view, day);
  return (
    <div className="overview-live-primary">
      <section
        className="overview-card overview-today"
        aria-labelledby="overview-today-title"
      >
        <div className="overview-section-heading">
          <div>
            <span className="overview-kicker">{plan.dateLabel}</span>
            <h2 id="overview-today-title">Today’s plan</h2>
          </div>
          <CalendarDays size={20} aria-hidden="true" />
        </div>
        <p className="overview-note overview-local-context">
          {plan.destination
            ? `${plan.destination} · `
            : "Using your saved trip timezone · "}
          {plan.timezone}
        </p>
        {plan.items.length ? (
          <ol className="overview-today-list" aria-label="Today’s saved plans">
            {plan.items.map((item) => (
              <li key={item.source + item.id}>
                <div className="overview-plan-clock">
                  <span>{item.time}</span>
                  {item.spansToday && (
                    <small>Spans this local day</small>
                  )}
                </div>
                <div className="overview-row-copy">
                  <span
                    className={
                      "overview-plan-status" +
                      (item.confirmed ? " overview-plan-confirmed" : "")
                    }
                  >
                    {item.status}
                  </span>
                  <h3>
                    <LinkComponent
                      href={
                        item.source === "booking"
                          ? href("bookings", item.day) +
                            "&edit=" +
                            encodeURIComponent(item.id)
                          : href("itinerary", item.day)
                      }
                    >
                      {item.title} <ArrowRight size={13} aria-hidden="true" />
                    </LinkComponent>
                  </h3>
                  {item.location && (
                    <p className="overview-plan-location">
                      <MapPin size={13} aria-hidden="true" />
                      {item.location}
                    </p>
                  )}
                  {item.provider && <p>Provider: {item.provider}</p>}
                  {item.reference && <p>Reference: {item.reference}</p>}
                  {item.savedTime && (
                    <p>
                      Saved start: {item.savedTime}
                      {item.timeUncertain ? " · review this local time" : ""}
                    </p>
                  )}
                  {item.arrival && <p>Saved end / arrival: {item.arrival}</p>}
                  {item.linkedDay && (
                    <p>
                      {item.linkedMismatch
                        ? "Linked itinerary details differ. "
                        : `Linked itinerary: ${item.linkedStatus}. `}
                      <LinkComponent
                        className="overview-inline-link"
                        href={href("itinerary", item.linkedDay)}
                      >
                        View itinerary
                      </LinkComponent>
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        ) : plan.bookingsAvailable ? (
          <p className="overview-today-empty">
            Nothing planned for today. Your day is yours.
          </p>
        ) : (
          <p className="overview-note">
            No itinerary items are saved for today. Bookings could not be
            loaded, so today’s plan may be incomplete.
          </p>
        )}
        {!plan.bookingsAvailable && plan.items.length > 0 && (
          <p className="overview-note" role="status">
            Bookings could not be loaded. This list may be incomplete.
          </p>
        )}
        <p className="overview-footnote">
          Timeline uses {plan.timezone}; saved details retain their original
          zones. Untimed or uncertain entries follow timed plans. Confirmation
          reflects saved records; live availability hasn’t been checked.
        </p>
        <div className="overview-today-actions">
          <LinkComponent
            className="overview-primary-link"
            href={href("itinerary")}
          >
            View full itinerary <ArrowRight size={16} aria-hidden="true" />
          </LinkComponent>
          {!plan.items.length && role !== "viewer" && (
            <LinkComponent
              className="overview-text-link"
              href={href("add") + "&kind=activity"}
            >
              Add an activity <ArrowRight size={15} aria-hidden="true" />
            </LinkComponent>
          )}
        </div>
      </section>
      <section
        className="overview-card overview-inspiration"
        aria-labelledby="overview-inspiration-title"
      >
        <div className="overview-section-heading">
          <h2 id="overview-inspiration-title">
            A little inspiration for today
          </h2>
          <Lightbulb size={19} aria-hidden="true" />
        </div>
        <p className="overview-note">
          Optional ideas, separate from your saved plans.
        </p>
        {plan.ideas.length > 0 ? (
          <>
            <ul className="overview-idea-list">
              {plan.ideas.map((idea) => (
                <li key={idea.id}>
                  <LinkComponent
                    className="overview-text-link"
                    href={href("ideas")}
                  >
                    {idea.title}
                    <ArrowRight size={14} aria-hidden="true" />
                  </LinkComponent>
                </li>
              ))}
            </ul>
            <p className="overview-footnote">
              Saved for {plan.destination}. Review timing and availability
              before choosing a day; nothing is added automatically.
            </p>
          </>
        ) : (
          <p className="overview-note">
            Explore Research when it suits your plans. No recommendations have
            been generated for today.
          </p>
        )}
        <LinkComponent className="overview-text-link" href={href("research")}>
          Open Research <ArrowRight size={15} aria-hidden="true" />
        </LinkComponent>
      </section>
    </div>
  );
}
