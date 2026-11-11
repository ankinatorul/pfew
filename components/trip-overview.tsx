import Link from "next/link";
import type { ReactNode } from "react";
import { access } from "../lib/access";
import type { Trip, Segment } from "../lib/domain";
import type { TripRole } from "../lib/trip-role";
import { tripOverview, type TripOverviewData } from "../lib/trip-overview";
import { Toggle } from "./essentials/forms";
import { FindingDismiss } from "./trip-overview-controls";
import { TripOverviewView } from "./trip-overview-view";

export async function TripDashboard({
  trip,
  segments,
  role,
  day,
  now = new Date(),
}: {
  trip: Trip;
  segments: Segment[];
  role: TripRole;
  day?: string;
  now?: Date;
}) {
  const { db, user } = await access();
  const results = await Promise.all([
    db.from("bookings").select("*").eq("trip_id", trip.id),
    db.from("prep_tasks").select("*").eq("trip_id", trip.id),
    db.from("packing_lists").select("id").eq("trip_id", trip.id),
    db.from("packing_items").select("packed").eq("trip_id", trip.id),
    db
      .from("booking_attachments")
      .select("state")
      .eq("trip_id", trip.id)
      .eq("owner_id", user.id),
    db.from("budget_allocations").select("*").eq("trip_id", trip.id),
    db.from("expenses").select("*").eq("trip_id", trip.id),
    db.from("budget_settings").select("include_prepaid").eq("trip_id", trip.id),
    db
      .from("trip_check_findings")
      .select("id,fingerprint")
      .eq("trip_id", trip.id),
    db
      .from("finding_decisions")
      .select("finding_id,decision,remind_after")
      .eq("trip_id", trip.id),
  ]);
  function rows<T>(index: number) {
    return results[index].error ? null : ((results[index].data || []) as T);
  }
  const settings = rows<{ include_prepaid: boolean }[]>(7);
  const data: TripOverviewData = {
    bookings: rows(0),
    tasks: rows(1),
    packingLists: rows(2),
    packingItems: rows(3),
    documents: rows(4),
    allocations: rows(5),
    expenses: rows(6),
    includePrepaid: settings ? (settings[0]?.include_prepaid ?? true) : null,
    findings: rows(8),
    decisions: rows(9),
  };
  const model = tripOverview(trip, segments, data, now, day);
  const taskActions: Record<string, ReactNode> = {};
  const findingActions: Record<string, ReactNode> = {};
  if (role !== "viewer" && model.phase === "upcoming") {
    for (const task of model.tasks?.open.slice(0, 3) || [])
      taskActions[task.id] = (
        <Toggle
          table="prep_tasks"
          trip={trip.id}
          id={task.id}
          value={task.done}
        />
      );
    for (const suggestion of model.suggestions)
      if (suggestion.findingId)
        findingActions[suggestion.key] = (
          <FindingDismiss
            tripId={trip.id}
            findingId={suggestion.findingId}
            title={suggestion.title}
          />
        );
  }
  return (
    <TripOverviewView
      model={model}
      role={role}
      LinkComponent={Link}
      taskActions={taskActions}
      findingActions={findingActions}
    />
  );
}
