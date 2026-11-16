import Link from "next/link";
import { Pencil } from "lucide-react";
import type { Trip } from "../lib/domain";
import type { TripRole } from "../lib/trip-role";
import { access } from "../lib/access";
import { loadSharingData } from "../lib/sharing-data";
import { ShareTripClient } from "./share-trip-client";
export async function ShareTrip({
  trip,
  role,
  defaultOpen = false,
}: {
  trip: Trip;
  role: TripRole;
  defaultOpen?: boolean;
}) {
  const { db, user } = await access();
  const data = await loadSharingData(db, trip, user.id);
  return (
    <>
      {role === "editor" && data.ready && (
        <Link
          className="overview-edit-link"
          href={`/trips/${trip.id}?view=settings`}
        >
          <Pencil size={14} aria-hidden="true" />
          Edit trip
        </Link>
      )}
      <ShareTripClient data={data} defaultOpen={defaultOpen} />
    </>
  );
}
