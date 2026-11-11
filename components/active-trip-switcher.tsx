"use client";
import { useId } from "react";
import type { TripCard } from "../lib/trip-collection";

export function ActiveTripSwitcher({
  trips,
  activeTrip,
  unavailable = false,
  onChange,
}: {
  trips: TripCard[];
  activeTrip: TripCard | null;
  unavailable?: boolean;
  onChange?: (tripId: string) => void;
}) {
  const id = useId();
  return (
    <div className="app-trip-switcher">
      <label htmlFor={id}>Current trip</label>
      <select
        id={id}
        className="app-trip-select"
        value={activeTrip?.id || ""}
        disabled={unavailable || !trips.length}
        onChange={(event) => onChange?.(event.target.value)}
      >
        {!activeTrip && (
          <option value="" disabled>
            {unavailable
              ? "Trips unavailable"
              : trips.length
                ? "Choose a trip"
                : "No trips yet"}
          </option>
        )}
        {trips.map((trip) => (
          <option key={trip.id} value={trip.id}>
            {trip.name}
            {trip.shared ? " · Shared" : ""}
          </option>
        ))}
      </select>
      {unavailable && (
        <p className="app-switcher-note" role="status">
          Refresh to try loading your trips again.
        </p>
      )}
    </div>
  );
}
