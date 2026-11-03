import type { ElementType } from "react";
import {
  primaryTripSections,
  secondaryTripSections,
  tripSectionUrl,
} from "../lib/trip-navigation";
export function TripNavigationView({
  tripId,
  view,
  day,
  owner,
  LinkComponent = "a",
  onNavigate,
}: {
  tripId: string;
  view: string;
  day: string;
  owner: boolean;
  LinkComponent?: ElementType;
  onNavigate?: (url: string) => void;
}) {
  const other = [
    ...secondaryTripSections,
    ...(owner
      ? [
          { key: "setup-details", label: "Private setup drafts" },
          { key: "settings", label: "Settings" },
        ]
      : []),
  ];
  return (
    <nav aria-label="Trip sections" className="trip-navigation">
      <div className="trip-nav-primary">
        {primaryTripSections.map((section) => (
          <LinkComponent
            key={section.key}
            href={tripSectionUrl(tripId, section.key, day)}
            aria-current={view === section.key ? "page" : undefined}
            className={view === section.key ? "selected" : ""}
          >
            <span className="trip-label-wide">{section.label}</span>
            <span className="trip-label-short">{section.short}</span>
          </LinkComponent>
        ))}
        <label className="trip-nav-more">
          <span className="sr-only">More trip sections</span>
          <select
            aria-label="More trip sections"
            value={other.some((section) => section.key === view) ? view : ""}
            onChange={(event) => {
              if (event.target.value)
                onNavigate?.(tripSectionUrl(tripId, event.target.value, day));
            }}
          >
            <option value="">More…</option>
            {other.map((section) => (
              <option key={section.key} value={section.key}>
                {section.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="trip-nav-secondary">
        {other.map((section) => (
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
