import type { Allocation } from "../lib/essentials";
export function BudgetBreakdown({
  currency,
  allocations,
}: {
  currency: string;
  allocations: Allocation[];
}) {
  const matching = allocations.filter((item) => item.currency === currency),
    categories = [...new Set(matching.map((item) => item.category))].map(
      (category) => ({
        category,
        cents: matching
          .filter((item) => item.category === category)
          .reduce(
            (sum, item) => sum + Math.round(Number(item.planned) * 100),
            0,
          ),
      }),
    ),
    total = categories.reduce((sum, item) => sum + item.cents, 0);
  if (!total) return null;
  return (
    <section className="card">
      <h3>Your planned remaining costs by category</h3>
      <p className="muted">
        Planned allocations in {currency}; prepaid amounts and recorded expenses
        are shown separately above.
      </p>
      {categories.map((item) => (
        <div className="budget-category" key={item.category}>
          <div className="row">
            <span>{item.category}</span>
            <strong>
              {currency} {(item.cents / 100).toFixed(2)}
            </strong>
          </div>
          <progress
            aria-label={"Planned share for " + item.category}
            value={item.cents}
            max={total}
          />
        </div>
      ))}
    </section>
  );
}
