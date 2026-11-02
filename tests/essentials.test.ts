import { describe, it, expect } from "vitest";
import {
  bookingSchema,
  allocationSchema,
  budgetSummary,
  expenseSchema,
} from "../lib/essentials";
import { validFileType, safeFilename, MAX_FILE_SIZE } from "../lib/files";
const booking = {
  trip_id: "11111111-1111-4111-8111-111111111111",
  title: "A real stay",
  category: "accommodation",
  provider: "",
  reference: "",
  start_date: "2027-05-01",
  end_date: "2027-05-03",
  local_time: "",
  timezone: "Asia/Tokyo",
  origin: "",
  destination: "",
  travelers: "",
  notes: "",
  price: "",
  paid_amount: "",
  currency: "EUR",
  payment_status: "unknown",
  verification: "unverified",
};
describe("travel essentials", () => {
  it("keeps unknown booking amounts and references unknown", () => {
    const result = bookingSchema.parse(booking);
    expect(result.price).toBeNull();
    expect(result.paid_amount).toBeNull();
    expect(result.reference).toBe("");
  });
  it("rejects prepaid amounts larger than a known booking price", () =>
    expect(
      bookingSchema.safeParse({ ...booking, price: 10, paid_amount: 11 })
        .success,
    ).toBe(false));
  it("keeps actual spending separate from planned/prepaid and separates currencies", () => {
    const summary = budgetSummary(
      "EUR",
      1000,
      true,
      [
        { planned: 200, currency: "EUR" },
        { planned: 999, currency: "JPY" },
      ],
      [
        { paid_amount: 300, currency: "EUR" },
        { paid_amount: 1000, currency: "JPY" },
      ],
      [
        { amount: 20, currency: "EUR" },
        { amount: 100, currency: "JPY" },
      ],
    );
    expect(summary).toEqual({
      planned: 200,
      prepaid: 300,
      actual: { EUR: 20, JPY: 100 },
      committed: 500,
      unallocated: 500,
    });
  });
  it("supports budgets excluding prepaid costs and untracked actuals", () => {
    const s = budgetSummary(
      "EUR",
      500,
      false,
      [],
      [{ paid_amount: 100, currency: "EUR" }],
      [],
    );
    expect(s.unallocated).toBe(500);
    expect(s.actual).toBeNull();
  });
  it("sums monetary values in cents", () =>
    expect(
      budgetSummary(
        "EUR",
        1,
        true,
        [
          { planned: 0.1, currency: "EUR" },
          { planned: 0.2, currency: "EUR" },
        ],
        [],
        [],
      ).planned,
    ).toBe(0.3));
  it("requires complete ordered estimate ranges", () => {
    const a = {
      trip_id: booking.trip_id,
      currency: "EUR",
      category: "Food",
      day: "",
      destination_id: "",
      planned: 10,
      notes: "",
      estimate_low: 10,
      estimate_high: "",
    };
    expect(allocationSchema.safeParse(a).success).toBe(false);
    expect(allocationSchema.safeParse({ ...a, estimate_high: 9 }).success).toBe(
      false,
    );
    expect(
      allocationSchema.safeParse({ ...a, estimate_high: 20 }).success,
    ).toBe(true);
  });
  it("allows manual cash expenses but rejects zero or negative spending", () => {
    const e = {
      trip_id: booking.trip_id,
      amount: 12,
      currency: "EUR",
      category: "Food",
      day: "2027-05-01",
      payment_method: "cash",
      notes: "",
    };
    expect(expenseSchema.safeParse(e).success).toBe(true);
    expect(expenseSchema.safeParse({ ...e, amount: 0 }).success).toBe(false);
  });
  it("verifies file signatures and sanitizes download names", () => {
    expect(
      validFileType(new TextEncoder().encode("%PDF-1.7"), "application/pdf"),
    ).toBe(true);
    expect(
      validFileType(new TextEncoder().encode("<script>"), "application/pdf"),
    ).toBe(false);
    expect(
      validFileType(
        new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
        "image/png",
      ),
    ).toBe(true);
    expect(validFileType(new Uint8Array([255, 216, 255]), "image/jpeg")).toBe(
      true,
    );
    expect(safeFilename("../passport\n.pdf")).not.toContain("/");
    expect(MAX_FILE_SIZE).toBe(3145728);
  });
});
