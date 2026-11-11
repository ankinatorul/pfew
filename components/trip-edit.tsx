import type { ElementType } from "react";
import { ArrowLeft } from "lucide-react";
import type { Trip } from "../lib/domain";
import { tripSectionUrl } from "../lib/trip-navigation";
import { tripDeletionDescription } from "../lib/trip-deletion";
import { TripForm, Delete } from "./forms";

export function TripEdit({
  trip,
  day,
  LinkComponent = "a",
}: {
  trip: Trip;
  day?: string;
  LinkComponent?: ElementType;
}) {
  return (
    <section className="trip-edit" aria-labelledby="trip-edit-title">
      <LinkComponent
        className="trip-edit-back"
        href={tripSectionUrl(trip.id, "hub", day)}
      >
        <ArrowLeft size={16} aria-hidden="true" /> Back to trip
      </LinkComponent>
      <header className="trip-edit-heading">
        <span className="eyebrow">Trip details</span>
        <h1 id="trip-edit-title">Edit trip</h1>
        <p>{trip.name}</p>
      </header>
      <TripForm trip={trip} />
      <section className="trip-edit-danger" aria-labelledby="trip-delete-title">
        <div>
          <h2 id="trip-delete-title">Delete trip</h2>
          <p>{tripDeletionDescription}</p>
        </div>
        <Delete id={trip.id} />
      </section>
    </section>
  );
}
