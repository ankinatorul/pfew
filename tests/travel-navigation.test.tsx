// @vitest-environment jsdom
import { afterEach, it, expect, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TripNavigation } from "../components/trip-navigation";
import { TripCollection } from "../components/trip-collection";
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("keeps the day in contextual tools and exposes Settings only to owners", () => {
  render(
    <TripNavigation
      tripId="trip"
      view="budget"
      day="2027-05-03"
      owner={false}
    />,
  );
  expect(screen.queryByRole("link", { name: "Settings" })).toBeNull();
  expect(
    screen.getByRole("link", { name: "Budget" }).getAttribute("href"),
  ).toBe("/trips/trip?view=budget&day=2027-05-03");
  expect(
    screen.getByRole("link", { name: "Budget" }).getAttribute("aria-current"),
  ).toBe("page");
  cleanup();
  render(
    <TripNavigation tripId="trip" view="settings" day="2027-05-03" owner />,
  );
  expect(screen.getByRole("link", { name: "Settings" })).toBeTruthy();
});
it("filters owned/shared and past trips locally without changing data", async () => {
  const user = userEvent.setup();
  const base = {
    end_date: "2027-05-10",
    timezone: "UTC",
    travelers: 2,
    style: "Comfort",
  };
  render(
    <TripCollection
      trips={[
        {
          ...base,
          id: "a",
          name: "My upcoming trip",
          start_date: "2027-05-01",
          shared: false,
          lifecycle: "upcoming",
        },
        {
          ...base,
          id: "b",
          name: "Shared memories",
          start_date: "2026-05-01",
          shared: true,
          lifecycle: "past",
        },
      ]}
    />,
  );
  await user.click(screen.getByText(/Search & filter trips/));
  await user.selectOptions(screen.getByLabelText("Trip access"), "shared");
  expect(screen.getByRole("status").textContent).toBe("1 of 2 trips shown.");
  expect(
    screen.queryByRole("heading", { name: "My upcoming trip" }),
  ).toBeNull();
  await user.type(screen.getByLabelText("Search trips by name"), "no match");
  expect(screen.getByText("No trips match these filters.")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Clear filters" }));
  expect(screen.getByRole("status").textContent).toBe("2 of 2 trips shown.");
});
