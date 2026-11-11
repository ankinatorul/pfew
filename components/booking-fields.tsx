"use client";
import { useState } from "react";
import { LocationPicker } from "./location-picker";
import { AutomaticTimezone } from "./automatic-timezone";
import type { ResolvedLocation } from "../lib/location-types";
import type { Trip, Segment } from "../lib/domain";
import { categories, type Booking } from "../lib/essentials";
import { Fields } from "./essentials/fields";
export function BookingFields({
  trip,
  item,
  segments,
  draft,
  review,
  collection = false,
}: {
  trip: Trip;
  item?: Booking;
  draft?: Partial<Booking>;
  review?: { importKey: string; method: "text" | "ai" };
  segments: Segment[];
  collection?: boolean;
}) {
  const [location, setLocation] = useState<ResolvedLocation | null>(null);
  const [arrival, setArrival] = useState<ResolvedLocation | null>(null);
  return (
    <>
      <h2>
        {collection
          ? "Booking details"
          : review
            ? "Review the booking details"
            : item
              ? "Edit booking"
              : "Save a reservation"}
      </h2>
      {review && (
        <>
          <input type="hidden" name="import_key" value={review.importKey} />
          <input type="hidden" name="import_method" value={review.method} />
          <p className="muted">
            Unknown fields are blank. Select the relevant place if needed; local
            time is set automatically. Check dates, amounts and references
            against your confirmation.
          </p>
        </>
      )}
      <LocationPicker
        label="Booking location / departure location · optional"
        initialId={item?.location_id || draft?.location_id}
        initialLabel={item?.location_label || draft?.location_label || ""}
        onResolved={setLocation}
      />
      <AutomaticTimezone
        value={
          location?.timezone ||
          item?.timezone ||
          draft?.timezone ||
          trip.timezone
        }
      />
      <LocationPicker
        label="Arrival location · optional"
        name="end_location_id"
        initialId={item?.end_location_id || draft?.end_location_id}
        initialLabel={
          item?.end_location_label || draft?.end_location_label || ""
        }
        onResolved={setArrival}
      />
      <input
        type="hidden"
        name="end_timezone"
        value={
          arrival?.timezone || item?.end_timezone || draft?.end_timezone || ""
        }
      />

      <p className="muted">
        Only enter details you know. A saved record does not create a
        reservation.
      </p>
      <label>
        Link to itinerary segment · optional
        <select
          name="segment_id"
          defaultValue={item?.segment_id || draft?.segment_id || ""}
        >
          <option value="">No linked segment</option>
          {segments.map((s) => (
            <option value={s.id} key={s.id}>
              {s.title}
            </option>
          ))}
        </select>
      </label>
      <Fields
        values={
          item
            ? { ...item }
            : draft || {
                start_date: trip.start_date,
                end_date: trip.start_date,
                timezone: trip.timezone,
                currency: trip.currency,
              }
        }
        fields={[
          { name: "title", label: "Booking name", required: true },
          {
            name: "category",
            label: "Category",
            options: collection ? ["", ...categories] : categories,
          },
          { name: "provider", label: "Provider" },
          { name: "reference", label: "Booking reference · if known" },
          {
            name: "start_date",
            label: "Start date",
            type: "date",
            required: true,
          },
          { name: "end_date", label: "End date", type: "date", required: true },
          {
            name: "local_time",
            label: "Start local time · optional",
            type: "time",
          },
          { name: "timezone", label: "Start time zone", required: true },
          {
            name: "end_local_time",
            label: "End local time · optional",
            type: "time",
          },
          { name: "end_timezone", label: "End time zone · if known" },
          { name: "origin", label: "Address / departure location", max: 500 },
          { name: "destination", label: "Arrival location", max: 500 },
          { name: "travelers", label: "Traveler names · optional", max: 500 },
          {
            name: "price",
            label: "Known total price · optional",
            type: "number",
            min: 0,
            step: "0.01",
          },
          {
            name: "paid_amount",
            label: "Known amount already paid · optional",
            type: "number",
            min: 0,
            step: "0.01",
          },
          {
            name: "currency",
            label: "Currency · three uppercase letters",
            required: true,
          },
          {
            name: "payment_status",
            label: "Payment state",
            options: ["unknown", "unpaid", "partial", "paid"],
          },
          {
            name: "verification",
            label: "Verification",
            options: ["unverified", "user confirmed"],
          },
          ...(!collection && item?.reservation_status !== undefined
            ? [
                {
                  name: "reservation_status",
                  label: "Reservation status",
                  options: ["unknown", "confirmed", "pending", "cancelled"],
                },
              ]
            : []),
          { name: "notes", label: "Notes", type: "textarea" },
        ].filter(
          (field) => !(review || collection) || field.name !== "verification",
        )}
      />
      {review && (
        <>
          <input type="hidden" name="verification" value="user confirmed" />
          <label>
            <input
              type="checkbox"
              name="review_confirmed"
              value="yes"
              required
            />
            I reviewed these fields and approve sharing this booking with this
            trip’s members. The original source document is not saved by this
            import.
          </label>
        </>
      )}
    </>
  );
}
