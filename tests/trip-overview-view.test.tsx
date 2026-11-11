// @vitest-environment jsdom
import { afterEach, beforeEach, it, expect, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  toggle: vi.fn<(form: FormData) => Promise<void>>(async () => {}),
  decide: vi.fn<(form: FormData) => Promise<void>>(async () => {}),
}));
vi.mock("../lib/access", () => ({ access: mocks.access }));
vi.mock("../app/essentials-actions", () => ({
  toggleEssential: mocks.toggle,
  saveEssential: vi.fn(),
  deleteEssential: vi.fn(),
}));
vi.mock("../app/intelligence-actions", () => ({ decideFinding: mocks.decide }));
import { TripDashboard } from "../components/trip-overview";
import { checkTrip } from "../lib/trip-check";
import { duringNow, duringTrip, duringSegments, duringBooking } from "./fixtures/during-trip";
import { completedNow, completedTrip, completedSegments, completedData } from "./fixtures/completed-trip";
import {
  overviewTrip as trip,
  overviewNow as now,
  overviewSegment,
  overviewTask,
  overviewBooking,
} from "./fixtures/trip-overview";

let tables: Record<string, unknown[]>;
let failed: Set<string>;
let reads: [string, string, unknown][];
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  failed = new Set();
  reads = [];
  tables = {
    bookings: [overviewBooking()],
    prep_tasks: [overviewTask()],
    packing_lists: [],
    packing_items: [],
    booking_attachments: [],
    budget_allocations: [],
    expenses: [],
    budget_settings: [],
    trip_check_findings: [],
    finding_decisions: [],
  };
  mocks.access.mockResolvedValue({
    user: { id: "current-uploader" },
    db: {
      from: (table: string) => {
        const query = {
          select: (fields: string) => {
            reads.push([table, "select", fields]);
            return query;
          },
          eq: (key: string, value: unknown) => {
            reads.push([table, key, value]);
            return query;
          },
          then: (resolve: (value: unknown) => unknown) =>
            Promise.resolve({
              data: tables[table] || [],
              error: failed.has(table) ? { code: "FAILED_READ" } : null,
            }).then(resolve),
        };
        return query;
      },
    },
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it("shows saved incomplete tasks first and delegates completion to the existing action only after a click", async () => {
  const user = userEvent.setup();
  render(
    await TripDashboard({
      trip,
      segments: [overviewSegment()],
      role: "editor",
      day: "2027-05-03",
    }),
  );
  expect(
    screen.getByRole("heading", { name: "What’s left to do" }),
  ).toBeTruthy();
  expect(screen.getByText("Saved task")).toBeTruthy();
  expect(mocks.toggle).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Mark done" }));
  await waitFor(() => expect(mocks.toggle).toHaveBeenCalledOnce());
  const form = mocks.toggle.mock.calls[0][0] as FormData;
  expect(form.get("trip_id")).toBe(trip.id);
  expect(form.get("id")).toBe(overviewTask().id);
  expect(form.get("table")).toBe("prep_tasks");
  expect(form.get("value")).toBe("true");
  const modules = screen.getByRole("region", { name: "Trip modules" });
  expect(within(modules).getAllByRole("link")).toHaveLength(5);
  expect(
    within(modules)
      .getByRole("link", { name: /^Itinerary/ })
      .getAttribute("href"),
  ).toBe(`/trips/${trip.id}?view=itinerary&day=2027-05-03`);
});
it("keeps uploader-private documents scoped and does not retrieve filenames or paths", async () => {
  tables.booking_attachments = [{ state: "ready" }, { state: "pending" }];
  render(await TripDashboard({ trip, segments: [], role: "owner" }));
  expect(reads).toContainEqual(["booking_attachments", "select", "state"]);
  expect(reads).toContainEqual([
    "booking_attachments",
    "owner_id",
    "current-uploader",
  ]);
  expect(
    reads
      .filter((read) => read[1] === "trip_id")
      .every((read) => read[2] === trip.id),
  ).toBe(true);
  expect(screen.getByText("1 private file")).toBeTruthy();
  expect(screen.getByText("1 incomplete upload")).toBeTruthy();
});
it("persists dismissal only for a previously saved Trip Check finding using the existing action", async () => {
  tables.bookings = [];
  const finding = checkTrip(trip, [], [], [overviewTask()]).find(
    (item) => item.kind === "stay_gap",
  )!;
  tables.trip_check_findings = [
    {
      id: "55555555-5555-4555-8555-555555555555",
      fingerprint: finding.fingerprint,
    },
  ];
  const user = userEvent.setup();
  render(await TripDashboard({ trip, segments: [], role: "owner" }));
  expect(mocks.decide).not.toHaveBeenCalled();
  const dismiss = screen.getByRole("button", {
    name: "Dismiss suggestion: Check your accommodation details",
  });
  await user.click(dismiss);
  await waitFor(() => expect(mocks.decide).toHaveBeenCalledOnce());
  const form = mocks.decide.mock.calls[0][0] as FormData;
  expect(form.get("trip_id")).toBe(trip.id);
  expect(form.get("finding_id")).toBe("55555555-5555-4555-8555-555555555555");
  expect(form.get("decision")).toBe("dismissed");
  expect(
    screen.queryByRole("button", {
      name: "Dismiss suggestion: Build a packing checklist",
    }),
  ).toBeNull();
});
it("does not mount editing or dismissal controls for viewers and retains read-only section access", async () => {
  render(await TripDashboard({ trip, segments: [], role: "viewer" }));
  expect(screen.getByRole("status").textContent).toContain("view-only");
  expect(screen.queryByRole("button", { name: "Mark done" })).toBeNull();
  expect(
    screen.queryByRole("button", { name: /^Dismiss suggestion/ }),
  ).toBeNull();
  expect(
    within(screen.getByRole("region", { name: "Trip modules" })).getAllByRole(
      "link",
    ),
  ).toHaveLength(5);
  expect(screen.queryByRole("link", { name: "Edit trip" })).toBeNull();
  expect(screen.queryByRole("button", { name: /Trip actions/ })).toBeNull();
  for (const name of ["Map", "Trip Check", "Research", "People", "Offline"])
    expect(screen.getAllByRole("link", { name: new RegExp(name) }).length).toBeGreaterThan(0);
});
it("offers an owner-only edit link beside the title with day context and exactly six header pills", async () => {
  render(await TripDashboard({ trip, segments: [], role: "owner", day: "2027-05-03" }));
  expect(screen.getByRole("link", { name: "Edit trip" }).getAttribute("href"))
    .toBe(`/trips/${trip.id}?view=settings&day=2027-05-03`);
  expect(screen.queryByRole("button", { name: /Trip actions/ })).toBeNull();
  expect(screen.queryByRole("menu")).toBeNull();
  const nav = screen.getByRole("navigation", { name: "Trip overview sections" });
  expect(within(nav).getAllByRole("link").map(link => link.textContent)).toEqual([
    "Overview", "Bookings", "Itinerary", "Packing", "Documents", "Budget"
  ]);
});
it("does not offer owner-only trip editing to an editor", async () => {
  render(await TripDashboard({ trip, segments: [], role: "editor" }));
  expect(screen.queryByRole("link", { name: "Edit trip" })).toBeNull();
  expect(screen.queryByRole("button", { name: /Trip actions/ })).toBeNull();
});
it("uses unavailable states for failed reads instead of zero counts or inferred missing reservations", async () => {
  failed.add("bookings");
  failed.add("booking_attachments");
  render(await TripDashboard({ trip, segments: [], role: "owner" }));
  const modules = screen.getByRole("region", { name: "Trip modules" });
  expect(
    within(modules).getByRole("link", { name: /^Bookings/ }).textContent,
  ).toContain("Summary unavailable");
  expect(
    within(modules).getByRole("link", { name: /^Documents/ }).textContent,
  ).toContain("Summary unavailable");
  expect(screen.queryByText("Check your accommodation details")).toBeNull();
});
it("renders unknown dates safely without fabricated statistics", async () => {
  const { container } = render(
    await TripDashboard({
      trip: { ...trip, start_date: "", end_date: "", travelers: 0 },
      segments: [],
      role: "owner",
    }),
  );
  expect(screen.getAllByText("Travel dates not saved").length).toBeGreaterThan(
    0,
  );
  expect(screen.queryByText(/days to go/)).toBeNull();
  expect(container.textContent).not.toMatch(/NaN|Invalid Date/);
  expect(screen.getByText("Not specified")).toBeTruthy();
});
it("puts today's plan and optional inspiration before shared module cards without mounting preparation mutations", async () => {
  vi.setSystemTime(duringNow);
  tables.bookings = [duringBooking()];
  render(await TripDashboard({ trip: duringTrip, segments: duringSegments, role: "owner" }));
  expect(screen.getByRole("heading", { name: "Today’s plan" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "A little inspiration for today" })).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "What’s left to do" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Mark done" })).toBeNull();
  expect(screen.getByText("Planned activity")).toBeTruthy();
  expect(screen.getByText("Booking · status unknown")).toBeTruthy();
  expect(screen.getByRole("link", { name: "My saved afternoon booking" }).getAttribute("href")).toBe(`/trips/${trip.id}?view=bookings&day=2027-05-03&edit=${duringBooking().id}`);
  expect(screen.getByRole("link", { name: "View full itinerary" }).getAttribute("href")).toBe(`/trips/${trip.id}?view=itinerary&day=2027-05-03`);
  expect(screen.getByRole("link", { name: "Edit trip" })).toBeTruthy();
  expect(mocks.toggle).not.toHaveBeenCalled();
  expect(mocks.decide).not.toHaveBeenCalled();
  expect(reads.filter(read => read[1] === "trip_id").every(read => read[2] === trip.id)).toBe(true);
  expect(reads).toContainEqual(["booking_attachments", "owner_id", "current-uploader"]);
});
it("keeps empty traveling days honest and viewers limited to read-only actions", async () => {
  vi.setSystemTime(duringNow);
  tables.bookings = [];
  render(await TripDashboard({ trip: duringTrip, segments: [], role: "viewer" }));
  expect(screen.getByText("Nothing planned for today. Your day is yours.")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Open Research" })).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Add an activity" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Edit trip" })).toBeNull();
  expect(screen.queryByRole("button", { name: /^Dismiss|Mark done/ })).toBeNull();
});
it("does not present a failed booking read as a completely free day", async () => {
  vi.setSystemTime(duringNow);
  failed.add("bookings");
  render(await TripDashboard({ trip: duringTrip, segments: [], role: "owner" }));
  expect(screen.queryByText("Nothing planned for today. Your day is yours.")).toBeNull();
  expect(screen.getByText(/Bookings could not be loaded/)).toBeTruthy();
});
it("uses the existing scoped loader for the recap and historical cards with no preparation controls", async () => {
  vi.setSystemTime(completedNow);
  const data = completedData();
  tables.bookings = data.bookings!;
  tables.budget_allocations = data.allocations!;
  tables.expenses = data.expenses!;
  render(await TripDashboard({ trip: completedTrip, segments: completedSegments, role: "owner", day: "2027-05-03" }));
  expect(screen.getByRole("heading", { name: "Another adventure in the books." })).toBeTruthy();
  expect(screen.getByText("Completed trip")).toBeTruthy();
  for (const name of ["What’s left to do", "Today’s plan", "A little inspiration for today"]) expect(screen.queryByRole("heading", { name })).toBeNull();
  expect(screen.queryByText(/days to go|Traveling now|Review preparation/)).toBeNull();
  expect(screen.queryByRole("button", { name: /Mark done|Dismiss suggestion|Trip actions/ })).toBeNull();
  const cards = within(screen.getByRole("region", { name: "Trip modules" })).getAllByRole("link");
  expect(cards.map(link => link.querySelector("h3")?.textContent)).toEqual(["Itinerary", "Bookings", "Documents", "Budget", "Packing"]);
  expect(cards[1].textContent).toContain("0 user-confirmed");
  expect(cards[3].textContent).toContain("Target EUR");
  expect(cards[3].textContent).toContain("Planned EUR");
  expect(cards[3].textContent).toContain("Recorded: EUR 75.00");
  expect(screen.getByRole("link", { name: "Edit trip" }).getAttribute("href")).toBe(`/trips/${trip.id}?view=settings&day=2027-05-03`);
  expect(screen.getByRole("link", { name: "View itinerary" }).getAttribute("href")).toBe(`/trips/${trip.id}?view=itinerary&day=2027-05-03`);
  expect(reads.filter(read => read[1] === "trip_id").every(read => read[2] === trip.id)).toBe(true);
  expect(reads).toContainEqual(["booking_attachments", "owner_id", "current-uploader"]);
  expect(mocks.toggle).not.toHaveBeenCalled();
  expect(mocks.decide).not.toHaveBeenCalled();
});
it.each(["editor", "viewer"] as const)("keeps completed-trip summaries accessible to %s without gaining owner settings", async role => {
  vi.setSystemTime(completedNow);
  tables.bookings = [];
  tables.prep_tasks = [];
  render(await TripDashboard({ trip: completedTrip, segments: [], role }));
  expect(screen.getByText("No itinerary entries saved")).toBeTruthy();
  expect(screen.getByText("No bookings saved")).toBeTruthy();
  expect(screen.getByText("No private uploads")).toBeTruthy();
  expect(screen.getByText("No budget records saved")).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Edit trip" })).toBeNull();
  expect(screen.queryByRole("button", { name: /Mark done|Delete|Dismiss/ })).toBeNull();
  expect(within(screen.getByRole("region", { name: "Trip modules" })).getAllByRole("link")).toHaveLength(5);
});
