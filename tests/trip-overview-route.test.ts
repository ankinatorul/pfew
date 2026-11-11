import { afterEach, beforeEach, it, expect, vi } from "vitest";
import { Children, isValidElement, type ReactNode } from "react";
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  role: vi.fn(),
  dashboard: vi.fn(() => null),
}));
vi.mock("../lib/access", () => ({ access: mocks.access }));
vi.mock("../lib/trip-role", () => ({ tripRole: mocks.role }));
vi.mock("../components/trip-overview", () => ({
  TripDashboard: mocks.dashboard,
}));
import Hub from "../app/trips/[id]/page";
import { TripEdit } from "../components/trip-edit";
import { SegmentForm } from "../components/forms";
import {
  overviewTrip as trip,
  overviewNow as now,
  overviewSegment,
} from "./fixtures/trip-overview";
let current: typeof trip | null;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  current = trip;
  mocks.role.mockResolvedValue("owner");
  mocks.access.mockResolvedValue({
    user: { id: "owner" },
    db: {
      from: (table: string) => {
        const query = {
          select: () => query,
          eq: () => query,
          order: () => query,
          maybeSingle: async () => ({
            data: table === "trips" ? current : { layout: [] },
            error: null,
          }),
          then: (resolve: (value: unknown) => unknown) =>
            Promise.resolve({ data: [overviewSegment()], error: null }).then(
              resolve,
            ),
        };
        return query;
      },
    },
  });
});
afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});
const route = (query: Record<string, string> = {}) =>
  Hub({
    params: Promise.resolve({ id: trip.id }),
    searchParams: Promise.resolve(query),
  });
it("opens the new upcoming overview using the existing authorized trip and role", async () => {
  mocks.role.mockResolvedValue("viewer");
  const page = await route({ day: "2027-05-03" });
  expect(page.type).toBe(mocks.dashboard);
  expect(page.props).toMatchObject({ trip, role: "viewer", day: "2027-05-03" });
});
it("routes ongoing and completed trips through the shared overview", async () => {
  vi.setSystemTime(new Date("2027-05-02"));
  expect((await route()).type).toBe(mocks.dashboard);
  vi.setSystemTime(new Date("2027-06-01"));
  expect((await route()).type).toBe(mocks.dashboard);
});
it("does not replace underlying itinerary, booking, packing, or budget sections", async () => {
  for (const view of [
    "itinerary",
    "bookings",
    "packing",
    "budget",
    "documents",
  ])
    expect((await route({ view })).type).not.toBe(mocks.dashboard);
});
it("keeps inaccessible trips behind the existing not-found boundary", async () => {
  current = null;
  await expect(route()).rejects.toThrow();
  expect(mocks.dashboard).not.toHaveBeenCalled();
});
it("redirects an owned draft to creation before loading dashboard permissions", async () => {
  current = { ...trip, owner_id: "owner", creation_state: "draft" };
  await expect(route()).rejects.toThrow("NEXT_REDIRECT");
  expect(mocks.role).not.toHaveBeenCalled();
});
it("never renders a foreign private draft even if a stale read returned it", async () => {
  current = { ...trip, owner_id: "someone-else", creation_state: "draft" };
  await expect(route()).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
  expect(mocks.role).not.toHaveBeenCalled();
});
it("reuses the existing owner settings route for trip editing", async () => {
  const page = await route({ view: "settings", day: "2027-05-03" });
  expect(page.type).toBe(TripEdit);
  expect(page.props).toMatchObject({ trip, day: "2027-05-03" });
});
it("does not expose trip editing or deletion through direct links to editors or viewers", async () => {
  for (const role of ["editor", "viewer"]) {
    mocks.role.mockResolvedValue(role);
    await expect(route({ view: "settings" })).rejects.toThrow();
  }
});
it("handles missing/open-ended dates without falling into the legacy completed-trip hub", async () => {
  vi.setSystemTime(new Date("2027-05-03"));
  for (const change of [{ start_date: "" }, { end_date: "" }, { timezone: "Invalid/Zone" }]) {
    current = { ...trip, ...change };
    expect((await route()).type).toBe(mocks.dashboard);
  }
});
it("preserves owner trip settings and editor itinerary editing after the trip end date", async () => {
  vi.setSystemTime(new Date("2027-06-01"));
  expect((await route({ view: "settings" })).type).toBe(TripEdit);
  mocks.role.mockResolvedValue("editor");
  const page = await route({ view: "add", edit: overviewSegment().id });
  function findForm(node: ReactNode): boolean {
    if (!isValidElement<{ children?: ReactNode }>(node)) return false;
    return node.type === SegmentForm || Children.toArray(node.props.children).some(findForm);
  }
  expect(findForm(page)).toBe(true);
});
