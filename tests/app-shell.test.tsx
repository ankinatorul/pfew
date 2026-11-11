// @vitest-environment jsdom
import { afterEach, beforeEach, it, expect, vi } from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const mocks = vi.hoisted(() => ({
  pathname: "/trips/owned",
  query: "view=bookings&day=2027-05-03",
  push: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useSearchParams: () => new URLSearchParams(mocks.query),
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}));
vi.mock("../components/account-menu", () => ({
  AccountMenu: () => <button>Account menu</button>,
}));
import { AppShell } from "../components/app-shell";
import { readActiveTrip, rememberActiveTrip } from "../lib/active-trip-store";
import type { TripCard } from "../lib/trip-collection";
const owned: TripCard = {
  id: "owned",
  name: "My trip",
  start_date: "2027-05-01",
  end_date: "2027-05-10",
  timezone: "UTC",
  travelers: 1,
  style: "Comfort",
  shared: false,
  lifecycle: "upcoming",
};
const shared = { ...owned, id: "shared", name: "Our trip", shared: true };
const props = {
  userId: "user-one",
  profile: { name: "Traveler", email: null, avatarUrl: null, initials: "T" },
  trips: [owned, shared],
  unavailable: false,
  fallbackId: owned.id,
};
const shell = (overrides: Partial<typeof props> = {}) => (
  <AppShell {...props} {...overrides}>
    <h1>Existing page content</h1>
  </AppShell>
);
beforeEach(() => {
  localStorage.clear();
  mocks.pathname = "/trips/owned";
  mocks.query = "view=bookings&day=2027-05-03";
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("shows the approved sidebar and switches an accessible trip without copying record edit state", async () => {
  mocks.query += "&edit=old-record";
  const user = userEvent.setup();
  render(shell());
  const sidebar = screen.getByRole("complementary", {
    name: "Travel workspace",
  });
  const nav = within(sidebar).getByRole("navigation", {
    name: "Main navigation",
  });
  expect(
    within(nav)
      .getAllByRole("link")
      .map((link) => link.textContent),
  ).toEqual([
    "Home",
    "My Trips",
    "Itinerary",
    "Bookings",
    "Packing",
    "Documents",
  ]);
  expect(
    within(nav)
      .getByRole("link", { name: "Bookings" })
      .getAttribute("aria-current"),
  ).toBe("page");
  expect(within(sidebar).queryByText("Favorites")).toBeNull();
  await user.selectOptions(
    within(sidebar).getByLabelText("Current trip"),
    "shared",
  );
  expect(mocks.push).toHaveBeenCalledWith(
    "/trips/shared?view=bookings&day=2027-05-03",
  );
  expect(readActiveTrip("user-one")).toBe("shared");
  expect(
    screen.getByRole("heading", { name: "Existing page content" }),
  ).toBeTruthy();
});
it("makes the trip selector usable with a keyboard and an explicit accessible label", async () => {
  const user = userEvent.setup();
  render(shell());
  const selector = within(screen.getByRole("complementary")).getByRole(
    "combobox",
    { name: "Current trip" },
  );
  selector.focus();
  await user.keyboard("{ArrowDown}");
  expect(document.activeElement).toBe(selector);
  expect(
    within(selector)
      .getAllByRole("option")
      .map((option) => option.textContent),
  ).toEqual(["My trip", "Our trip · Shared"]);
});
it("keeps preferences scoped to the account and ignores revoked trip IDs", () => {
  mocks.pathname = "/trips";
  mocks.query = "";
  rememberActiveTrip("another-user", "shared");
  rememberActiveTrip("user-one", "revoked-trip");
  render(shell());
  const selector = within(screen.getByRole("complementary")).getByLabelText(
    "Current trip",
  ) as HTMLSelectElement;
  expect(selector.value).toBe("owned");
  expect(screen.queryByRole("option", { name: /revoked/ })).toBeNull();
  act(() => rememberActiveTrip("user-one", "shared"));
  expect(selector.value).toBe("shared");
  expect(localStorage.getItem("pfew:active-trip:user-one")).toBe("shared");
});
it("syncs a saved Home selection through the existing Home query parameter", () => {
  mocks.pathname = "/";
  mocks.query = "";
  rememberActiveTrip("user-one", "shared");
  render(shell());
  expect(mocks.replace).toHaveBeenCalledWith("/?trip=shared", {
    scroll: false,
  });
});
it("opens More, exposes secondary tools, and returns keyboard focus on Escape", async () => {
  const user = userEvent.setup();
  render(shell());
  const mobile = screen.getByRole("navigation", { name: "Mobile navigation" });
  const summary = within(mobile).getByText("More").closest("summary")!;
  summary.focus();
  await user.click(summary);
  const details = summary.parentElement as HTMLDetailsElement;
  expect(details.open).toBe(true);
  const more = within(mobile).getByRole("navigation", {
    name: "More trip sections",
  });
  for (const name of [
    "Packing",
    "Documents",
    "Budget",
    "Prep",
    "Map",
    "Research",
    "People",
    "Offline",
  ])
    expect(
      within(more).getByRole("link", { name }).getAttribute("href"),
    ).toContain("/trips/owned?view=");
  await user.keyboard("{Escape}");
  expect(details.open).toBe(false);
  expect(document.activeElement).toBe(summary);
});
it("disables empty and unavailable trip selectors without blocking Create a Trip", () => {
  mocks.pathname = "/trips";
  mocks.query = "";
  render(shell({ trips: [], unavailable: true, fallbackId: "" }));
  const sidebar = screen.getByRole("complementary");
  expect(
    (within(sidebar).getByLabelText("Current trip") as HTMLSelectElement)
      .disabled,
  ).toBe(true);
  expect(
    within(sidebar)
      .getByRole("link", { name: /Create a Trip/ })
      .getAttribute("href"),
  ).toBe("/trips/new");
  expect(within(sidebar).queryByRole("link", { name: "Itinerary" })).toBeNull();
  expect(
    within(sidebar)
      .getByText("Itinerary")
      .parentElement?.getAttribute("aria-disabled"),
  ).toBe("true");
});
it("keeps public pages outside the authenticated sidebar even with a session", () => {
  for (const pathname of [
    "/setup",
    "/error",
    "/invites/token",
    "/login",
    "/auth/callback",
  ]) {
    mocks.pathname = pathname;
    render(shell());
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(
      screen.getByRole("navigation", { name: "Public navigation" }),
    ).toBeTruthy();
    cleanup();
  }
});
it("still navigates if browser storage is blocked", async () => {
  const setItem = vi
    .spyOn(Storage.prototype, "setItem")
    .mockImplementation(() => {
      throw new Error("Storage denied");
    });
  try {
    const user = userEvent.setup();
    render(shell());
    await user.selectOptions(
      within(screen.getByRole("complementary")).getByLabelText("Current trip"),
      "shared",
    );
    expect(mocks.push).toHaveBeenCalledWith(
      "/trips/shared?view=bookings&day=2027-05-03",
    );
  } finally {
    setItem.mockRestore();
  }
});
it("replaces a deleted active trip after the refreshed My Trips response", () => {
  rememberActiveTrip("user-one", "owned");
  rememberActiveTrip("another-user", "owned");
  mocks.pathname = "/trips";
  mocks.query = "";
  render(shell({ trips: [shared], fallbackId: "shared" }));
  expect(readActiveTrip("user-one")).toBe("shared");
  expect(readActiveTrip("another-user")).toBe("owned");
  expect((within(screen.getByRole("complementary")).getByLabelText("Current trip") as HTMLSelectElement).value).toBe("shared");
});
it("clears only the current account's selection after its last trip is deleted", () => {
  rememberActiveTrip("user-one", "owned");
  localStorage.setItem("pfew:unrelated", "keep");
  mocks.pathname = "/trips";
  mocks.query = "";
  render(shell({ trips: [], fallbackId: "" }));
  expect(readActiveTrip("user-one")).toBeNull();
  expect(localStorage.getItem("pfew:unrelated")).toBe("keep");
});
it("does not discard a saved selection when trips are temporarily unavailable", () => {
  rememberActiveTrip("user-one", "owned");
  mocks.pathname = "/trips";
  mocks.query = "";
  render(shell({ trips: [], unavailable: true, fallbackId: "" }));
  expect(readActiveTrip("user-one")).toBe("owned");
});
