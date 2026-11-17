import React, { useEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { emptyCollectionEntry } from "../../lib/booking-collection";
import { BookingCollection } from "../../components/booking-collection";
import { TripExplorer } from "../../components/trip-map";
import type { TripMapData } from "../../lib/trip-map";
import { overviewBooking } from "./trip-overview";
declare const __PFEW_MAP__: TripMapData;
import { ItineraryView } from "../../components/itinerary-view";
import { BookingBudget } from "../../components/booking-budget";
import { TripOverviewView } from "../../components/trip-overview-view";
import type { TripOverview } from "../../lib/trip-overview";
declare const __PFEW_OVERVIEW__: TripOverview;
import Link, {
  fixtureTrip,
  navigate,
  records,
  seedBooking,
} from "./booking-entry-runtime";
function Fixture() {
  const [version, setVersion] = useState(0),
    [page, setPage] = useState<ReactNode>(null);
  useEffect(() => {
    const fn = () => setVersion((v) => v + 1);
    window.addEventListener("fixture:navigation", fn);
    return () => window.removeEventListener("fixture:navigation", fn);
  }, []);
  useEffect(() => {
    let active = true;
    async function load() {
      await Promise.resolve();
      if (!active) return;
      const q = new URLSearchParams(location.search),
        view = q.get("view");
      if (view === "bookings" || view === "stays") {
        // Execute the actual production server composition, with only DB/auth/actions mocked.
        void BookingBudget({
          trip: fixtureTrip,
          segments: [],
          view: "bookings",
          canEdit: true,
          edit: q.get("edit") || undefined,
          initialCategory: view === "stays" ? "accommodation" : undefined,
        }).then((v) => {
          if (active) setPage(v);
        });
      } else if (view === "map") {
        seedBooking(
          overviewBooking({
            trip_id: fixtureTrip.id,
            title: "Map stay fixture",
          }),
        );
        setPage(<TripExplorer data={__PFEW_MAP__} canEdit />);
      } else if (view === "itinerary") {
        setPage(
          <ItineraryView
            trip={fixtureTrip}
            segments={[]}
            bookings={records()}
            ideas={[]}
            canEdit
            ready
            live={false}
            pendingBookings={0}
            today="2027-05-01"
            mutate={async () => ({})}
            explore={async () => ({})}
            LinkComponent={Link}
          />,
        );
      } else if (view === "create") {
        const entries = JSON.parse(
          sessionStorage.getItem("fixture:canonical-intake") || "[]",
        );
        setPage(
          <BookingCollection
            trip={fixtureTrip}
            initialEntries={entries}
            initialAttachments={[]}
            paymentDueReady
            request={async (body) => {
              if (body instanceof FormData)
                throw new Error("Uploads not used by this fixture");
              const entry = {
                ...emptyCollectionEntry(String(body.id)),
                ...body,
                revision: Number(body.revision) + 1,
                updated_at: new Date().toISOString(),
              };
              sessionStorage.setItem(
                "fixture:canonical-intake",
                JSON.stringify([entry]),
              );
              return { entry: entry as never };
            }}
          />,
        );
      } else if (view === "hub") {
        const model = __PFEW_OVERVIEW__;
        setPage(
          <TripOverviewView model={model} role="owner" LinkComponent={Link} />,
        );
      } else
        setPage(
          <button onClick={() => navigate(`/trips/${fixtureTrip.id}?view=hub`)}>
            Open existing trip
          </button>,
        );
    }
    void load();
    return () => {
      active = false;
    };
  }, [version]);
  return <main className="workspace-content">{page}</main>;
}
createRoot(document.getElementById("fixture-root")!).render(<Fixture />);
