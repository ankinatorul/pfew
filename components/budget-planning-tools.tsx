import Link from "next/link";
import type { Trip, Segment } from "../lib/domain";
import type { Booking, Allocation } from "../lib/essentials";
import { budgetSummary } from "../lib/essentials";
import { budgetContextKey } from "../lib/budget-context";
import { BudgetDistribution } from "./budget-distribution";
import { BudgetBreakdown } from "./budget-breakdown";
import { AllocationForm, Remove } from "./essentials/forms";
import { saveBudgetRules } from "../app/essentials-actions";
import { Submit } from "./forms";
export function BudgetPlanningTools({
  trip,
  segments,
  bookings,
  allocations,
  include,
  canEdit,
  edit,
}: {
  trip: Trip;
  segments: Segment[];
  bookings: Booking[];
  allocations: Allocation[];
  include: boolean;
  canEdit: boolean;
  edit?: string;
}) {
  const summary = budgetSummary(
    trip.currency,
    trip.budget,
    include,
    allocations,
    bookings,
    [],
  );
  return (
    <>
      <p>
        Planned allocations: {trip.currency} {summary.planned.toFixed(2)} ·
        Prepaid reference: {trip.currency} {summary.prepaid.toFixed(2)} ·
        Unallocated planning target:{" "}
        {summary.unallocated === null
          ? "Not set"
          : trip.currency + " " + summary.unallocated.toFixed(2)}
      </p>
      <BudgetBreakdown currency={trip.currency} allocations={allocations} />
      {canEdit && (
        <>
          <form action={saveBudgetRules}>
            <input type="hidden" name="trip_id" value={trip.id} />
            <label>
              <input
                type="checkbox"
                name="include_prepaid"
                defaultChecked={include}
              />{" "}
              Include noted prepaid amounts in planning target
            </label>
            <p className="money-muted">
              This affects planning only. Keep prepaid costs out of planned
              remaining allocations. It never adds booking amounts to actual
              expenses.
            </p>
            <Submit>Save planning rule</Submit>
          </form>
          <BudgetDistribution
            key={trip.currency}
            trip={trip}
            available={summary.unallocated}
            contextKey={budgetContextKey(trip, include, allocations, bookings)}
          />
        </>
      )}
      <div id="allocations">
        {allocations.map((a) => (
          <article className="money-card" key={a.id}>
            <h3>{a.category}</h3>
            <p>
              {a.day || "Whole trip"} ·{" "}
              {segments.find((s) => s.id === a.destination_id)?.title ||
                "All destinations"}
            </p>
            <p>
              Planned: {a.currency} {Number(a.planned).toFixed(2)}
            </p>
            {a.estimate_low !== null && (
              <p>
                Estimate: {a.currency} {a.estimate_low} – {a.estimate_high}
              </p>
            )}
            {a.notes && <p>{a.notes}</p>}
            {canEdit && (
              <div className="money-card-actions">
                <Link
                  href={
                    "/trips/" +
                    trip.id +
                    "?view=budget&edit=" +
                    a.id +
                    "#allocations"
                  }
                >
                  Edit allocation
                </Link>
                <Remove table="budget_allocations" trip={trip.id} id={a.id} />
              </div>
            )}
          </article>
        ))}
      </div>
      {canEdit && (
        <AllocationForm
          trip={trip}
          item={allocations.find((a) => a.id === edit)}
          destinations={segments.filter((s) => s.kind === "destination")}
        />
      )}
    </>
  );
}
