import type { ElementType } from "react";
import { workspaceTripSections, tripSectionUrl } from "../lib/trip-navigation";
export function TripNavigationView({
  tripId,
  view,
  day,
  owner,
  LinkComponent = "a",
}: {
  tripId: string;
  view: string;
  day: string;
  owner: boolean;
  LinkComponent?: ElementType;
}) {
  const sections = workspaceTripSections(owner).filter(
    (section) =>
      !["itinerary", "bookings", "packing", "documents"].includes(section.key),
  );
  return (
    <nav aria-label="More trip tools" className="trip-navigation">
      <div className="trip-nav-secondary">
        {sections.map((section) => (
          <LinkComponent
            key={section.key}
            href={tripSectionUrl(tripId, section.key, day)}
            aria-current={view === section.key ? "page" : undefined}
            className={view === section.key ? "selected" : ""}
          >
            {section.label}
          </LinkComponent>
        ))}
      </div>
    </nav>
  );
}
