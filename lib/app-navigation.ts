import { lifecycle } from "./domain";
import type { TripCard } from "./trip-collection";
import { tripSectionUrl, workspaceTripSections } from "./trip-navigation";

export type NavigationIcon =
  | "home"
  | "trips"
  | "itinerary"
  | "bookings"
  | "packing"
  | "documents"
  | "settings"
  | "help"
  | "hub"
  | "destinations"
  | "stays"
  | "transport"
  | "prep"
  | "budget"
  | "map"
  | "ideas"
  | "check"
  | "research"
  | "people"
  | "offline";
export type NavigationLink = {
  key: string;
  label: string;
  icon: NavigationIcon;
  href: string | null;
  active: boolean;
};

export function isWorkspacePath(pathname: string) {
  return (
    pathname === "/" ||
    pathname === "/help" ||
    /^\/profile(?:\/checks)?\/?$/.test(pathname) ||
    /^\/trips(?:\/[^/]+)?\/?$/.test(pathname)
  );
}

export function routeTripId(pathname: string) {
  const id = /^\/trips\/([^/]+)\/?$/.exec(pathname)?.[1];
  return id && id !== "new" ? id : null;
}

export function defaultActiveTrip(trips: TripCard[], now = new Date()) {
  const ordered = trips.filter(t => t.creation_state !== "draft").sort((a, b) =>
    a.start_date.localeCompare(b.start_date),
  );
  return (
    ordered.find(
      (t) =>
        lifecycle(t.start_date, t.end_date, t.timezone, now) === "traveling",
    ) ||
    ordered.find(
      (t) =>
        lifecycle(t.start_date, t.end_date, t.timezone, now) === "upcoming",
    ) ||
    ordered.at(-1) ||
    null
  );
}

export function resolveActiveTrip(
  trips: TripCard[],
  pathname: string,
  featuredId: string | null,
  savedId: string | null,
  fallbackId: string | null,
) {
  trips = trips.filter(t => t.creation_state !== "draft");
  const routeId = routeTripId(pathname);
  // An inaccessible deep link must never acquire another trip's context.
  if (routeId) return trips.find((t) => t.id === routeId) || null;
  if (pathname === "/" && featuredId)
    return (
      trips.find((t) => t.id === featuredId) ||
      trips.find((t) => t.id === fallbackId) ||
      null
    );
  return (
    trips.find((t) => pathname === "/" && t.id === featuredId) ||
    trips.find((t) => t.id === savedId) ||
    trips.find((t) => t.id === fallbackId) ||
    null
  );
}

export function navigationDay(trip: TripCard, day: string | null) {
  return day &&
    /^\d{4}-\d{2}-\d{2}$/.test(day) &&
    day >= trip.start_date &&
    day <= trip.end_date
    ? day
    : trip.start_date;
}

export function tripSwitchHref(
  trip: TripCard,
  pathname: string,
  view: string,
  day: string | null,
) {
  if (pathname === "/") return "/?trip=" + encodeURIComponent(trip.id);
  const supported = workspaceTripSections(!trip.shared).some(
    (section) => section.key === view,
  );
  return tripSectionUrl(
    trip.id,
    routeTripId(pathname) && supported ? view : "hub",
    navigationDay(trip, day),
  );
}

export function appNavigation(
  trip: TripCard | null,
  pathname: string,
  view: string,
  day: string | null,
) {
  const inTrip = Boolean(routeTripId(pathname));
  const sectionLink = (key: string) =>
    trip ? tripSectionUrl(trip.id, key, navigationDay(trip, day)) : null;
  const primary: NavigationLink[] = [
    {
      key: "home",
      label: "Home",
      icon: "home",
      href: trip ? "/?trip=" + encodeURIComponent(trip.id) : "/",
      active: pathname === "/",
    },
    {
      key: "trips",
      label: "My Trips",
      icon: "trips",
      href: "/trips",
      active: pathname === "/trips" || (inTrip && view === "hub"),
    },
    ...(["itinerary", "bookings", "packing", "documents"] as const).map(
      (key) => ({
        key,
        label: key[0].toUpperCase() + key.slice(1),
        icon: key,
        href: sectionLink(key),
        active: inTrip && view === key,
      }),
    ),
  ];
  const utility: NavigationLink[] = [
    {
      key: "settings",
      label: "Settings",
      icon: "settings",
      href: "/profile",
      active: pathname.startsWith("/profile"),
    },
    {
      key: "help",
      label: "Help & Support",
      icon: "help",
      href: "/help",
      active: pathname === "/help",
    },
  ];
  const more: NavigationLink[] = [
    ...primary.filter((link) => ["packing", "documents"].includes(link.key)),
    ...workspaceTripSections(Boolean(trip && !trip.shared))
      .filter(
        (section) =>
          !["itinerary", "bookings", "packing", "documents"].includes(
            section.key,
          ),
      )
      .map((section) => ({
        key: section.key === "settings" ? "trip-settings" : section.key,
        label: section.key === "settings" ? "Trip settings" : section.label,
        icon: section.key as NavigationIcon,
        href: sectionLink(section.key),
        active: inTrip && view === section.key,
      })),
    ...utility,
  ];
  return { primary, utility, more };
}
