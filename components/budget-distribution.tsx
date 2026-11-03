"use client";
import { useState, useActionState } from "react";
import type { Trip } from "../lib/domain";
import { days, validationMessage } from "../lib/domain";
import {
  distributeBudget,
  type BudgetDistributionInput,
} from "../lib/budget-distribution";
import {
  addBudgetDistribution,
  type BudgetPlanState,
} from "../app/budget-planner-actions";
import { useOnline } from "./essentials/online";
import { Button } from "./button";
type Plan = {
  id: string;
  input: BudgetDistributionInput;
  rows: ReturnType<typeof distributeBudget>;
  contextKey: string;
  currency: string;
};
function ReviewDistribution({
  tripId,
  plan,
  available,
  onDiscard,
}: {
  tripId: string;
  plan: Plan;
  available: number | null;
  onDiscard: () => void;
}) {
  const [state, save, pending] = useActionState(
      addBudgetDistribution,
      {} as BudgetPlanState,
    ),
    online = useOnline(),
    total = plan.rows.reduce((sum, row) => sum + row.cents, 0) / 100,
    finished = state.added !== undefined;
  const byDay = [...new Set(plan.rows.map((row) => row.day))].map((day) => ({
    day,
    amount:
      plan.rows
        .filter((row) => row.day === day)
        .reduce((sum, row) => sum + row.cents, 0) / 100,
  }));
  return (
    <section className="card">
      <h3>Review your planned allocation.</h3>
      <p>
        {plan.currency} {total.toFixed(2)} across {byDay.length} days and{" "}
        {plan.rows.length} allocations.
      </p>
      <p className="muted">
        This distributes an amount you chose using editable category and day
        weights. It is not a local price estimate. Existing allocations and
        manually recorded spending are kept separate.
      </p>
      {!finished && available !== null && total > available && (
        <p role="status" className="notice">
          This amount is above the current unallocated target of {plan.currency}{" "}
          {available.toFixed(2)}. Review the total before approving.
        </p>
      )}
      <details>
        <summary>Per-day and category amounts</summary>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Day</th>
                <th>Category</th>
                <th>Planned · {plan.currency}</th>
              </tr>
            </thead>
            <tbody>
              {plan.rows.map((row) => (
                <tr key={row.day + row.category}>
                  <td>{row.day}</td>
                  <td>{row.category}</td>
                  <td>{row.planned.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <form action={save} className="form">
        <input type="hidden" name="trip_id" value={tripId} />
        <input type="hidden" name="plan_id" value={plan.id} />
        <input type="hidden" name="context_key" value={plan.contextKey} />
        <input type="hidden" name="currency" value={plan.currency} />
        <input type="hidden" name="plan" value={JSON.stringify(plan.input)} />
        <fieldset disabled={pending || finished || !online}>
          <label>
            <input type="checkbox" name="approved" value="yes" required />I
            reviewed these amounts and want to add them as new planned
            allocations.
          </label>
          <Button disabled={pending}>
            {pending ? "Adding allocations…" : "Add reviewed allocations"}
          </Button>
        </fieldset>
        {state.error && (
          <p role="alert" className="error">
            {state.error}
          </p>
        )}
        {finished && (
          <p role="status">
            {state.added} allocations added. {state.skipped || 0} rows from this
            plan already existed.
          </p>
        )}
        {!online && (
          <p role="status">
            Reconnect to add allocations. Offline copies are read-only.
          </p>
        )}
      </form>
      <Button variant="secondary" disabled={pending} onClick={onDiscard}>
        {finished ? "Close planner" : "Discard preview"}
      </Button>
    </section>
  );
}
export function BudgetDistribution({
  trip,
  available,
  contextKey,
}: {
  trip: Trip;
  available: number | null;
  contextKey: string;
}) {
  const [amount, setAmount] = useState(
      available !== null && available > 0 ? available.toFixed(2) : "",
    ),
    [categories, setCategories] = useState([
      { name: "Food and drinks", weight: 45 },
      { name: "Local transport", weight: 20 },
      { name: "Activities", weight: 25 },
      { name: "Other", weight: 10 },
    ]),
    [dayWeights, setDayWeights] = useState(() =>
      days(trip.start_date, trip.end_date)
        .slice(0, 60)
        .map((day) => ({ day, weight: 1 })),
    ),
    [range, setRange] = useState({
      start: trip.start_date,
      end:
        days(trip.start_date, trip.end_date).slice(0, 60).at(-1) ||
        trip.start_date,
    }),
    [plan, setPlan] = useState<Plan | null>(null),
    [error, setError] = useState(""),
    online = useOnline();
  function changeRange(start: string, end: string) {
    setRange({ start, end });
    const selected = days(start, end);
    if (
      !start ||
      !end ||
      start < trip.start_date ||
      end > trip.end_date ||
      end < start ||
      selected.length > 60
    ) {
      setDayWeights([]);
      setError("Choose 1–60 days within this trip.");
      return;
    }
    setDayWeights(
      selected.map((day) => ({
        day,
        weight: dayWeights.find((item) => item.day === day)?.weight ?? 1,
      })),
    );
    setError("");
  }
  if (plan)
    return (
      <ReviewDistribution
        key={plan.id}
        tripId={trip.id}
        plan={plan}
        available={available}
        onDiscard={() => {
          setPlan(null);
          setAmount(
            available !== null && available > 0 ? available.toFixed(2) : "",
          );
        }}
      />
    );
  return (
    <details data-edit-action>
      <summary>Distribute an amount across days and categories</summary>
      <section className="card">
        <h3>Give your remaining budget a shape.</h3>
        <p>
          Start with the current unallocated target, or enter a different amount
          in {trip.currency}. These percentages are an editable planning split,
          not researched prices.
        </p>
        <form
          className="form"
          onSubmit={(event) => {
            event.preventDefault();
            try {
              if (!dayWeights.length)
                throw new Error("Choose 1–60 days within this trip.");
              const input = { amount, categories, days: dayWeights };
              const rows = distributeBudget(input);
              setPlan({
                id: crypto.randomUUID(),
                input,
                rows,
                contextKey,
                currency: trip.currency,
              });
              setError("");
            } catch (error) {
              setError(validationMessage(error));
            }
          }}
        >
          <fieldset disabled={!online}>
            <label>
              Amount to plan · {trip.currency}
              <input
                type="number"
                min="0.01"
                max="9999999999"
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                required
              />
            </label>
            <div className="two">
              <label>
                Plan from
                <input
                  type="date"
                  min={trip.start_date}
                  max={trip.end_date}
                  value={range.start}
                  onChange={(event) =>
                    changeRange(event.target.value, range.end)
                  }
                  required
                />
              </label>
              <label>
                Plan through
                <input
                  type="date"
                  min={range.start || trip.start_date}
                  max={trip.end_date}
                  value={range.end}
                  onChange={(event) =>
                    changeRange(range.start, event.target.value)
                  }
                  required
                />
              </label>
            </div>
            <fieldset>
              <legend>Category percentages · total must be 100</legend>
              {categories.map((category, index) => (
                <div className="two" key={index}>
                  <label>
                    Category name
                    <input
                      value={category.name}
                      maxLength={100}
                      required
                      onChange={(event) =>
                        setCategories(
                          categories.map((value, i) =>
                            i === index
                              ? { ...value, name: event.target.value }
                              : value,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Share · percent
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={category.weight}
                      required
                      onChange={(event) =>
                        setCategories(
                          categories.map((value, i) =>
                            i === index
                              ? { ...value, weight: Number(event.target.value) }
                              : value,
                          ),
                        )
                      }
                    />
                  </label>
                </div>
              ))}
            </fieldset>
            <details>
              <summary>Day weights · 1 is equal share, 0 skips a day</summary>
              <p className="muted">
                Increase a weight for days where you want more planned spending.
                Plan up to 60 days at a time; choose a later date range for
                another portion of a long trip.
              </p>
              {dayWeights.map((day, index) => (
                <div className="two" key={index}>
                  <label>
                    Trip day
                    <input
                      type="date"
                      value={day.day}
                      min={trip.start_date}
                      max={trip.end_date}
                      required
                      readOnly
                    />
                  </label>
                  <label>
                    Day weight
                    <input
                      type="number"
                      min="0"
                      max="20"
                      value={day.weight}
                      required
                      onChange={(event) =>
                        setDayWeights(
                          dayWeights.map((value, i) =>
                            i === index
                              ? { ...value, weight: Number(event.target.value) }
                              : value,
                          ),
                        )
                      }
                    />
                  </label>
                </div>
              ))}
            </details>
            <Button>Preview allocation plan</Button>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
          </fieldset>
          {!online && (
            <p role="status">Reconnect to prepare a new allocation plan.</p>
          )}
        </form>
      </section>
    </details>
  );
}
