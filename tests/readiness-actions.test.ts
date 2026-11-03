import { z } from "zod";
import { beforeEach, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({ access: vi.fn(), revalidate: vi.fn() }));
vi.mock("../lib/access", () => ({ access: mocks.access }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { addReviewedPacking, addReviewedPrep } from "../app/readiness-actions";
import { addBudgetDistribution } from "../app/budget-planner-actions";
import { budgetContextKey } from "../lib/budget-context";
const trip = "11111111-1111-4111-8111-111111111111",
  list = "22222222-2222-4222-8222-222222222222";
type Row = Record<string, unknown>;
let tables: Record<string, Row[]>, deny: boolean;
function db() {
  return {
    from: (table: string) => {
      let rows = [...(tables[table] || [])],
        insert: Row[] | null = null;
      const finish = () => {
        if (insert) {
          if (deny) return { error: { code: "42501" }, data: null };
          const added = insert.filter(
            (row) => !tables[table].some((old) => old.id === row.id),
          );
          tables[table].push(...added);
          return { data: added, error: null };
        }
        return { data: rows, error: null };
      };
      const query = {
        select: () => query,
        eq: (key: string, value: unknown) => {
          rows = rows.filter((row) => row[key] === value);
          return query;
        },
        upsert: (value: Row[], options: unknown) => {
          expect(options).toEqual({ onConflict: "id", ignoreDuplicates: true });
          insert = value;
          return query;
        },
        single: async () => ({
          data: rows[0] || null,
          error: rows.length ? null : { code: "PGRST116" },
        }),
        maybeSingle: async () => ({ data: rows[0] || null, error: null }),
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve(finish()).then(resolve),
      };
      return query;
    },
  };
}
function form(values: Record<string, string>) {
  const form = new FormData();
  Object.entries(values).forEach(([key, value]) => form.set(key, value));
  return form;
}
beforeEach(() => {
  vi.clearAllMocks();
  deny = false;
  tables = {
    trips: [
      {
        id: trip,
        currency: "EUR",
        budget: 1000,
        start_date: "2027-05-01",
        end_date: "2027-05-10",
      },
    ],
    packing_lists: [{ id: list, trip_id: trip }],
    packing_items: [
      {
        id: "existing",
        trip_id: trip,
        list_id: list,
        title: "Charging cable",
        packed: true,
        quantity: 3,
      },
    ],
    prep_tasks: [],
    budget_settings: [],
    budget_allocations: [],
    bookings: [],
  };
  mocks.access.mockResolvedValue({ db: db(), user: { id: "owner" } });
});
it("requires approval, scopes list ownership and adds only new unpacked items", async () => {
  const items = [
    {
      title: "Charging cable",
      category: "Electronics",
      quantity: 1,
      reason: "",
    },
    { title: "Clothing", category: "Clothing", quantity: 4, reason: "" },
  ];
  const input = form({
    trip_id: trip,
    list_id: list,
    items: JSON.stringify(items),
  });
  expect((await addReviewedPacking({}, input)).error).toBeTruthy();
  expect(tables.packing_items).toHaveLength(1);
  input.set("approved", "yes");
  expect(await addReviewedPacking({}, input)).toEqual({ added: 1, skipped: 1 });
  expect(tables.packing_items[0]).toMatchObject({ packed: true, quantity: 3 });
  expect(z.uuid().safeParse(tables.packing_items[1].id).success).toBe(true);
  expect(tables.packing_items[1]).toMatchObject({ packed: false, quantity: 4 });
  expect(await addReviewedPacking({}, input)).toEqual({ added: 0, skipped: 2 });
  input.set("list_id", "33333333-3333-4333-8333-333333333333");
  expect((await addReviewedPacking({}, input)).error).toContain("unavailable");
});
it("preserves completed tasks, uses stable IDs and reports denied writes", async () => {
  const item = {
    title: "Review documents",
    category: "Documents",
    due_date: "",
    priority: "normal",
    reason: "",
  };
  const input = form({
    trip_id: trip,
    approved: "yes",
    items: JSON.stringify([item]),
  });
  expect((await addReviewedPrep({}, input)).added).toBe(1);
  tables.prep_tasks[0].done = true;
  expect((await addReviewedPrep({}, input)).added).toBe(0);
  expect(tables.prep_tasks[0].done).toBe(true);
  deny = true;
  input.set("items", JSON.stringify([{ ...item, title: "Another task" }]));
  expect((await addReviewedPrep({}, input)).error).toBeTruthy();
  expect(tables.prep_tasks).toHaveLength(1);
});
function budgetForm() {
  const current = tables.trips[0];
  const context = budgetContextKey(
    current as never,
    true,
    tables.budget_allocations as never,
    [],
  );
  return form({
    trip_id: trip,
    plan_id: "44444444-4444-4444-8444-444444444444",
    context_key: context,
    currency: "EUR",
    approved: "yes",
    plan: JSON.stringify({
      amount: "10.01",
      categories: [{ name: "Food", weight: 100 }],
      days: [
        { day: "2027-05-01", weight: 1 },
        { day: "2027-05-02", weight: 1 },
      ],
    }),
  });
}
it("adds a reviewed budget batch once and leaves estimates/actuals unknown", async () => {
  const input = budgetForm();
  expect((await addBudgetDistribution({}, input)).added).toBe(2);
  expect(
    tables.budget_allocations.reduce(
      (sum, row) => sum + Math.round(Number(row.planned) * 100),
      0,
    ),
  ).toBe(1001);
  expect(
    tables.budget_allocations.every(
      (row) =>
        row.estimate_low === null &&
        row.estimate_high === null &&
        row.currency === "EUR",
    ),
  ).toBe(true);
  expect((await addBudgetDistribution({}, input)).added).toBe(0);
  expect(tables.budget_allocations).toHaveLength(2);
});
it("rejects stale budget context, changed currency, out-of-trip days and denied mutations", async () => {
  const input = budgetForm();
  tables.trips[0].currency = "USD";
  expect((await addBudgetDistribution({}, input)).error).toContain(
    "currency changed",
  );
  tables.trips[0].currency = "EUR";
  tables.trips[0].budget = 999;
  expect((await addBudgetDistribution({}, input)).error).toContain(
    "budget changed",
  );
  const valid = budgetForm();
  valid.set(
    "plan",
    JSON.stringify({
      amount: "10",
      categories: [{ name: "Food", weight: 100 }],
      days: [{ day: "2027-05-11", weight: 1 }],
    }),
  );
  expect((await addBudgetDistribution({}, valid)).error).toContain("within");
  deny = true;
  expect((await addBudgetDistribution({}, budgetForm())).error).toBeTruthy();
  expect(tables.budget_allocations).toHaveLength(0);
});
