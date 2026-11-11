import { beforeEach, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({ access: vi.fn() }));
vi.mock("../lib/access", () => ({ access: mocks.access }));
import { Itinerary } from "../components/itinerary";
import { overviewTrip } from "./fixtures/trip-overview";
import { emptyCollectionEntry } from "../lib/booking-collection";
let missing = false,
  broken = false;
beforeEach(() => {
  missing = false;
  broken = false;
  const unfinished = emptyCollectionEntry(crypto.randomUUID()),
    reviewed = {
      ...unfinished,
      id: crypto.randomUUID(),
      review_status: "reviewed",
    };
  mocks.access.mockResolvedValue({
    db: {
      from: (table: string) => {
        const data =
          table === "trip_onboarding"
            ? { preferences: { pending_bookings: [unfinished, reviewed] } }
            : [];
        const result = () => ({
          data,
          error:
            table === "trip_segments" && missing
              ? { code: "42703" }
              : broken && table === "bookings"
                ? { message: "read failed" }
                : null,
        });
        const chain = {
          select: () => chain,
          eq: () => chain,
          order: () => chain,
          limit: () => chain,
          maybeSingle: async () => result(),
          then: (resolve: (r: unknown) => unknown) =>
            Promise.resolve(result()).then(resolve),
        };
        return chain;
      },
    },
  });
});
it("keeps existing saved plans readable and gates new controls if migration 014 is not present", async () => {
  missing = true;
  const page = await Itinerary({
    trip: overviewTrip,
    segments: [],
    canEdit: true,
  });
  expect(page.props.ready).toBe(false);
  expect(page.props.pendingBookings).toBe(1);
  expect(page.props.loadError).toBeUndefined();
});
it("never presents an incomplete booking read as a successful editable empty day", async () => {
  broken = true;
  const page = await Itinerary({
    trip: overviewTrip,
    segments: [],
    canEdit: false,
  });
  expect(page.props.loadError).toContain("could not be loaded");
  expect(page.props.canEdit).toBe(false);
});
