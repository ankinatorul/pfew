"use client";
import { LocationPicker } from "../location-picker";
import { AutomaticTimezone } from "../automatic-timezone";
import type { ResolvedLocation } from "../../lib/location-types";
import { useOnline } from "./online";
import { useState } from "react";
import { Submit } from "../forms";
import { Button } from "../button";
import { validationMessage, type Trip, type Segment } from "../../lib/domain";
import {
  saveEssential,
  deleteEssential,
  toggleEssential,
} from "../../app/essentials-actions";
import {
  bookingSchema,
  taskSchema,
  packingListSchema,
  packingItemSchema,
  allocationSchema,
  expenseSchema,
  categories,
  prepCategories,
  type Booking,
  type Task,
  type PackingItem,
  type Allocation,
  type Expense,
} from "../../lib/essentials";
type Fields = {
  name: string;
  label: string;
  type?: string;
  options?: readonly string[];
  required?: boolean;
  max?: number;
  min?: number;
  step?: string;
};
function Fields({
  fields,
  values,
}: {
  fields: Fields[];
  values: Record<string, string | number | boolean | null | undefined>;
}) {
  const value = (name: string, fallback = "") => {
    const v = values[name];
    return typeof v === "string" || typeof v === "number" ? v : fallback;
  };
  return (
    <>
      {fields
        .filter(
          (f) =>
            !["timezone", "end_timezone", "arrival_timezone"].includes(f.name),
        )
        .map((f) => (
          <label key={f.name}>
            {f.label}
            {f.options ? (
              <select name={f.name} defaultValue={value(f.name, f.options[0])}>
                {f.options.map((o) => (
                  <option key={o} value={o}>
                    {o || "Not specified"}
                  </option>
                ))}
              </select>
            ) : f.type === "textarea" ? (
              <textarea
                name={f.name}
                rows={3}
                maxLength={f.max || 4000}
                defaultValue={value(f.name)}
              />
            ) : (
              <input
                name={f.name}
                type={f.type || "text"}
                required={f.required}
                maxLength={f.max || 200}
                min={f.min}
                max={f.type === "number" ? f.max : undefined}
                step={f.step}
                defaultValue={value(f.name)}
              />
            )}
          </label>
        ))}
    </>
  );
}
const schemas = {
  bookings: bookingSchema,
  prep_tasks: taskSchema,
  packing_lists: packingListSchema,
  packing_items: packingItemSchema,
  budget_allocations: allocationSchema,
  expenses: expenseSchema,
};
function Form({
  table,
  trip,
  id,
  children,
}: {
  table: keyof typeof schemas;
  trip: string;
  id?: string;
  children: React.ReactNode;
}) {
  const [error, setError] = useState("");
  const online = useOnline();
  return (
    <form
      action={saveEssential}
      className="form"
      onSubmit={(e) => {
        const result = schemas[table].safeParse(
          Object.fromEntries(new FormData(e.currentTarget)),
        );
        if (!result.success) {
          e.preventDefault();
          setError(validationMessage(result.error));
        }
      }}
    >
      <input type="hidden" name="table" value={table} />
      <input type="hidden" name="trip_id" value={trip} />
      {id && <input type="hidden" name="id" value={id} />}
      {!online && (
        <p role="status">
          Connect to the internet to save changes. Offline editing is
          unavailable.
        </p>
      )}
      <fieldset disabled={!online}>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {children}
        <Submit>{id ? "Save changes" : "Add item"}</Submit>
      </fieldset>
    </form>
  );
}
export function Remove({
  table,
  trip,
  id,
}: {
  table: keyof typeof schemas;
  trip: string;
  id: string;
}) {
  return (
    <form
      action={deleteEssential}
      onSubmit={(e) => {
        if (!window.confirm("Delete this item? This cannot be undone."))
          e.preventDefault();
      }}
    >
      <input type="hidden" name="table" value={table} />
      <input type="hidden" name="trip_id" value={trip} />
      <input type="hidden" name="id" value={id} />
      <Button variant="danger">Delete</Button>
    </form>
  );
}
export function Toggle({
  table,
  trip,
  id,
  value,
}: {
  table: "prep_tasks" | "packing_items";
  trip: string;
  id: string;
  value: boolean;
}) {
  return (
    <form action={toggleEssential}>
      <input type="hidden" name="table" value={table} />
      <input type="hidden" name="trip_id" value={trip} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="value" value={String(!value)} />
      <Button variant="secondary">
        {value
          ? "✓ Done · undo"
          : table === "prep_tasks"
            ? "Mark done"
            : "Mark packed"}
      </Button>
    </form>
  );
}
export function BookingForm({
  trip,
  item,
  segments,
}: {
  trip: Trip;
  item?: Booking;
  segments: Segment[];
}) {
  const [location, setLocation] = useState<ResolvedLocation | null>(null);
  const [arrival, setArrival] = useState<ResolvedLocation | null>(null);
  return (
    <Form table="bookings" trip={trip.id} id={item?.id}>
      <h2>{item ? "Edit booking" : "Save a reservation"}</h2>
      <LocationPicker
        label="Booking city / departure city · optional"
        initialId={item?.location_id}
        initialLabel={item?.location_label || ""}
        onResolved={setLocation}
      />
      <AutomaticTimezone
        value={location?.timezone || item?.timezone || trip.timezone}
      />
      <LocationPicker
        label="Arrival city · optional"
        name="end_location_id"
        initialId={item?.end_location_id}
        initialLabel={item?.end_location_label || ""}
        onResolved={setArrival}
      />
      <input
        type="hidden"
        name="end_timezone"
        value={arrival?.timezone || item?.end_timezone || ""}
      />

      <p className="muted">
        Only enter details you know. A saved record does not create a
        reservation.
      </p>
      <label>
        Link to itinerary segment · optional
        <select name="segment_id" defaultValue={item?.segment_id || ""}>
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
            : {
                start_date: trip.start_date,
                end_date: trip.start_date,
                timezone: trip.timezone,
                currency: trip.currency,
              }
        }
        fields={[
          { name: "title", label: "Booking name", required: true },
          { name: "category", label: "Category", options: categories },
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
          { name: "notes", label: "Notes", type: "textarea" },
        ]}
      />
    </Form>
  );
}
export function TaskForm({ trip, item }: { trip: Trip; item?: Task }) {
  return (
    <Form table="prep_tasks" trip={trip.id} id={item?.id}>
      <h2>{item ? "Edit task" : "A little preparation"}</h2>
      <Fields
        values={item ? { ...item } : {}}
        fields={[
          { name: "title", label: "Task", required: true },
          { name: "category", label: "Category", options: prepCategories },
          { name: "due_date", label: "Due date · optional", type: "date" },
          {
            name: "priority",
            label: "Priority",
            options: ["normal", "high", "low"],
          },
        ]}
      />
    </Form>
  );
}
export function PackingListForm({ trip }: { trip: Trip }) {
  return (
    <Form table="packing_lists" trip={trip.id}>
      <h2>Make a packing list</h2>
      <Fields
        fields={[
          {
            name: "traveler",
            label: "Traveler or shared list name",
            required: true,
            max: 100,
          },
        ]}
        values={{ traveler: "Shared" }}
      />
    </Form>
  );
}
export function PackingItemForm({
  trip,
  list,
  item,
}: {
  trip: Trip;
  list: string;
  item?: PackingItem;
}) {
  return (
    <Form table="packing_items" trip={trip.id} id={item?.id}>
      <input type="hidden" name="list_id" value={list} />
      <h3>{item ? "Edit packing item" : "Something to bring"}</h3>
      <Fields
        values={item ? { ...item } : { category: "Essentials", quantity: 1 }}
        fields={[
          { name: "title", label: "Item", required: true },
          { name: "category", label: "Category", required: true, max: 100 },
          {
            name: "quantity",
            label: "Quantity",
            type: "number",
            min: 1,
            max: 1000,
            required: true,
          },
        ]}
      />
    </Form>
  );
}
export function AllocationForm({
  trip,
  item,
  destinations,
}: {
  trip: Trip;
  item?: Allocation;
  destinations: Segment[];
}) {
  return (
    <Form table="budget_allocations" trip={trip.id} id={item?.id}>
      <input
        type="hidden"
        name="currency"
        value={item?.currency || trip.currency}
      />
      <h2>{item ? "Edit allocation" : "Plan your remaining spending"}</h2>
      <p className="muted">
        Amounts in {item?.currency || trip.currency}. Exclude costs already
        included as prepaid bookings. Estimates are your own ranges, not live
        price research.
      </p>
      <label>
        Destination · optional
        <select name="destination_id" defaultValue={item?.destination_id || ""}>
          <option value="">Whole trip</option>
          {destinations.map((d) => (
            <option key={d.id} value={d.id}>
              {d.title}
            </option>
          ))}
        </select>
      </label>
      <Fields
        values={
          item ? { ...item } : { category: "Food and drinks", planned: 0 }
        }
        fields={[
          { name: "category", label: "Category", required: true, max: 100 },
          { name: "day", label: "Trip day · optional", type: "date" },
          {
            name: "planned",
            label: "Planned remaining amount",
            type: "number",
            min: 0,
            step: "0.01",
            required: true,
          },
          {
            name: "estimate_low",
            label: "Estimated low · optional",
            type: "number",
            min: 0,
            step: "0.01",
          },
          {
            name: "estimate_high",
            label: "Estimated high · optional",
            type: "number",
            min: 0,
            step: "0.01",
          },
          {
            name: "notes",
            label: "Assumptions / inclusion notes",
            type: "textarea",
            max: 1000,
          },
        ]}
      />
    </Form>
  );
}
export function ExpenseForm({ trip, item }: { trip: Trip; item?: Expense }) {
  return (
    <Form table="expenses" trip={trip.id} id={item?.id}>
      <h2 id="expense">
        {item ? "Edit expense" : "A little spent along the way"}
      </h2>
      <p className="muted">
        Manual recording only. Your bank accounts are never connected.
      </p>
      <Fields
        values={
          item
            ? { ...item }
            : {
                currency: trip.currency,
                day: new Intl.DateTimeFormat("en-CA", {
                  timeZone: trip.timezone,
                  year: "numeric",
                  month: "2-digit",
                  day: "2-digit",
                }).format(new Date()),
              }
        }
        fields={[
          {
            name: "amount",
            label: "Amount",
            type: "number",
            min: 0.01,
            step: "0.01",
            required: true,
          },
          { name: "currency", label: "Currency", required: true },
          { name: "category", label: "Category", required: true, max: 100 },
          { name: "day", label: "Date", type: "date", required: true },
          {
            name: "payment_method",
            label: "Paid with",
            options: ["cash", "card", "other"],
          },
          {
            name: "notes",
            label: "Note · optional",
            type: "textarea",
            max: 1000,
          },
        ]}
      />
    </Form>
  );
}
