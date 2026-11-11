import type { ElementType, ReactNode } from "react";
import type { TripCard } from "../lib/trip-collection";
import { appNavigation } from "../lib/app-navigation";
import { ActiveTripSwitcher } from "./active-trip-switcher";
import { Sidebar } from "./sidebar";
import { MobileNavigation } from "./mobile-navigation";

export function AppShellView({
  children,
  trips,
  activeTrip,
  unavailable = false,
  pathname,
  view,
  day,
  accountMenu,
  onTripChange,
  LinkComponent = "a",
}: {
  children: ReactNode;
  trips: TripCard[];
  activeTrip: TripCard | null;
  unavailable?: boolean;
  pathname: string;
  view: string;
  day: string | null;
  accountMenu: ReactNode;
  onTripChange?: (id: string) => void;
  LinkComponent?: ElementType;
}) {
  const navigation = appNavigation(activeTrip, pathname, view, day);
  return (
    <div className="app-shell">
      <a className="app-skip-link" href="#workspace-content">
        Skip to content
      </a>
      <Sidebar
        trips={trips}
        activeTrip={activeTrip}
        unavailable={unavailable}
        {...navigation}
        onTripChange={onTripChange}
        LinkComponent={LinkComponent}
      />
      <div className="app-workspace">
        <header className="app-header">
          <LinkComponent
            className="app-logo app-mobile-logo"
            href="/"
            aria-label="Pfew home"
          >
            pfew<span>.</span>
          </LinkComponent>
          <div className="app-header-context">
            <span>Your travel space</span>
            <p>{activeTrip?.name || "Room for your next adventure"}</p>
          </div>
          {accountMenu}
          <div className="app-mobile-switcher">
            <ActiveTripSwitcher
              trips={trips}
              activeTrip={activeTrip}
              unavailable={unavailable}
              onChange={onTripChange}
            />
          </div>
        </header>
        <main id="workspace-content" className="app-main" tabIndex={-1}>
          {children}
        </main>
        <MobileNavigation
          key={pathname + view + day}
          {...navigation}
          LinkComponent={LinkComponent}
        />
      </div>
    </div>
  );
}
