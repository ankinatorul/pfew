import { it, expect } from "vitest";
import {
  tripMoney,
  namedExpenseSchema,
  expenseName,
  displayMoney,
} from "../lib/booking-budget";
import { dailyItinerary } from "../lib/itinerary";
import {
  overviewTrip,
  overviewBooking,
  overviewSegment,
} from "./fixtures/trip-overview";
const expense = {
  id: "44444444-4444-4444-8444-444444444444",
  trip_id: overviewTrip.id,
  title: "Museum tickets",
  amount: 25.15,
  currency: "EUR",
  category: "Activities",
  day: "2027-05-01",
  payment_method: "card" as const,
  notes: "",
  booking_id: "33333333-3333-4333-8333-333333333333",
};
it("counts only explicit recorded expenses, never adds booking prices or paid amounts to actuals", () => {
  const booking = overviewBooking({
    price: 500,
    paid_amount: 100,
    reservation_status: "confirmed",
  });
  const result = tripMoney(
    { ...overviewTrip, budget: 200 },
    [booking],
    [expense],
    [],
  );
  const activity = overviewSegment({
    kind: "activity",
    start_date: overviewTrip.start_date,
    end_date: overviewTrip.start_date,
  });
  const day = dailyItinerary(
    overviewTrip,
    [activity],
    [{ ...booking, segment_id: activity.id, local_time: "11:00" }],
    overviewTrip.start_date,
  );
  expect(day.standalone).toEqual([]);
  expect(day.relevant[0].local_time).toBe("11:00");
  expect(result.recorded).toBe(25.15);
  expect(result.remaining).toBe(174.85);
  expect(result.bookingPrices).toEqual([{ currency: "EUR", amount: 500 }]);
  expect(result.bookingPaid).toEqual([{ currency: "EUR", amount: 100 }]);
  expect(result.categoryTotals).toEqual([
    { category: "Activities", amount: 25.15 },
  ]);
  expect(tripMoney(overviewTrip, [booking], [], []).recorded).toBe(0);
});
it("keeps currencies separate and uses exact cents rather than accumulating floating point errors", () => {
  const result = tripMoney(
    { ...overviewTrip, budget: 1 },
    [],
    [
      { ...expense, amount: 0.1 },
      { ...expense, id: crypto.randomUUID(), amount: 0.2 },
      { ...expense, id: crypto.randomUUID(), amount: 75, currency: "USD" },
    ],
    [],
  );
  expect(result.recorded).toBe(0.3);
  expect(result.remaining).toBe(0.7);
  expect(
    tripMoney({ ...overviewTrip, budget: 12.345 }, [], [], []).remaining,
  ).toBe(12.345);
  expect(result.actual).toEqual([
    { currency: "EUR", amount: 0.3 },
    { currency: "USD", amount: 75 },
  ]);
  expect(result.categoryTotals[0].amount).toBe(0.3);
});
it("preserves no-budget and zero-budget states, and keeps cancellation history separate from prices", () => {
  const cancelled = overviewBooking({ reservation_status: "cancelled" });
  expect(
    tripMoney({ ...overviewTrip, budget: null }, [cancelled], [expense], [])
      .remaining,
  ).toBeNull();
  expect(
    tripMoney({ ...overviewTrip, budget: 0 }, [], [expense], []).remaining,
  ).toBe(-25.15);
  expect(tripMoney(overviewTrip, [cancelled], [], []).bookingPrices).toEqual(
    [],
  );
  expect(expenseName({ ...expense, title: null })).toBe(
    "Legacy expense · Activities",
  );
  expect(displayMoney("EUR", 25.15)).toContain("25.15");
});
it("requires expense names, positive bounded two-decimal amounts, real dates and valid links", () => {
  const input = {
    ...expense,
    amount: "25.15",
    revision: 0,
    booking_id: expense.booking_id,
  };
  expect(namedExpenseSchema.safeParse(input).success).toBe(true);
  for (const patch of [
    { title: "" },
    { amount: "0" },
    { amount: "-1" },
    { amount: "12.345" },
    { amount: "Infinity" },
    { day: "" },
    { day: "2027-02-30" },
    { currency: "eur" },
    { booking_id: "fake" },
  ])
    expect(namedExpenseSchema.safeParse({ ...input, ...patch }).success).toBe(
      false,
    );
});
