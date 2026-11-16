import type { Trip } from "../lib/domain";
import type { TripRole } from "../lib/trip-role";
import { ShareTrip } from "./share-trip";
export function CollaborationView({
  trip,
  role,
}: {
  trip: Trip;
  role: TripRole;
}) {
  return (
    <section>
      <h2>Your travel people</h2>
      <ShareTrip trip={trip} role={role} defaultOpen />
    </section>
  );
}
