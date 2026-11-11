import { describe, it, expect } from "vitest";
import {
  appNavigation,
  defaultActiveTrip,
  isWorkspacePath,
  resolveActiveTrip,
  tripSwitchHref,
} from "../lib/app-navigation";
import type { TripCard } from "../lib/trip-collection";

const trip: TripCard = {
  id: "owned",
  name: "Spring escape",
  start_date: "2027-05-01",
  end_date: "2027-05-10",
  timezone: "UTC",
  travelers: 2,
  style: "Comfort",
  shared: false,
  lifecycle: "upcoming",
};
const shared: TripCard = {
  ...trip,
  id: "shared",
  name: "Shared trip",
  shared: true,
};

describe("authorized trip context", () => {
  it("prioritizes a deep link, then an explicit Home selection, over a saved preference", () => {
    expect(
      resolveActiveTrip(
        [trip, shared],
        "/trips/owned",
        null,
        "shared",
        "shared",
      ),
    ).toBe(trip);
    expect(
      resolveActiveTrip([trip, shared], "/", "shared", "owned", "owned"),
    ).toBe(shared);
    expect(
      resolveActiveTrip([trip, shared], "/trips", null, "shared", "owned"),
    ).toBe(shared);
  });
  it("does not substitute another trip on an inaccessible deep link", () => {
    expect(
      resolveActiveTrip([trip], "/trips/inaccessible", null, "owned", "owned"),
    ).toBeNull();
  });
  it("ignores stale or foreign saved identifiers and handles an empty account", () => {
    expect(resolveActiveTrip([trip], "/trips", null, "revoked", "owned")).toBe(
      trip,
    );
    expect(resolveActiveTrip([], "/", "unknown", "unknown", null)).toBeNull();
  });
  it("chooses current, then upcoming, then recent past trips using trip-local dates", () => {
    const current = {
      ...trip,
      id: "current",
      timezone: "Pacific/Kiritimati",
      start_date: "2027-05-02",
      end_date: "2027-05-02",
    };
    const future = {
      ...trip,
      id: "future",
      start_date: "2027-06-01",
      end_date: "2027-06-10",
    };
    const now = new Date("2027-05-01T12:30:00Z");
    const past = { ...trip, start_date: "2027-04-01", end_date: "2027-04-10" };
    expect(defaultActiveTrip([future, current, past], now)).toBe(current);
    expect(defaultActiveTrip([future], now)).toBe(future);
    expect(defaultActiveTrip([trip, future], new Date("2027-07-01"))).toBe(
      future,
    );
  });
});
describe("trip switching", () => {
  it("keeps a supported section and a day within the destination trip", () => {
    expect(
      tripSwitchHref(shared, "/trips/owned", "bookings", "2027-05-03"),
    ).toBe("/trips/shared?view=bookings&day=2027-05-03");
    expect(
      tripSwitchHref(shared, "/trips/owned", "documents", "2027-05-03"),
    ).toContain("view=documents");
  });
  it("resets an out-of-range day and leaves owner settings behind for a shared trip", () => {
    expect(
      tripSwitchHref(shared, "/trips/owned", "settings", "2026-05-03"),
    ).toBe("/trips/shared?view=hub&day=2027-05-01");
    expect(tripSwitchHref(trip, "/trips/shared", "settings", null)).toContain(
      "view=settings",
    );
  });
  it("falls back from record-editing and unknown views instead of copying trip-specific form state", () => {
    for (const view of ["add", "import", "customize", "unknown"])
      expect(tripSwitchHref(shared, "/trips/owned", view, null)).toContain(
        "view=hub",
      );
    expect(tripSwitchHref(shared, "/", "hub", null)).toBe("/?trip=shared");
    expect(tripSwitchHref(shared, "/profile", "budget", null)).toContain(
      "view=hub",
    );
  });
});
describe("shared route registry", () => {
  it("keeps public authentication, invitation, setup, and error screens outside the workspace", () => {
    for (const path of [
      "/login",
      "/auth/callback",
      "/setup",
      "/error",
      "/invites/token",
      "/unknown",
    ])
      expect(isWorkspacePath(path)).toBe(false);
    for (const path of [
      "/",
      "/trips",
      "/trips/new",
      "/trips/owned",
      "/profile",
      "/profile/checks",
      "/help",
    ])
      expect(isWorkspacePath(path)).toBe(true);
  });
  it("disables trip links when no authorized context exists and preserves global destinations", () => {
    const nav = appNavigation(null, "/", "hub", null);
    expect(
      nav.primary
        .filter((link) =>
          ["itinerary", "bookings", "packing", "documents"].includes(link.key),
        )
        .every((link) => link.href === null),
    ).toBe(true);
    expect(nav.primary.find((link) => link.key === "trips")?.href).toBe(
      "/trips",
    );
    expect(nav.more.some((link) => link.label === "Trip settings")).toBe(false);
  });
  it("retains all secondary tools without putting Budget or Favorites in the desktop sidebar", () => {
    const nav = appNavigation(shared, "/trips/shared", "budget", "2027-05-04");
    expect(nav.primary.map((link) => link.label)).toEqual([
      "Home",
      "My Trips",
      "Itinerary",
      "Bookings",
      "Packing",
      "Documents",
    ]);
    for (const key of [
      "budget",
      "prep",
      "map",
      "research",
      "people",
      "offline",
    ])
      expect(nav.more.find((link) => link.key === key)?.href).toBe(
        `/trips/shared?view=${key}&day=2027-05-04`,
      );
    expect(nav.more.some((link) => link.label === "Trip settings")).toBe(false);
    expect(new Set(nav.more.map((link) => link.key)).size).toBe(
      nav.more.length,
    );
  });
});
