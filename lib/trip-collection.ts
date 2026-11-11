import type { Trip } from "./domain";
export type TripCard = Pick<
  Trip,
  "id" | "name" | "start_date" | "end_date" | "timezone" | "travelers" | "style" | "creation_state"
> & { shared: boolean; lifecycle: "traveling" | "upcoming" | "past" | "unknown" };
export function organizeTrips(
  trips: TripCard[],
  query: string,
  status: string,
  relation: string,
) {
  const text = query.trim().toLocaleLowerCase();
  const rank = { traveling: 0, upcoming: 1, past: 2, unknown: 3 };
  return trips
    .filter(
      (trip) =>
        trip.creation_state !== "draft" &&
        (!text || trip.name.toLocaleLowerCase().includes(text)) &&
        (status === "all" || trip.lifecycle === status) &&
        (relation === "all" ||
          (relation === "shared" ? trip.shared : !trip.shared)),
    )
    .sort(
      (a, b) =>
        rank[a.lifecycle] - rank[b.lifecycle] ||
        (a.lifecycle === "past"
          ? b.start_date.localeCompare(a.start_date)
          : a.start_date.localeCompare(b.start_date)) ||
        a.name.localeCompare(b.name) ||
        a.id.localeCompare(b.id),
    );
}
