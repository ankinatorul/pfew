// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { JourneyOverviewView } from "../components/pfew/journey-view";
import { buildJourney } from "../lib/journey";
import { journeyTrip, journeySegments } from "./journey-fixtures";
afterEach(cleanup);
it("renders a travel story with readable dates and viewer-safe links, without exposing record fields or actions", () => {
  render(
    <JourneyOverviewView
      trip={journeyTrip}
      journey={buildJourney(journeyTrip, journeySegments, [])}
      insight={{ checkedAt: null, visibleCount: 0, title: null }}
      canEdit={false}
    />,
  );
  expect(screen.getByRole("heading", { name: "Tokyo" })).toBeTruthy();
  expect(screen.getByText("12–16 Sept 2027")).toBeTruthy();
  expect(screen.getAllByText("4 nights")).toHaveLength(2);
  expect(screen.queryByRole("button", { name: /Options for/ })).toBeNull();
  expect(screen.queryByText("Make room for another place")).toBeNull();
  expect(document.body.textContent).not.toContain("2027-09-12");
  expect(
    screen
      .getByRole("link", { name: "Review Tokyo to Kyoto" })
      .getAttribute("href"),
  ).toContain("view=transport");
  expect(screen.getByRole("link", { name: "Open Trip Check" })).toBeTruthy();
  expect(screen.queryByText(/No open findings/)).toBeNull();
});
it("shows deliberate empty and missing-connection states instead of fabricated itinerary content", () => {
  const view = render(
    <JourneyOverviewView
      trip={journeyTrip}
      journey={buildJourney(journeyTrip, [], [])}
      insight={{ checkedAt: null, visibleCount: 0, title: null }}
      canEdit
    />,
  );
  expect(
    screen.getByRole("link", { name: "Add your first destination" }),
  ).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "Tokyo" })).toBeNull();
  view.rerender(
    <JourneyOverviewView
      trip={journeyTrip}
      journey={buildJourney(journeyTrip, journeySegments.slice(0, 2), [])}
      insight={{ checkedAt: null, visibleCount: 0, title: null }}
      canEdit
    />,
  );
  expect(screen.getByText(/No connecting journey saved/)).toBeTruthy();
  expect(screen.getByRole("link", { name: "Add travel" })).toBeTruthy();
});
