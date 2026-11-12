"use client";
import { BedDouble, Plane, Ticket, MoreHorizontal } from "lucide-react";
import { useState } from "react";
import {
  simpleBookingType,
  simpleBookingTypes,
  type SimpleBookingType,
} from "../lib/simple-booking";
import type { CollectionEntry } from "../lib/booking-collection";
import type { Trip } from "../lib/domain";
import type { ResolvedLocation } from "../lib/location-types";
import { LocationPicker } from "./location-picker";

export function SimpleBookingFields({
  entry,
  trip,
  paymentDueReady = false,
  onLocationChange,
  confirmationHref,
}: {
  entry: CollectionEntry;
  trip: Trip;
  paymentDueReady?: boolean;
  confirmationHref?: string;
  onLocationChange?: (location: ResolvedLocation | null, end: boolean) => void;
}) {
  const [type, setType] = useState<SimpleBookingType>(
    simpleBookingType(entry.fields.category),
  );
  const [placeOpen, setPlaceOpen] = useState(false);
  const [payment, setPayment] = useState(
    String(entry.fields.payment_status || "unknown"),
  );
  const value = (key: string) => String(entry.fields[key] ?? "");
  return (
    <div className="simple-booking-fields">
      {confirmationHref && (
        <a
          className="booking-confirmation-link"
          href={confirmationHref}
          target="_blank"
          rel="noreferrer"
        >
          Open confirmation
        </a>
      )}
      <input
        type="hidden"
        name="timezone"
        value={value("timezone") || trip.timezone}
      />
      <fieldset className="booking-choice-pills" aria-label="Booking type">
        <legend className="sr-only">Booking type</legend>
        {simpleBookingTypes.map((choice, index) => {
          const Icon = [BedDouble, Plane, Ticket, MoreHorizontal][index];
          return (
            <label key={choice}>
              <input
                type="radio"
                name="booking_type"
                value={choice}
                checked={type === choice}
                onChange={() => setType(choice)}
              />
              <span>
                <Icon size={18} aria-hidden="true" />
                {choice}
              </span>
            </label>
          );
        })}
      </fieldset>
      <label>
        Name
        <input
          name="title"
          required
          maxLength={200}
          defaultValue={value("title") || value("provider")}
        />
      </label>
      <div className="simple-booking-pair">
        <label>
          {type === "Stay"
            ? "Check-in date"
            : type === "Transport"
              ? "Travel date"
              : "Date"}
          <input
            type="date"
            name="start_date"
            defaultValue={value("start_date")}
          />
        </label>
        {(type === "Stay" || type === "Transport") && (
          <label>
            {type === "Stay" ? "Check-out date" : "End date (optional)"}
            <input
              type="date"
              name="end_date"
              defaultValue={value("end_date")}
            />
          </label>
        )}
      </div>
      {type === "Stay" && (
        <details className="simple-booking-times">
          <summary>Times (optional)</summary>
          <div className="simple-booking-pair">
            <label>
              Check-in time (optional)
              <input
                name="local_time"
                type="time"
                defaultValue={value("local_time")}
              />
            </label>
            <label>
              Check-out time (optional)
              <input
                name="end_local_time"
                type="time"
                defaultValue={value("end_local_time")}
              />
            </label>
          </div>
        </details>
      )}
      <details
        className="simple-booking-place"
        onToggle={(event) => setPlaceOpen(event.currentTarget.open)}
      >
        <summary>
          {type === "Transport"
            ? "Pickup & drop-off (optional)"
            : "Location (optional)"}
        </summary>
        {placeOpen && (
          <LocationPicker
            key={type + "-start"}
            compact
            onResolved={(place) => onLocationChange?.(place, false)}
            label={type === "Transport" ? "Find pickup" : "Find a place"}
            initialId={value("location_id")}
            initialLabel={
              value("location_label") || (type === "Stay" ? value("title") : "")
            }
          />
        )}
        <label>
          {type === "Transport" ? "Pickup location" : "Location name"}
          <input
            name={type === "Transport" ? "origin" : "destination"}
            maxLength={500}
            defaultValue={value(
              type === "Transport" ? "origin" : "destination",
            )}
            placeholder={
              type === "Stay" ? "Hotel or address" : "Place or address"
            }
          />
        </label>
        {type === "Transport" && (
          <>
            {placeOpen && (
              <LocationPicker
                compact
                label="Find drop-off"
                onResolved={(place) => onLocationChange?.(place, true)}
                name="end_location_id"
                initialId={value("end_location_id")}
                initialLabel={value("end_location_label")}
              />
            )}
            <label>
              Drop-off location
              <input
                name="destination"
                maxLength={500}
                defaultValue={value("destination")}
              />
            </label>
          </>
        )}
      </details>
      <div className="simple-booking-pair">
        <label>
          Cost (optional)
          <input
            name="price"
            inputMode="decimal"
            type="number"
            min="0"
            step="0.01"
            defaultValue={value("price")}
          />
        </label>
        <label>
          Currency
          <input
            name="currency"
            maxLength={3}
            pattern="[A-Z]{3}"
            defaultValue={value("currency") || trip.currency}
          />
        </label>
      </div>
      <fieldset
        className="booking-choice-pills booking-payment-pills"
        aria-label="Payment"
      >
        <legend>Payment</legend>
        {[
          ["paid", "Paid"],
          ["unpaid", "Pay later"],
          ["unknown", "Not set"],
          ...(payment === "partial" ? [["partial", "Partially paid"]] : []),
        ].map(([choice, label]) => (
          <label key={choice}>
            <input
              type="radio"
              name="payment_status"
              value={choice}
              checked={payment === choice}
              onChange={() => setPayment(choice)}
            />
            <span>{label}</span>
          </label>
        ))}
      </fieldset>
      {payment === "unpaid" && (
        <label>
          Payment due
          <input
            name="payment_due_date"
            type="date"
            disabled={!paymentDueReady}
            defaultValue={value("payment_due_date")}
          />
          {!paymentDueReady && (
            <small>Payment deadlines aren’t available yet.</small>
          )}
        </label>
      )}
      <label>
        Booking reference (optional)
        <input
          name="reference"
          maxLength={200}
          defaultValue={value("reference")}
        />
      </label>
    </div>
  );
}
