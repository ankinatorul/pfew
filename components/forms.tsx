"use client";
import { AutomaticTimezone } from "./automatic-timezone";
import { LocationPicker } from "./location-picker";
import type { ResolvedLocation } from "../lib/location-types";
import { useState, useRef } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "./button";
import {
  saveTrip,
  saveSegment,
  deleteTrip,
  deleteSegment,
} from "../app/actions";
import {
  tripSchema,
  segmentSchema,
  parseDestinations,
  validationMessage,
  type Trip,
  type Segment,
} from "../lib/domain";
export function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return <Button disabled={pending}>{pending ? "Saving…" : children}</Button>;
}
export function Delete({ id, tripId }: { id: string; tripId?: string }) {
  return (
    <form
      action={tripId ? deleteSegment : deleteTrip}
      onSubmit={(e) => {
        if (
          !window.confirm(
            tripId
              ? "Remove this item?"
              : "Delete this trip and all its plans? This cannot be undone.",
          )
        )
          e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      {tripId && <input type="hidden" name="trip_id" value={tripId} />}
      <Button variant="danger">Delete {tripId ? "item" : "trip"}</Button>
    </form>
  );
}
export function TripForm({ trip }: { trip?: Trip }) {
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [destinations, setDestinations] = useState<
    {
      key: number;
      start: string;
      end: string;
      timezone: string;
      location?: ResolvedLocation | null;
    }[]
  >([]);
  const nextDestination = useRef(0);
  const formRef = useRef<HTMLFormElement>(null);
  function validate() {
    const form = new FormData(formRef.current!);
    try {
      const values = tripSchema.parse(Object.fromEntries(form));
      if (!trip) parseDestinations(form, values.start_date, values.end_date);
      setError("");
      return true;
    } catch (e) {
      setError(validationMessage(e));
      return false;
    }
  }

  return (
    <form
      ref={formRef}
      action={saveTrip}
      className="form"
      onSubmit={(e) => {
        if (!validate()) {
          e.preventDefault();
          setStep(0);
        }
      }}
    >
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="steps">
        {["The essentials", "Destinations", "Your style", "Ready to go"].map(
          (s, i) => (
            <span key={s} className={step === i ? "active" : ""}>
              {i + 1}. {s}
            </span>
          ),
        )}
      </div>
      {trip && <input type="hidden" name="id" value={trip.id} />}
      <fieldset hidden={step !== 0}>
        <legend>Where does your next chapter begin?</legend>
        <label>
          Trip name · optional
          <input
            name="name"
            maxLength={120}
            defaultValue={trip?.name}
            placeholder="A little escape to…"
          />
        </label>
        <div className="two">
          <label>
            Departure
            <input
              type="date"
              name="start_date"
              required
              defaultValue={trip?.start_date}
            />
          </label>
          <label>
            Return
            <input
              type="date"
              name="end_date"
              required
              defaultValue={trip?.end_date}
            />
          </label>
        </div>
        <AutomaticTimezone
          value={
            trip?.timezone ||
            destinations.find((d) => d.location)?.location?.timezone
          }
        />
        <p className="muted">
          Local times follow your destinations automatically.
        </p>
      </fieldset>
      <fieldset hidden={step !== 1}>
        <legend>A stop or two along the way?</legend>
        <p className="muted">
          {trip
            ? "Manage destinations from your trip’s Destinations tab."
            : "Add the places you know. Skip this step if you’re still deciding."}
        </p>
        {!trip && (
          <>
            {destinations.map((destination, index) => (
              <div className="destination-entry" key={destination.key}>
                <h3>Destination {index + 1}</h3>
                <LocationPicker
                  label="Destination name"
                  name="destination_location_id"
                  titleName="destination_name"
                  required
                  onResolved={(location) =>
                    setDestinations((current) =>
                      current.map((d) =>
                        d.key === destination.key ? { ...d, location } : d,
                      ),
                    )
                  }
                />
                <input
                  type="hidden"
                  name="destination_timezone"
                  value={destination.location?.timezone || "UTC"}
                />
                <div className="two">
                  <label>
                    Arrival date
                    <input
                      name="destination_start"
                      type="date"
                      required
                      defaultValue={destination.start}
                    />
                  </label>
                  <label>
                    Departure date
                    <input
                      name="destination_end"
                      type="date"
                      required
                      defaultValue={destination.end}
                    />
                  </label>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    setDestinations(
                      destinations.filter((d) => d.key !== destination.key),
                    )
                  }
                >
                  Remove destination {index + 1}
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="secondary"
              disabled={destinations.length >= 32}
              onClick={() => {
                const data = new FormData(formRef.current!);
                setDestinations([
                  ...destinations,
                  {
                    key: nextDestination.current++,
                    start: String(data.get("start_date")),
                    end: String(data.get("end_date")),
                    timezone: String(data.get("timezone")),
                  },
                ]);
              }}
            >
              ＋ Add destination
            </Button>
          </>
        )}
      </fieldset>
      <fieldset hidden={step !== 2}>
        <legend>Make it your kind of trip.</legend>
        <label>
          Travelers
          <input
            name="travelers"
            type="number"
            min="1"
            max="100"
            defaultValue={trip?.travelers || 1}
          />
        </label>
        <label>
          Travel style
          <select name="style" defaultValue={trip?.style || "Comfort"}>
            <option>Budget</option>
            <option>Comfort</option>
            <option>Luxury</option>
          </select>
        </label>
        <div className="two">
          <label>
            Overall budget · optional
            <input
              name="budget"
              type="number"
              min="0"
              step="0.01"
              defaultValue={trip?.budget ?? ""}
            />
          </label>
          <label>
            Currency
            <input
              name="currency"
              pattern="[A-Z]{3}"
              maxLength={3}
              defaultValue={trip?.currency || "EUR"}
            />
          </label>
        </div>
      </fieldset>
      <fieldset hidden={step !== 3}>
        <legend>A little structure. A lot of possibility.</legend>
        <p>
          Your trip will include the destinations you entered. No bookings or
          activities are created automatically.
        </p>
        <p className="muted">
          Travel style and budget are preferences. You can change everything
          later.
        </p>
      </fieldset>
      <div className="actions">
        {step > 0 && (
          <Button
            type="button"
            variant="secondary"
            onClick={() => setStep(step - 1)}
          >
            Back
          </Button>
        )}
        {step < 3 ? (
          <Button
            type="button"
            onClick={(e) => {
              const form = e.currentTarget.form!;
              const fields = Array.from(
                form.querySelectorAll(":scope > fieldset"),
              )[step];
              const invalid = Array.from(
                fields.querySelectorAll<HTMLInputElement>("input"),
              ).find((i) => !i.checkValidity());
              if (invalid) {
                invalid.reportValidity();
                return;
              }
              if (step === 0) {
                const values = new FormData(form);
                const result = tripSchema.safeParse(Object.fromEntries(values));
                if (!result.success) {
                  setError(validationMessage(result.error));
                  return;
                }
              }
              if (step === 1 && !trip) {
                const data = new FormData(form);
                try {
                  parseDestinations(
                    data,
                    String(data.get("start_date")),
                    String(data.get("end_date")),
                  );
                } catch (e) {
                  setError(validationMessage(e));
                  return;
                }
              }
              if (step === 2 && !validate()) return;
              setError("");
              setStep(step + 1);
            }}
          >
            {step === 1 && destinations.length === 0
              ? "Skip destinations"
              : "Continue"}
          </Button>
        ) : (
          <Submit>{trip ? "Save changes" : "Create my trip"}</Submit>
        )}
      </div>
    </form>
  );
}
export function SegmentForm({
  trip,
  item,
  kind = "activity",
  destinations = [],
  initialStatus = "planned",
}: {
  trip: Trip;
  item?: Segment;
  kind?: string;
  destinations?: Segment[];
  initialStatus?: string;
}) {
  const [error, setError] = useState("");
  const [currentKind, setCurrentKind] = useState(item?.kind || kind);
  const [destinationId, setDestinationId] = useState(
    item?.destination_id || "",
  );
  const [location, setLocation] = useState<ResolvedLocation | null>(null);
  const [arrival, setArrival] = useState<ResolvedLocation | null>(null);
  return (
    <form
      action={saveSegment}
      className="form"
      onSubmit={(e) => {
        const parsed = segmentSchema.safeParse(
          Object.fromEntries(new FormData(e.currentTarget)),
        );
        if (!parsed.success) {
          e.preventDefault();
          setError(validationMessage(parsed.error));
        }
      }}
    >
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <input type="hidden" name="trip_id" value={trip.id} />
      {item && <input type="hidden" name="id" value={item.id} />}
      <label>
        Type
        <select
          name="kind"
          value={currentKind}
          onChange={(e) => setCurrentKind(e.target.value)}
        >
          {["destination", "stay", "transport", "activity", "note"].map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
      </label>
      <label>
        Destination · optional
        <select
          name="destination_id"
          value={destinationId}
          onChange={(e) => setDestinationId(e.target.value)}
        >
          <option value="">No destination link</option>
          {destinations
            .filter((d) => d.id !== item?.id)
            .map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
        </select>
      </label>
      <LocationPicker
        label={
          currentKind === "destination"
            ? "Destination location"
            : "City · optional"
        }
        initialId={item?.location_id}
        initialLabel={item?.location_label || ""}
        required={currentKind === "destination"}
        onResolved={setLocation}
      />
      <AutomaticTimezone
        value={
          location?.timezone ||
          destinations.find((d) => d.id === destinationId)?.timezone ||
          item?.timezone ||
          trip.timezone
        }
      />
      <label>
        Name
        <input
          name="title"
          required
          maxLength={200}
          defaultValue={item?.title}
          placeholder="A place, stay, journey, or little plan"
        />
      </label>
      <div className="two">
        <label>
          From
          <input
            type="date"
            name="start_date"
            min={trip.start_date}
            max={trip.end_date}
            required
            defaultValue={item?.start_date || trip.start_date}
          />
        </label>
        <label>
          To
          <input
            type="date"
            name="end_date"
            min={trip.start_date}
            max={trip.end_date}
            required
            defaultValue={item?.end_date || trip.start_date}
          />
        </label>
      </div>
      <div className="two">
        <label>
          Local time · optional
          <input
            type="time"
            name="local_time"
            defaultValue={item?.local_time || ""}
          />
        </label>
      </div>
      <label>
        State
        <select name="status" defaultValue={item?.status || initialStatus}>
          <option value="planned">Planned · no reservation implied</option>
          <option value="confirmed">Confirmed · by you</option>
          <option value="idea">Idea · unscheduled</option>
        </select>
      </label>
      <div className="two">
        <label>
          Address
          <input name="address" maxLength={500} defaultValue={item?.address} />
        </label>
        <label>
          Provider
          <input
            name="provider"
            maxLength={200}
            defaultValue={item?.provider}
          />
        </label>
      </div>
      <label>
        Confirmation reference · if known
        <input
          name="reference"
          maxLength={200}
          defaultValue={item?.reference}
        />
      </label>
      <details>
        <summary>Transportation details · optional</summary>
        <label>
          Mode
          <select
            name="transport_mode"
            defaultValue={item?.transport_mode || ""}
          >
            {[
              "",
              "flight",
              "train",
              "ferry",
              "transfer",
              "rental car",
              "bus",
              "other",
            ].map((v) => (
              <option value={v} key={v}>
                {v || "Not specified"}
              </option>
            ))}
          </select>
        </label>
        <div className="two">
          <label>
            Departure location
            <input name="origin" maxLength={500} defaultValue={item?.origin} />
          </label>
          <label>
            Arrival location
            <input
              name="arrival_location"
              maxLength={500}
              defaultValue={item?.arrival_location}
            />
          </label>
          <label>
            Arrival local time
            <input
              name="arrival_time"
              type="time"
              defaultValue={item?.arrival_time}
            />
          </label>
          <LocationPicker
            label="Arrival city · optional"
            name="arrival_location_id"
            initialId={item?.arrival_location_id}
            initialLabel={item?.arrival_location_label || ""}
            onResolved={setArrival}
          />
          <input
            type="hidden"
            name="arrival_timezone"
            value={arrival?.timezone || item?.arrival_timezone || ""}
          />
        </div>
        <p className="muted">
          Use the From date/time for departure and To date for arrival. Arrival
          local time follows the arrival city.
        </p>
      </details>
      <label>
        Notes
        <textarea
          name="notes"
          maxLength={4000}
          rows={4}
          defaultValue={item?.notes}
          placeholder="Only details you know. Leave unknown information blank."
        />
      </label>
      <label>
        Duration · minutes, optional
        <input
          name="duration_minutes"
          type="number"
          min="1"
          max="1440"
          defaultValue={item?.duration_minutes ?? ""}
        />
      </label>
      <label>
        Flexible item order
        <input
          name="position"
          type="number"
          min="0"
          defaultValue={item?.position || 0}
        />
      </label>
      <Submit>{item ? "Save item" : "Add to trip"}</Submit>
    </form>
  );
}
