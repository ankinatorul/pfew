export const primaryTripSections = [
  { key: "hub", label: "Trip Hub", short: "Trip" },
  { key: "itinerary", label: "Itinerary", short: "Days" },
  { key: "bookings", label: "Bookings", short: "Wallet" },
  { key: "map", label: "Map", short: "Map" },
];
export const secondaryTripSections = [
  { key: "destinations", label: "Destinations" },
  { key: "stays", label: "Stays" },
  { key: "transport", label: "Transport" },
  { key: "prep", label: "Prep" },
  { key: "packing", label: "Packing" },
  { key: "documents", label: "Documents" },
  { key: "budget", label: "Budget" },
  { key: "ideas", label: "Ideas" },
  { key: "check", label: "Trip Check" },
  { key: "research", label: "Research" },
  { key: "people", label: "People" },
  { key: "offline", label: "Offline" },
];
export function workspaceTripSections(owner: boolean) {
  return [
    ...primaryTripSections,
    ...secondaryTripSections,
    ...(owner ? [{ key: "settings", label: "Settings" }] : []),
  ];
}
export function tripSectionUrl(tripId: string, view: string, day?: string) {
  const query = new URLSearchParams({ view });
  if (day) query.set("day", day);
  return "/trips/" + encodeURIComponent(tripId) + "?" + query;
}
