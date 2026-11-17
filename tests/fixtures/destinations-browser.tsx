import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Destinations } from "../../components/destinations";
import { overviewTrip } from "./trip-overview";
declare const DESTINATION_FIXTURE: unknown[];
import type { Trip } from "../../lib/domain";
function Fixture() {
  const [trip, setTrip] = useState<Trip>(
    () =>
      JSON.parse(sessionStorage.getItem("destination-fixture") || "null") || {
        ...overviewTrip,
        trip_revision: 0,
        draft_data: {
          destinations: DESTINATION_FIXTURE,
        },
      },
  );
  useEffect(() => {
    const save = (t: Trip) => {
      sessionStorage.setItem("destination-fixture", JSON.stringify(t));
      setTrip(t);
    };
    const api = globalThis as unknown as {
      pfewDestinationChange: (v: {
        tripRevision: number;
        key: string;
        title: string;
        operation: string;
        start: string;
        end: string;
        notes: string;
      }) => { error?: string };
      pfewDestinationOrder: (v: { revision: number; ids: string[] }) => {
        error?: string;
      };
    };
    api.pfewDestinationOrder = (v) => {
      if (v.revision !== trip.trip_revision)
        return { error: "Changed. Reload." };
      const items = trip.draft_data!.destinations as unknown[];
      save({
        ...trip,
        trip_revision: v.revision + 1,
        draft_data: {
          ...trip.draft_data,
          destinations: v.ids.map((id) => items[Number(id)]),
        },
      });
      return {};
    };
    api.pfewDestinationChange = (v) => {
      if (v.tripRevision !== trip.trip_revision)
        return { error: "Changed. Reload." };
      const items = [
        ...(trip.draft_data!.destinations as Record<string, unknown>[]),
      ];
      if (v.operation === "remove") items.splice(Number(v.key), 1);
      else
        items[Number(v.key)] = {
          ...items[Number(v.key)],
          title: v.title,
          start_date: v.start || null,
          end_date: v.end || null,
          notes: v.notes,
        };
      save({
        ...trip,
        trip_revision: v.tripRevision + 1,
        draft_data: { ...trip.draft_data, destinations: items },
      });
      return {};
    };
  }, [trip]);
  const viewer = new URL(location.href).searchParams.get("mode") === "viewer";
  return (
    <main style={{ padding: 20, background: "#f6f6f8", minHeight: "100vh" }}>
      <Destinations
        trip={trip}
        segments={[]}
        canEdit={!viewer}
        ready
        orderReady
        mixedReady
      />
    </main>
  );
}
createRoot(document.getElementById("fixture-root")!).render(<Fixture />);
