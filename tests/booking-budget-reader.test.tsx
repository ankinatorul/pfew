import { it, expect, vi, beforeEach } from "vitest";
const mocks = vi.hoisted(() => ({ access: vi.fn(), collection: vi.fn() }));
vi.mock("../lib/access", () => ({ access: mocks.access }));
vi.mock("../lib/booking-collection-server", () => ({
  loadBookingCollection: mocks.collection,
}));
import { BookingBudget } from "../components/booking-budget";
import { overviewBooking } from "./fixtures/trip-overview";
import { overviewTrip } from "./fixtures/trip-overview";
let missing = false,
  failed = false;
let attachments: unknown[] = [];
let bookings: unknown[] = [];
beforeEach(() => {
  missing = false;
  failed = false;
  attachments = [];
  bookings = [];
  mocks.collection.mockResolvedValue({
    entries: [],
    attachments: [],
    ready: true,
    error: "",
  });
  mocks.access.mockResolvedValue({
    user: { id: "owner" },
    db: {
      rpc: async () => ({ data: 1, error: null }),
      from: (table: string) => {
        let columns = "";
        const result = () => ({
          data:
            table === "budget_settings"
              ? null
              : table === "booking_attachments"
                ? attachments
                : table === "bookings"
                  ? bookings
                  : [],
          error:
            missing && columns.includes("finance_revision")
              ? { code: "42703" }
              : failed && table === "expenses"
                ? { message: "Read failed" }
                : null,
        });
        const chain = {
          select: (v: string) => {
            columns = v;
            return chain;
          },
          eq: () => chain,
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
it("keeps legacy bookings readable and fails closed for new controls when 015 is absent", async () => {
  missing = true;
  const page = await BookingBudget({
    trip: overviewTrip,
    segments: [],
    view: "bookings",
    canEdit: true,
  });
  expect(page.props.ready).toBe(false);
  expect(page.props.bookings).toEqual([]);
  expect(page.props.loadError).toBeUndefined();
});
it("does not report an expense read failure as a reliable zero balance", async () => {
  failed = true;
  const page = await BookingBudget({
    trip: overviewTrip,
    segments: [],
    view: "budget",
    canEdit: true,
  });
  expect(page.props.loadError).toContain("incomplete");
  expect(page.props.planning).toBe(false);
});

it("shared confirmation downloads remain available without another uploader’s removal control", async () => {
  const booking = overviewBooking();
  bookings = [booking];
  attachments = [
    { id: "mine", booking_id: booking.id, owner_id: "owner" },
    { id: "shared", booking_id: booking.id, owner_id: "editor" },
  ];
  const page = await BookingBudget({
    trip: overviewTrip,
    segments: [],
    view: "bookings",
    canEdit: true,
  });
  expect(page.props.attachments).toHaveLength(2);
  const tools = page.props.fileTools[booking.id];
  const removals = tools.props.children[0];
  expect(removals).toHaveLength(1);
  expect(removals[0].props.id).toBe("mine");
});
