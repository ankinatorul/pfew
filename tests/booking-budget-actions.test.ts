import { it, expect, vi, beforeEach } from "vitest";
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  rpc: vi.fn(),
  refresh: vi.fn(),
  normalize: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("../lib/access", () => ({ access: mocks.access }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.refresh }));
vi.mock("../lib/automatic-zones", () => ({
  bookingLocationValues: mocks.normalize,
}));
vi.mock("../lib/booking-removal", () => ({
  prepareBookingRemoval: mocks.remove,
}));
import {
  saveExpense,
  removeExpense,
  saveMonetaryBudget,
  saveManagedBooking,
  removeManagedBooking,
} from "../app/booking-budget-actions";
import { overviewTrip, overviewBooking } from "./fixtures/trip-overview";
const trip = overviewTrip.id,
  expense = {
    id: crypto.randomUUID(),
    revision: 0,
    title: "Lunch",
    amount: "12.50",
    currency: "EUR",
    category: "Food & Drink",
    day: "2027-05-01",
    notes: "",
    payment_method: "cash" as const,
    booking_id: "",
  };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ data: expense.id, error: null });
  mocks.remove.mockResolvedValue(null);
  mocks.normalize.mockResolvedValue(overviewBooking());
  mocks.access.mockResolvedValue({
    db: {
      rpc: mocks.rpc,
      from: () => {
        const chain = {
          select: () => chain,
          eq: () => chain,
          delete: () => chain,
          single: async () => ({
            data: { id: expense.id, finance_revision: 0 },
            error: null,
          }),
        };
        return chain;
      },
    },
  });
});
it("validates expenses before writes and preserves input without reporting false success", async () => {
  expect(
    (await saveExpense(trip, { ...expense, amount: "0" })).error,
  ).toBeTruthy();
  expect(mocks.access).not.toHaveBeenCalled();
  mocks.rpc.mockResolvedValue({
    error: { code: "PGRST202", message: "missing" },
    data: null,
  });
  expect((await saveExpense(trip, expense)).error).toContain("015");
  expect(mocks.refresh).not.toHaveBeenCalled();
});
it("writes stable expense identities and optional booking links without creating extra expenses or touching bookings", async () => {
  expect((await saveExpense(trip, expense)).error).toBeUndefined();
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("change_expense", {
    target: trip,
    record_id: expense.id,
    expected_revision: 0,
    fields: expense,
    remove: false,
  });
  await removeExpense(trip, expense.id, 0);
  expect(mocks.rpc.mock.calls[1][1].remove).toBe(true);
});
it("does not send travel style or convert currencies when saving a monetary budget", async () => {
  const r = await saveMonetaryBudget(trip, {
    amount: "500",
    currency: "USD",
    expectedAmount: 1000,
    expectedCurrency: "EUR",
  });
  expect(r.error).toBeUndefined();
  expect(mocks.rpc).toHaveBeenCalledWith("save_monetary_budget", {
    target: trip,
    total: 500,
    unit: "USD",
    expected_total: 1000,
    expected_unit: "EUR",
  });
  expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain("style");
});
it("reuses normalization and independently saved statuses for booking updates", async () => {
  const booking = {
    ...overviewBooking(),
    verification: "user confirmed",
    reservation_status: "pending",
  };
  mocks.normalize.mockResolvedValue(booking);
  const form = new FormData();
  form.set("id", booking.id);
  form.set("revision", "2");
  await saveManagedBooking(trip, form);
  expect(mocks.rpc.mock.calls[0][1].fields.reservation_status).toBe("pending");
  expect(mocks.rpc.mock.calls[0][1].fields.verification).toBe("user confirmed");
});
it("does not remove files for a stale booking or after an authorization/private-file denial", async () => {
  expect((await removeManagedBooking(trip, expense.id, 2)).error).toContain(
    "changed",
  );
  expect(mocks.remove).not.toHaveBeenCalled();
  mocks.remove.mockResolvedValue(
    "Other travelers have private documents attached.",
  );
  expect((await removeManagedBooking(trip, expense.id, 0)).error).toContain(
    "Other travelers",
  );
});

it("rejects over-precise booking amounts rather than silently rounding their stored value", async () => {
  mocks.normalize.mockResolvedValue({
    ...overviewBooking(),
    price: 12.345,
    paid_amount: null,
  });
  const form = new FormData();
  form.set("id", crypto.randomUUID());
  form.set("revision", "0");
  expect((await saveManagedBooking(trip, form)).error).toContain("two decimal");
  expect(mocks.rpc).not.toHaveBeenCalled();
});
