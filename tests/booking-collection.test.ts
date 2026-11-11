import { it, expect } from "vitest";
import {
  emptyCollectionEntry,
  mergeExtraction,
  collectionCounts,
  reviewedBookingFields,
  collectionEntries,
} from "../lib/booking-collection";
import { extractLabeledText } from "../lib/booking-extraction";
import {
  overviewTrip,
  overviewData,
  overviewSegment,
} from "./fixtures/trip-overview";
import { tripOverview } from "../lib/trip-overview";
it("retains reliable corrections and uncertainty when rereading a source without confirming a reservation", () => {
  const entry = {
    ...emptyCollectionEntry(crypto.randomUUID()),
    fields: { provider: "My corrected provider", price: 0 },
  };
  const result = mergeExtraction(
    entry,
    extractLabeledText(
      "Provider: Source provider\nStart date: 2027-05-01\nCurrency: EUR",
    ),
  );
  expect(result.fields.provider).toBe("My corrected provider");
  expect(result.fields.price).toBe(0);
  expect(result.fields.start_date).toBe("2027-05-01");
  expect(result.fields.end_date).toBeUndefined();
  expect(result.review_status).toBe("needs_review");
  expect(result.reservation_status).toBe("unknown");
  expect(result.extraction.warnings.some((w) => w.includes("was kept"))).toBe(
    true,
  );
  expect(
    collectionCounts([
      result,
      { ...result, id: crypto.randomUUID(), review_status: "reviewed" },
    ]),
  ).toEqual({ total: 2, reviewed: 1, unfinished: 1 });
});
it("does not replace or discard unrecognized legacy metadata", () => {
  expect(() =>
    collectionEntries({ pending_bookings: [{ legacy: "value" }] }),
  ).toThrow(/Nothing has been overwritten/);
  expect(collectionEntries({ other: "kept elsewhere" })).toEqual([]);
});
it("requires complete reviewed fields without blocking unfinished storage or inventing currency/dates", () => {
  expect(reviewedBookingFields({}, crypto.randomUUID()).success).toBe(false);
  const fields = {
    title: "Free activity",
    category: "activity",
    provider: "",
    reference: "",
    start_date: "2027-05-01",
    end_date: "2027-05-01",
    local_time: "",
    timezone: "UTC",
    end_local_time: "",
    end_timezone: "",
    origin: "",
    destination: "",
    travelers: "",
    notes: "",
    price: 0,
    paid_amount: 0,
    currency: "EUR",
    payment_status: "unknown",
  };
  const parsed = reviewedBookingFields(fields, crypto.randomUUID());
  expect(parsed.success).toBe(true);
  if (parsed.success) {
    expect(parsed.data.price).toBe(0);
    expect(parsed.data.paid_amount).toBe(0);
  }
});
it("keeps review counts separate from confirmed reservation summaries", () => {
  const data = overviewData();
  const booking = {
    id: "fixture",
    trip_id: overviewTrip.id,
    title: "Reviewed only",
    category: "flight",
    start_date: "2027-05-01",
    end_date: "2027-05-01",
    local_time: "",
    timezone: "UTC",
    currency: "EUR",
    verification: "user confirmed",
    reservation_status: "unknown",
  } as NonNullable<typeof data.bookings>[number];
  data.bookings = [booking];
  expect(
    tripOverview(
      overviewTrip,
      [overviewSegment()],
      data,
      new Date("2027-04-01"),
    ).bookings?.confirmed,
  ).toBe(0);
  booking.reservation_status = "confirmed";
  expect(
    tripOverview(
      overviewTrip,
      [overviewSegment()],
      data,
      new Date("2027-04-01"),
    ).bookings?.confirmed,
  ).toBe(1);
});
