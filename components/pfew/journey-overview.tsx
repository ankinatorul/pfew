import Link from "next/link";
import { access } from "../../lib/access";
import {
  buildJourney,
  journeyBookingColumns,
  type JourneyBooking,
} from "../../lib/journey";
import type { Trip, Segment } from "../../lib/domain";
import { visibleFinding } from "../../lib/trip-check";
import { deleteSegment } from "../../app/actions";
import { runTripCheck } from "../../app/intelligence-actions";
import { PfewContextMenu, PfewCheckSubmit } from "./context-menu";
import { JourneyOverviewView } from "./journey-view";
export async function JourneyOverview({
  trip,
  segments,
  canEdit,
}: {
  trip: Trip;
  segments: Segment[];
  canEdit: boolean;
}) {
  const { db } = await access();
  const [bookings, findings, decisions, runs] = await Promise.all([
    db.from("bookings").select(journeyBookingColumns).eq("trip_id", trip.id),
    db
      .from("trip_check_findings")
      .select("id,title,active")
      .eq("trip_id", trip.id),
    db
      .from("finding_decisions")
      .select("finding_id,decision,remind_after")
      .eq("trip_id", trip.id),
    db
      .from("trip_check_runs")
      .select("checked_at")
      .eq("trip_id", trip.id)
      .maybeSingle(),
  ]);
  if ([bookings, findings, decisions, runs].some((result) => result.error))
    throw new Error(
      "Your journey details could not be loaded. Please try again.",
    );
  const visible = (findings.data || []).filter((f) =>
    visibleFinding(
      f.active,
      decisions.data?.find((d) => d.finding_id === f.id),
    ),
  );
  return (
    <JourneyOverviewView
      trip={trip}
      journey={buildJourney(
        trip,
        segments,
        (bookings.data || []) as JourneyBooking[],
      )}
      canEdit={canEdit}
      insight={{
        checkedAt: runs.data?.checked_at || null,
        visibleCount: visible.length,
        title: visible[0]?.title || null,
      }}
      LinkComponent={Link}
      renderMenu={(segment) => (
        <PfewContextMenu
          tripId={trip.id}
          itemId={segment.id}
          title={segment.title}
          deleteAction={deleteSegment}
        />
      )}
      checkAction={
        canEdit ? (
          <form action={runTripCheck}>
            <input type="hidden" name="trip_id" value={trip.id} />
            <PfewCheckSubmit checked={Boolean(runs.data)} />
          </form>
        ) : undefined
      }
    />
  );
}
