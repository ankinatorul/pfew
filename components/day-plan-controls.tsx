"use client";
import { useActionState } from "react";
import { days, type Segment, type Trip } from "../lib/domain";
import { updateDayPlan } from "../app/planning-actions";
import type { PlanningState } from "../lib/planning-types";
import { useOnline } from "./essentials/online";
import { Button } from "./button";
export function DayPlanControls({ item, trip }: { item: Segment; trip: Trip }) {
  const online = useOnline();
  const [state, save, pending] = useActionState(
    updateDayPlan,
    {} as PlanningState,
  );
  if (
    !["activity", "note"].includes(item.kind) ||
    item.start_date !== item.end_date ||
    item.status === "idea" ||
    !item.updated_at
  )
    return null;
  return (
    <details data-edit-action>
      <summary>Change day / time</summary>
      <form action={save} className="form">
        <input type="hidden" name="trip_id" value={trip.id} />
        <input type="hidden" name="id" value={item.id} />
        <input
          type="hidden"
          name="expected_updated_at"
          value={item.updated_at}
        />
        {!online && (
          <p role="status">
            Reconnect to change this plan. Offline copies are read-only.
          </p>
        )}
        <fieldset disabled={pending || !online}>
          <label>
            Move to day
            <select name="day" defaultValue={item.start_date}>
              {days(trip.start_date, trip.end_date).map((day) => (
                <option key={day} value={day}>
                  {day}
                </option>
              ))}
            </select>
          </label>
          <label>
            Local start time · optional
            <input
              type="time"
              name="local_time"
              defaultValue={item.local_time}
            />
          </label>
          {item.kind === "activity" ? (
            <label>
              Duration · minutes, optional
              <input
                name="duration_minutes"
                type="number"
                min="1"
                max="1440"
                defaultValue={item.duration_minutes || ""}
              />
            </label>
          ) : (
            <input type="hidden" name="duration_minutes" value="" />
          )}
          <p className="muted">
            Local time follows this item’s city or the destination on the new
            day. Linked reservations keep their own saved dates; review them in
            Bookings.
          </p>
          {item.status === "confirmed" && (
            <p className="muted">
              Changing the day or start time marks this item as Planned. Confirm
              any reservation change with its provider.
            </p>
          )}
          <Button disabled={pending}>
            {pending ? "Saving…" : "Save day / time"}
          </Button>
          {state.error && (
            <p role="alert" className="error">
              {state.error}
            </p>
          )}
        </fieldset>
      </form>
    </details>
  );
}
