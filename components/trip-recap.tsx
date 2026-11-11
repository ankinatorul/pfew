import type { ElementType } from "react";
import { ArrowRight, BookCheck, CalendarDays, MapPin } from "lucide-react";
import type { TripOverview } from "../lib/trip-overview";
import { tripSectionUrl } from "../lib/trip-navigation";

export function TripRecap({
  model,
  LinkComponent = "a",
}: {
  model: TripOverview;
  LinkComponent?: ElementType;
}) {
  return (
    <section
      className="overview-card overview-recap"
      aria-labelledby="overview-recap-title"
    >
      <div className="overview-section-heading">
        <div>
          <span className="overview-kicker">Trip recap</span>
          <h2 id="overview-recap-title">Another adventure in the books.</h2>
        </div>
        <BookCheck size={22} aria-hidden="true" />
      </div>
      <p className="overview-recap-intro">Your journey, all in one place.</p>
      <h3 className="overview-recap-name">{model.name}</h3>
      <dl className="overview-recap-details">
        <div>
          <dt>
            <MapPin size={16} aria-hidden="true" />
            <span className="sr-only">Saved destinations</span>
          </dt>
          <dd>
            {model.destinations.length
              ? model.destinations
                  .map((destination) => destination.title)
                  .join(" · ")
              : "No destinations saved"}
          </dd>
        </div>
        <div>
          <dt>
            <CalendarDays size={16} aria-hidden="true" />
            <span className="sr-only">Saved dates</span>
          </dt>
          <dd>
            {model.dates.label}
            {model.dates.duration !== null && (
              <span className="overview-recap-duration">
                {model.dates.duration}{" "}
                {model.dates.duration === 1 ? "day" : "days"}
              </span>
            )}
          </dd>
        </div>
      </dl>
      <LinkComponent
        className="overview-primary-link"
        href={tripSectionUrl(model.tripId, "itinerary", model.dates.day)}
      >
        View itinerary <ArrowRight size={16} aria-hidden="true" />
      </LinkComponent>
    </section>
  );
}
