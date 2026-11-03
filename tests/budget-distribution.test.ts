import { it, expect } from "vitest";
import { distributeBudget, moneyCents } from "../lib/budget-distribution";
import { budgetContextKey } from "../lib/budget-context";
const input = {
  amount: "100.01",
  categories: [
    { name: "Food", weight: 60 },
    { name: "Activities", weight: 40 },
  ],
  days: [
    { day: "2027-05-01", weight: 1 },
    { day: "2027-05-02", weight: 2 },
  ],
};
it("preserves every cent while weighting days and categories with stable rounding", () => {
  const rows = distributeBudget(input);
  expect(rows.reduce((sum, row) => sum + row.cents, 0)).toBe(10001);
  expect(
    rows
      .filter((row) => row.day === "2027-05-02")
      .reduce((sum, row) => sum + row.cents, 0),
  ).toBeGreaterThan(
    rows
      .filter((row) => row.day === "2027-05-01")
      .reduce((sum, row) => sum + row.cents, 0),
  );
  expect(
    distributeBudget({ ...input, days: [...input.days].reverse() }),
  ).toEqual(rows);
});
it("handles a one-cent plan and the supported upper bound without losing precision", () => {
  expect(
    distributeBudget({ ...input, amount: "0.01" }).reduce(
      (sum, row) => sum + row.cents,
      0,
    ),
  ).toBe(1);
  expect(moneyCents("9999999999.00")).toBe(999999999900n);
  expect(() => moneyCents("0")).toThrow();
  expect(() => moneyCents("1.001")).toThrow();
  expect(() => moneyCents("1,00")).toThrow();
});
it("rejects duplicate days/categories, invalid weights, and empty distributions", () => {
  for (const bad of [
    { ...input, categories: [{ name: "Food", weight: 50 }] },
    { ...input, days: [input.days[0], input.days[0]] },
    {
      ...input,
      categories: [
        { name: "Food", weight: 50 },
        { name: " food ", weight: 50 },
      ],
    },
    { ...input, days: [{ day: "2027-05-01", weight: 0 }] },
  ])
    expect(() => distributeBudget(bad)).toThrow();
  expect(
    distributeBudget({
      ...input,
      categories: [
        { name: "Food", weight: 100 },
        { name: "Ignored", weight: 0 },
      ],
      days: [
        { day: "2027-05-01", weight: 1 },
        { day: "2027-05-02", weight: 0 },
      ],
    }),
  ).toHaveLength(1);
});
it("detects changes to currency, prepaid inclusion and current allocations independently of query order", () => {
  const trip = {
      currency: "EUR",
      budget: 1000,
      start_date: "2027-05-01",
      end_date: "2027-05-10",
    },
    rows = [
      {
        id: "a",
        planned: 10,
        currency: "EUR",
        day: null,
        destination_id: null,
      },
      {
        id: "b",
        planned: 20,
        currency: "EUR",
        day: null,
        destination_id: null,
      },
    ],
    bookings = [{ id: "b", paid_amount: 100, currency: "EUR" }];
  const key = budgetContextKey(trip, true, rows, bookings);
  expect(budgetContextKey(trip, true, [...rows].reverse(), bookings)).toBe(key);
  expect(
    budgetContextKey({ ...trip, currency: "USD" }, true, rows, bookings),
  ).not.toBe(key);
  expect(budgetContextKey(trip, false, rows, bookings)).not.toBe(key);
  expect(
    budgetContextKey(
      trip,
      true,
      [{ ...rows[0], planned: 11 }, rows[1]],
      bookings,
    ),
  ).not.toBe(key);
});
