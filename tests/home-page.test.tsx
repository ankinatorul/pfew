// @vitest-environment jsdom
import { afterEach, beforeEach, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
const mocks = vi.hoisted(() => ({ access: vi.fn(), order: vi.fn() }));
vi.mock("../lib/access", () => ({ access: mocks.access }));
vi.mock("../components/essentials/home", () => ({
  HomeEssentials: () => <section aria-label="Saved trip summary" />,
}));
import Home from "../app/page";

const trip = {
  id: "owned-trip",
  name: "My saved adventure",
  owner_id: "me",
  start_date: "2027-05-01",
  end_date: "2027-05-10",
  timezone: "UTC",
  travelers: 2,
  style: "Comfort",
  currency: "EUR",
  budget: 1000,
};
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2027-04-25T12:00:00Z"));
  mocks.order.mockResolvedValue({ data: [trip], error: null });
  mocks.access.mockResolvedValue({
    user: { id: "me", user_metadata: { name: "Anca Traveler" } },
    db: { from: () => ({ select: () => ({ eq: () => ({ order: mocks.order }), order: mocks.order }) }) },
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

it("uses the signed-in name and real trip fields in the reference-inspired Home", async () => {
  const { container } = render(
    await Home({ searchParams: Promise.resolve({}) }),
  );
  expect(screen.getByText(/Hello, Anca!/)).toBeTruthy();
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
    "Less oh no.More let’s go.",
  );
  expect(screen.getByText("6 days to go")).toBeTruthy();
  expect(
    screen
      .getByRole("link", { name: "Open trip: My saved adventure" })
      .getAttribute("href"),
  ).toBe("/trips/owned-trip");
  expect(
    screen.getByRole("link", { name: "Create a trip" }).getAttribute("href"),
  ).toBe("/trips/new");
  expect(container.querySelector("img")).toBeNull();
});
it("keeps an empty account useful without fictional trips or summary counts", async () => {
  mocks.order.mockResolvedValue({ data: [], error: null });
  render(await Home({ searchParams: Promise.resolve({}) }));
  expect(screen.getAllByRole("link", { name: "Create a trip" })).toHaveLength(
    1,
  );
  expect(
    screen.queryByRole("region", { name: "Saved trip summary" }),
  ).toBeNull();
  expect(screen.queryByText("Next booking")).toBeNull();
  expect(screen.queryByText("Other trips")).toBeNull();
});
it("honors accessible featured selections and ignores foreign IDs", async () => {
  const shared = {
    ...trip,
    id: "shared-trip",
    name: "Our saved adventure",
    owner_id: "other",
  };
  mocks.order.mockResolvedValue({ data: [trip, shared], error: null });
  render(await Home({ searchParams: Promise.resolve({ trip: shared.id }) }));
  expect(
    screen
      .getByRole("link", { name: "Open trip: Our saved adventure" })
      .getAttribute("href"),
  ).toBe("/trips/shared-trip");
  expect(screen.getByRole("heading", { name: "Other trips" })).toBeTruthy();
  expect(
    screen.getByRole("heading", { name: "My saved adventure" }),
  ).toBeTruthy();
  expect(
    screen.getByRole("link", { name: /View all$/ }).getAttribute("href"),
  ).toBe("/trips");
  cleanup();
  render(
    await Home({ searchParams: Promise.resolve({ trip: "foreign-trip" }) }),
  );
  expect(
    screen.getByRole("link", { name: "Open trip: My saved adventure" }),
  ).toBeTruthy();
  expect(screen.queryByText("foreign-trip")).toBeNull();
});
it("keeps the most recent saved past trip reachable when no future trip exists", async () => {
  mocks.order.mockResolvedValue({
    data: [{ ...trip, start_date: "2026-05-01", end_date: "2026-05-10" }],
    error: null,
  });
  render(await Home({ searchParams: Promise.resolve({}) }));
  expect(screen.getByText("Past trip")).toBeTruthy();
  expect(
    screen.getByRole("link", { name: "Open trip: My saved adventure" }),
  ).toBeTruthy();
});
it("never features a draft and renders partial finalized dates neutrally", async () => {
  mocks.order.mockResolvedValue({
    data: [
      { ...trip, start_date: null, end_date: "2027-05-10" },
      { ...trip, id: "private-draft", name: "Private draft", creation_state: "draft" },
    ],
    error: null,
  });
  render(await Home({ searchParams: Promise.resolve({ trip: "private-draft" }) }));
  expect(screen.queryByText("Private draft")).toBeNull();
  expect(screen.getByText("Dates not set")).toBeTruthy();
  expect(screen.getByText(/departure date not set/)).toBeTruthy();
  expect(screen.queryByText(/days to go/)).toBeNull();
});
