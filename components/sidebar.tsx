import type { ElementType } from "react";
import { ArrowUpRight, Plus } from "lucide-react";
import type { TripCard } from "../lib/trip-collection";
import type { NavigationLink as NavigationItem } from "../lib/app-navigation";
import { ActiveTripSwitcher } from "./active-trip-switcher";
import { NavigationLink } from "./navigation-link";

export function Sidebar({
  trips,
  activeTrip,
  unavailable,
  primary,
  utility,
  onTripChange,
  LinkComponent = "a",
}: {
  trips: TripCard[];
  activeTrip: TripCard | null;
  unavailable: boolean;
  primary: NavigationItem[];
  utility: NavigationItem[];
  onTripChange?: (id: string) => void;
  LinkComponent?: ElementType;
}) {
  return (
    <aside className="app-sidebar" aria-label="Travel workspace">
      <LinkComponent className="app-logo" href="/" aria-label="Pfew home">
        pfew<span>.</span>
      </LinkComponent>
      <ActiveTripSwitcher
        trips={trips}
        activeTrip={activeTrip}
        unavailable={unavailable}
        onChange={onTripChange}
      />
      <nav className="app-sidebar-nav" aria-label="Main navigation">
        {primary.map((item) => (
          <NavigationLink
            key={item.key}
            item={item}
            LinkComponent={LinkComponent}
          />
        ))}
      </nav>
      <LinkComponent href="/trips/new" className="app-create-trip">
        <span className="app-create-icon">
          <Plus size={20} aria-hidden="true" />
        </span>
        <span className="app-create-eyebrow">Your next adventure</span>
        <strong>
          Create a Trip <ArrowUpRight size={17} aria-hidden="true" />
        </strong>
      </LinkComponent>
      <nav
        className="app-sidebar-utility"
        aria-label="Workspace settings and help"
      >
        {utility.map((item) => (
          <NavigationLink
            key={item.key}
            item={item}
            LinkComponent={LinkComponent}
          />
        ))}
      </nav>
      <p className="app-signature">Pfew. You’re on your way.</p>
    </aside>
  );
}
