import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ access: vi.fn(), load: vi.fn() }));
vi.mock("../lib/access", () => ({ access: mocks.access }));
vi.mock("../lib/booking-collection-server", () => ({
  loadBookingCollection: mocks.load,
}));
vi.mock("../components/booking-collection-client", () => ({
  BookingCollectionClient: () => null,
}));
import { PendingBookingCollection } from "../components/pending-booking-collection";
import { emptyCollectionEntry } from "../lib/booking-collection";
import type { Trip } from "../lib/domain";
const trip = {
  id: "11111111-1111-4111-8111-111111111111",
  owner_id: "owner",
  creation_state: "finalized",
} as Trip;
afterEach(() => vi.resetAllMocks());
it("restores unfinished entries inside the finalized trip's Bookings using the same collection component", async () => {
  const entry = emptyCollectionEntry("22222222-2222-4222-8222-222222222222");
  mocks.access.mockResolvedValue({ db: {}, user: { id: "owner" } });
  mocks.load.mockResolvedValue({
    ready: true,
    entries: [entry],
    attachments: [],
  });
  const result = await PendingBookingCollection({ trip, segments: [] });
  expect(result?.props).toMatchObject({
    trip,
    initialEntries: [entry],
    stepMode: false,
  });
});
it("never exposes the owner's unfinished entries to a shared-trip member", async () => {
  mocks.access.mockResolvedValue({ db: {}, user: { id: "member" } });
  expect(await PendingBookingCollection({ trip, segments: [] })).toBeNull();
  expect(mocks.load).not.toHaveBeenCalled();
});
it("preserves the existing Bookings screen on an unmigrated project", async () => {
  mocks.access.mockResolvedValue({ db: {}, user: { id: "owner" } });
  mocks.load.mockResolvedValue({ ready: false, entries: [], attachments: [] });
  expect(await PendingBookingCollection({ trip, segments: [] })).toBeNull();
});
