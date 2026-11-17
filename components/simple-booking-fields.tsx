"use client";
import { bookingCurrency, bookingCurrencies } from "../lib/booking-payment";
import { bookingPlaceFields } from "../lib/booking-place-fields";
import { BedDouble, Plane, Ticket, MoreHorizontal } from "lucide-react";
import { useId, useState } from "react";
import {
  simpleBookingType,
  simpleBookingTypes,
  type SimpleBookingType,
} from "../lib/simple-booking";
import type { CollectionEntry } from "../lib/booking-collection";
import type { Trip } from "../lib/domain";
import type { ResolvedLocation } from "../lib/location-types";
import { SmartBookingName } from "./smart-booking-name";
import {
  bookingDateError,
  type SearchCenter,
} from "../lib/booking-place-search";
import { LocationPicker } from "./location-picker";

export function SimpleBookingFields({
  entry,
  trip,
  paymentDueReady = false,
  onLocationChange,
  confirmationHref,
  searchCenters = [],
}: {
  entry: CollectionEntry;
  trip: Trip;
  paymentDueReady?: boolean;
  confirmationHref?: string;
  searchCenters?: SearchCenter[];
  onLocationChange?: (
    location: ResolvedLocation | null,
    end: boolean,
    name?: string,
    address?: string,
  ) => void;
}) {
  const [type, setType] = useState<SimpleBookingType>(
    simpleBookingType(entry.fields.category),
  );
  const [placeOpen, setPlaceOpen] = useState(false);
  const [payment, setPayment] = useState(
    String(entry.fields.payment_status || "unknown"),
  );
  const value = (key: string) => String(entry.fields[key] ?? "");
  const initial = bookingPlaceFields(entry.fields);
  const [plainName, setPlainName] = useState(initial.title),
    [placeText, setPlaceText] = useState(
      type === "Other" ? initial.title || initial.place : initial.place,
    ),
    [customTitle, setCustomTitle] = useState<string | null>(
      type !== "Other" && initial.customTitle ? initial.title : null,
    );
  const [arrangement, setArrangement] = useState(
    String(
      entry.fields.payment_arrangement ||
        (entry.fields.payment_due_date
          ? "due_date"
          : entry.fields.payment_status === "unpaid"
            ? "unspecified"
            : "property"),
    ),
  );
  const [deadline, setDeadline] = useState(
    String(entry.fields.payment_due_date || ""),
  );
  const currency = bookingCurrency(entry.fields.currency, trip.currency);
  const [addressAuto, setAddressAuto] = useState(
    !initial.address ||
      initial.address === initial.place ||
      initial.address === value("location_label") ||
      initial.address === initial.title,
  );
  const [address, setAddress] = useState(initial.address),
    [addressEdited, setAddressEdited] = useState(false),
    [selectedLabel, setSelectedLabel] = useState(value("location_label"));
  const relevant = type !== "Transport",
    name = relevant ? (customTitle ?? placeText) : plainName;
  const [start, setStart] = useState(value("start_date")),
    [end, setEnd] = useState(value("end_date")),
    [linked, setLinked] = useState(initial.linked);
  const dateErrorId = useId();
  const dateError = bookingDateError(start, end, type);
  function changePlace(next: string) {
    if (type === "Other") setCustomTitle(null);
    setPlaceText(next);
    setSelectedLabel(next);
    if (linked && next !== placeText) {
      setLinked(false);
      const keepAddress =
        addressEdited ||
        (!addressAuto &&
          address !== selectedLabel &&
          address !== placeText &&
          address !== initial.title);
      const nextAddress = keepAddress ? address : "";
      setAddress(nextAddress);
      onLocationChange?.(null, false, customTitle ?? next, nextAddress);
    }
  }
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
                onChange={() => {
                  setPlainName(name);
                  if (choice !== "Transport" && !relevant && !linked)
                    setPlaceText(name);
                  setType(choice);
                }}
              />
              <span>
                <Icon size={18} aria-hidden="true" />
                {choice}
              </span>
            </label>
          );
        })}
      </fieldset>
      {relevant ? (
        <SmartBookingName
          value={placeText}
          kind={type}
          centers={searchCenters}
          onChange={changePlace}
          onSelect={(place, providedAddress) => {
            if (type === "Other") setCustomTitle(null);
            const keepAddress =
              addressEdited ||
              (!addressAuto &&
                !!address &&
                address !== selectedLabel &&
                address !== placeText &&
                address !== initial.title);
            const nextAddress = keepAddress
              ? address
              : providedAddress || place.label;
            setPlaceText(place.city);
            setSelectedLabel(place.label);
            setAddress(nextAddress);
            setAddressAuto(!keepAddress);
            setLinked(true);
            onLocationChange?.(
              place,
              false,
              customTitle ?? place.city,
              nextAddress,
            );
          }}
        />
      ) : (
        <label>
          Name
          <input
            name="title"
            required
            maxLength={200}
            value={name}
            data-booking-primary-field
            onChange={(event) => setPlainName(event.target.value)}
          />
        </label>
      )}
      {relevant && (
        <>
          <input type="hidden" name="title" value={name} />
          <input type="hidden" name="location_label" value={selectedLabel} />
          {address && (
            <small className="booking-place-address">{address}</small>
          )}
        </>
      )}
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
            value={start}
            onChange={(event) => setStart(event.target.value)}
          />
        </label>
        {(type === "Stay" || type === "Transport") && (
          <label>
            {type === "Stay" ? "Check-out date" : "End date (optional)"}
            <input
              type="date"
              name="end_date"
              value={end}
              min={start || undefined}
              aria-invalid={!!dateError}
              aria-describedby={dateError ? dateErrorId : undefined}
              onChange={(event) => setEnd(event.target.value)}
            />
          </label>
        )}
      </div>
      {dateError && (
        <p id={dateErrorId} className="booking-date-error" role="alert">
          {dateError}
        </p>
      )}
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
      {type === "Experience" && (
        <label>
          Time (optional)
          <input
            type="time"
            name="local_time"
            defaultValue={value("local_time")}
          />
        </label>
      )}
      {type === "Other" && (
        <input type="hidden" name="destination" value={address} />
      )}
      {type !== "Other" && (
        <details
          className="simple-booking-place"
          onToggle={(event) => setPlaceOpen(event.currentTarget.open)}
        >
          <summary>
            {type === "Transport"
              ? "Pickup & drop-off (optional)"
              : relevant
                ? "Address & booking details (optional)"
                : "Location details (optional)"}
          </summary>
          {placeOpen && type === "Transport" && (
            <LocationPicker
              key={type + "-start"}
              compact
              onResolved={(place) => onLocationChange?.(place, false)}
              label={type === "Transport" ? "Find pickup" : "Find a place"}
              initialId={value("location_id")}
              initialLabel={value("location_label")}
            />
          )}
          {relevant && linked ? (
            <input type="hidden" name="destination" value={address} />
          ) : (
            <label>
              {type === "Transport" ? "Pickup location" : "Address (optional)"}
              <input
                name={type === "Transport" ? "origin" : "destination"}
                maxLength={500}
                {...(type === "Transport"
                  ? { defaultValue: value("origin") }
                  : {
                      value: address,
                      onChange: (
                        event: React.ChangeEvent<HTMLInputElement>,
                      ) => {
                        setAddress(event.target.value);
                        setAddressEdited(true);
                      },
                    })}
                placeholder={
                  type === "Transport"
                    ? "Pickup place or address"
                    : "Saved address"
                }
              />
            </label>
          )}
          {relevant && (
            <label>
              Booking title (optional)
              <input
                value={customTitle ?? ""}
                placeholder={placeText || "Use place name"}
                maxLength={200}
                onChange={(e) => setCustomTitle(e.target.value || null)}
              />
            </label>
          )}
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
      )}
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
          <select name="currency" aria-label="Currency" defaultValue={currency}>
            {!bookingCurrencies.includes(
              currency as (typeof bookingCurrencies)[number],
            ) && (
              <option value={currency} hidden>
                {currency} (saved currency)
              </option>
            )}
            <option value="EUR">EUR (€)</option>
            <option value="USD">USD ($)</option>
            <option value="RON">RON (lei)</option>
          </select>
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
      {payment === "partial" && (
        <>
          <input type="hidden" name="payment_status" value="partial" />
          <small>
            Partially paid (saved). Choose a payment state to update it.
          </small>
        </>
      )}
      {payment === "unpaid" && (
        <>
          <fieldset
            className="booking-choice-pills booking-payment-pills"
            disabled={!paymentDueReady}
          >
            <legend>How will you pay?</legend>
            {[
              ["property", "Pay at the property"],
              ["due_date", "Payment due on a specific date"],
            ].map(([choice, label]) => (
              <label key={choice}>
                <input
                  type="radio"
                  name="payment_arrangement"
                  value={choice}
                  checked={arrangement === choice}
                  onChange={() => setArrangement(choice)}
                />
                <span>{label}</span>
              </label>
            ))}
            {arrangement === "unspecified" && (
              <small>
                Choose an arrangement, or keep the existing unspecified payment.
              </small>
            )}
            {!paymentDueReady && (
              <small>Payment arrangements aren’t available yet.</small>
            )}
          </fieldset>
          {arrangement === "due_date" && (
            <label>
              Payment due
              <input
                name="payment_due_date"
                aria-label="Payment due"
                type="date"
                disabled={!paymentDueReady}
                required
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
              {deadline && trip.end_date && deadline > trip.end_date && (
                <small>
                  Payment is after this trip ends. Check that this is intended.
                </small>
              )}
            </label>
          )}
        </>
      )}
      {paymentDueReady &&
        payment === "unpaid" &&
        arrangement === "property" && (
          <input type="hidden" name="payment_due_date" value="" />
        )}
      {paymentDueReady && payment !== "unpaid" && (
        <>
          <input type="hidden" name="payment_arrangement" value="unspecified" />
          <input type="hidden" name="payment_due_date" value="" />
        </>
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
