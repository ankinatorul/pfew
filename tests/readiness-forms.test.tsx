// @vitest-environment jsdom
import { afterEach, it, expect, vi } from "vitest";
import {
  render,
  screen,
  cleanup,
  waitFor,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  PackingSuggestions,
  PrepSuggestions,
} from "../components/readiness-suggestions";
import { BudgetDistribution } from "../components/budget-distribution";
import { addReviewedPacking, addReviewedPrep } from "../app/readiness-actions";
import { addBudgetDistribution } from "../app/budget-planner-actions";
vi.mock("../app/readiness-actions", () => ({
  addReviewedPacking: vi.fn(async () => ({ added: 1, skipped: 0 })),
  addReviewedPrep: vi.fn(async () => ({ added: 1, skipped: 0 })),
}));
vi.mock("../app/budget-planner-actions", () => ({
  addBudgetDistribution: vi.fn(async () => ({ added: 8, skipped: 0 })),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const trip = {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Trip",
    start_date: "2027-05-01",
    end_date: "2027-05-02",
    timezone: "Asia/Tokyo",
    travelers: 2,
    style: "Comfort",
    currency: "EUR",
    budget: 1000,
  },
  context = {
    days: 2,
    destinations: ["Tokyo"],
    transportModes: ["flight"],
    hasBookings: true,
  };
it("previews checklist items without a paid call and requires approval before additions", async () => {
  const user = userEvent.setup(),
    fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  render(
    <PackingSuggestions
      tripId={trip.id}
      listId="22222222-2222-4222-8222-222222222222"
      existing={[]}
      context={context}
      live={false}
    />,
  );
  await user.click(screen.getByText("Build a reviewed packing checklist"));
  await user.click(
    screen.getByRole("button", { name: "Preview packing suggestions" }),
  );
  await screen.findByRole("button", { name: "Add reviewed packing items" });
  expect(addReviewedPacking).not.toHaveBeenCalled();
  expect(fetcher).not.toHaveBeenCalled();
  await user.click(
    screen.getByRole("button", { name: "Add reviewed packing items" }),
  );
  expect(addReviewedPacking).not.toHaveBeenCalled();
  await user.click(screen.getByRole("checkbox", { name: /I reviewed these/ }));
  await user.click(
    screen.getByRole("button", { name: "Add reviewed packing items" }),
  );
  await waitFor(() => expect(addReviewedPacking).toHaveBeenCalledOnce());
  expect(
    JSON.parse(
      String(vi.mocked(addReviewedPacking).mock.calls[0][1].get("items")),
    ).some((item: { title: string }) => item.title === "Charging cable"),
  ).toBe(true);
});
it("leaves proposed Prep deadlines blank and supports discarding without writes", async () => {
  const user = userEvent.setup();
  render(<PrepSuggestions tripId={trip.id} existing={[]} context={context} />);
  await user.click(screen.getByText("Review suggested preparation tasks"));
  await user.click(
    screen.getByRole("button", { name: "Preview Prep suggestions" }),
  );
  expect(
    screen
      .getAllByLabelText("Due date · optional")
      .every((input) => (input as HTMLInputElement).value === ""),
  ).toBe(true);
  await user.click(screen.getByRole("button", { name: "Discard suggestions" }));
  expect(addReviewedPrep).not.toHaveBeenCalled();
});
it("previews exact budget totals, warns above the target, and requires approval", async () => {
  const user = userEvent.setup();
  render(
    <BudgetDistribution
      trip={trip}
      available={100}
      contextKey={"a".repeat(64)}
    />,
  );
  await user.click(
    screen.getByText("Distribute an amount across days and categories"),
  );
  fireEvent.change(screen.getByLabelText("Amount to plan · EUR"), {
    target: { value: "100.01" },
  });
  await user.click(
    screen.getByRole("button", { name: "Preview allocation plan" }),
  );
  expect(screen.getByText(/EUR 100.01 across 2 days/)).toBeTruthy();
  expect(screen.getByRole("status").textContent).toContain("above");
  expect(addBudgetDistribution).not.toHaveBeenCalled();
  await user.click(
    screen.getByRole("checkbox", { name: /I reviewed these amounts/ }),
  );
  await user.click(
    screen.getByRole("button", { name: "Add reviewed allocations" }),
  );
  await waitFor(() => expect(addBudgetDistribution).toHaveBeenCalledOnce());
  const form = vi.mocked(addBudgetDistribution).mock.calls[0][1];
  expect(form.get("currency")).toBe("EUR");
  expect(JSON.parse(String(form.get("plan"))).amount).toBe("100.01");
});
it("blocks offline additions without creating a mutation queue", async () => {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  render(
    <PackingSuggestions
      tripId={trip.id}
      listId="22222222-2222-4222-8222-222222222222"
      existing={[]}
      context={context}
      live={false}
    />,
  );
  await userEvent
    .setup()
    .click(screen.getByText("Build a reviewed packing checklist"));
  expect(screen.getByRole("status").textContent).toContain("Reconnect");
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Preview packing suggestions" }));
  expect(addReviewedPacking).not.toHaveBeenCalled();
});

it("shows a negative unallocated amount accurately in the approval warning", async () => {
  const user = userEvent.setup();
  render(
    <BudgetDistribution
      trip={trip}
      available={-12.34}
      contextKey={"a".repeat(64)}
    />,
  );
  await user.click(
    screen.getByText("Distribute an amount across days and categories"),
  );
  fireEvent.change(screen.getByLabelText("Amount to plan · EUR"), {
    target: { value: "10" },
  });
  await user.click(
    screen.getByRole("button", { name: "Preview allocation plan" }),
  );
  expect(screen.getByRole("status").textContent).toContain("-12.34");
});
