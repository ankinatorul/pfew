import { expect, it } from "vitest";
import {
  emptyCollectionEntry,
  reviewedBookingFields,
} from "../lib/booking-collection";
import {
  simplifiedBookingFields,
  simpleBookingType,
  bookingSummary,
} from "../lib/simple-booking";
const id = "11111111-1111-4111-8111-111111111111";
it("maps all four UI types without rewriting a legacy transport subtype", () => {
  for (const [type, category] of [
    ["Stay", "accommodation"],
    ["Transport", "ground transport"],
    ["Experience", "activity"],
    ["Other", "other"],
  ]) {
    const fields = simplifiedBookingFields(emptyCollectionEntry(id), {
      booking_type: type,
      title: "Saved",
    });
    expect(fields.category).toBe(category);
    expect(simpleBookingType(category)).toBe(type);
  }
  const e = emptyCollectionEntry(id);
  e.fields.category = "flight";
  expect(
    simplifiedBookingFields(e, { booking_type: "Transport", title: "Airline" })
      .category,
  ).toBe("flight");
});
it("preserves hidden legacy fields, source, status, segment and paid amounts on edits", () => {
  const e = {
    ...emptyCollectionEntry(id),
    reservation_status: "cancelled" as const,
    fields: {
      category: "ferry",
      provider: "Original",
      segment_id: id,
      travelers: "Private names",
      notes: "Keep",
      paid_amount: 50,
      payment_status: "partial",
      end_location_id: "legacy",
      payment_due_date: "2027-01-01",
    },
  };
  const fields = simplifiedBookingFields(e, {
    booking_type: "Transport",
    title: "Corrected",
  });
  expect(fields).toMatchObject({ ...e.fields, title: "Corrected" });
  expect(e.reservation_status).toBe("cancelled");
});
it("does not infer unknown dates or costs, and only expands an explicit single-day date", () => {
  const e = emptyCollectionEntry(id);
  const unknown = simplifiedBookingFields(e, {
    booking_type: "Stay",
    title: "Hotel",
  });
  expect(unknown.start_date).toBe("");
  expect(unknown.end_date).toBe("");
  expect(unknown.price).toBe("");
  expect(reviewedBookingFields(unknown, id).success).toBe(false);
  expect(
    simplifiedBookingFields(e, {
      booking_type: "Experience",
      start_date: "2027-06-01",
    }).end_date,
  ).toBe("2027-06-01");
  expect(
    simplifiedBookingFields(e, {
      booking_type: "Stay",
      start_date: "2027-06-01",
    }).end_date,
  ).toBe("");
});
it("summarizes reliable information without missing-field or reservation claims", () => {
  const e = emptyCollectionEntry(id);
  expect(bookingSummary(e)).toEqual({ detail: "", payment: "" });
  e.fields = {
    price: 0,
    currency: "EUR",
    payment_status: "paid",
    start_date: "2027-06-01",
    end_date: "2027-06-01",
  };
  expect(bookingSummary(e)).toEqual({
    detail: "2027-06-01 · EUR 0",
    payment: "Paid",
  });
  expect(e.reservation_status).toBe("unknown");
});
