// @vitest-environment jsdom
import { afterEach, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  finalize: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  remember: vi.fn(),
  clear: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));
vi.mock("../app/trip-review-actions", () => ({
  saveTripReview: mocks.save,
  finalizeTripDraft: mocks.finalize,
}));
vi.mock("../lib/active-trip-store", () => ({
  rememberActiveTrip: mocks.remember,
}));
vi.mock("../lib/trip-draft-cache", async (original) => ({
  ...(await original<typeof import("../lib/trip-draft-cache")>()),
  clearLocalBasics: mocks.clear,
}));
import { TripReviewClient } from "../components/trip-review-client";
import { overviewTrip } from "./fixtures/trip-overview";
import { geographicLocation } from "../lib/geographic-location";
const props = {
  userId: "owner",
  trip: { ...overviewTrip, theme: "Default" },
  basics: {
    name: "Paris weekend",
    start_date: overviewTrip.start_date,
    end_date: overviewTrip.end_date,
    destinations: [geographicLocation("Paris", "France", 48.85, 2.35, "FR")],
  },
  revision: 1,
  entries: [],
  ready: true,
};
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it("prevents repeated finalization requests and waits for Open my trip before activating or navigating", async () => {
  let finish!: (value: unknown) => void;
  mocks.finalize.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(<TripReviewClient {...props} />);
  const button = screen.getByRole("button", {
    name: "Create my trip",
  });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(mocks.finalize).toHaveBeenCalledOnce();
  expect(mocks.push).not.toHaveBeenCalled();
  expect(mocks.remember).not.toHaveBeenCalled();
  finish({
    id: overviewTrip.id,
    revision: 2,
    style: "Balanced",
    theme: "City Break",
    finalized: true,
  });
  await waitFor(() =>
    expect(
      screen.getByRole("heading", { name: "Your adventure starts here!" }),
    ).toBeTruthy(),
  );
  expect(mocks.push).not.toHaveBeenCalled();
  expect(mocks.clear).toHaveBeenCalledWith("owner", overviewTrip.id);
  fireEvent.click(
    screen.getByRole("button", { name: "Open my trip" }),
  );
  expect(mocks.remember).toHaveBeenCalledWith("owner", overviewTrip.id);
  expect(mocks.push).toHaveBeenCalledWith(
    "/trips/" + overviewTrip.id + "?view=hub",
  );
  expect(mocks.refresh).toHaveBeenCalled();
});
it("recovers an already-confirmed success without another mutation and clears only its own local draft cache", () => {
  render(
    <TripReviewClient
      {...props}
      finalized
      trip={{ ...props.trip, creation_state: "finalized", theme: "City Break" }}
    />,
  );
  expect(
    screen.getByRole("heading", { name: "Your adventure starts here!" }),
  ).toBeTruthy();
  expect(mocks.clear).toHaveBeenCalledWith("owner", overviewTrip.id);
  expect(mocks.finalize).not.toHaveBeenCalled();
  expect(mocks.remember).not.toHaveBeenCalled();
});
