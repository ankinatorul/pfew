// @vitest-environment jsdom
import { afterEach, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const mocks = vi.hoisted(() => ({
  save: vi.fn<(form: FormData) => Promise<void>>(async () => {}),
  remove: vi.fn<(form: FormData) => Promise<{ error: string } | undefined>>(
    async () => undefined,
  ),
}));
vi.mock("../app/actions", () => ({
  saveTrip: mocks.save,
  deleteTrip: mocks.remove,
  saveSegment: vi.fn(),
  deleteSegment: vi.fn(),
}));
import { TripEdit } from "../components/trip-edit";
import { overviewTrip as trip } from "./fixtures/trip-overview";
import { tripDeletionDescription } from "../lib/trip-deletion";
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

it("uses the existing validated trip form, saved values, route and update action", async () => {
  const user = userEvent.setup();
  render(<TripEdit trip={trip} day="2027-05-03" />);
  expect(
    screen.getByRole("link", { name: "Back to trip" }).getAttribute("href"),
  ).toBe(`/trips/${trip.id}?view=hub&day=2027-05-03`);
  expect(
    (screen.getByLabelText("Trip name · optional") as HTMLInputElement).value,
  ).toBe(trip.name);
  fireEvent.change(screen.getByLabelText("Return"), {
    target: { value: "2027-04-01" },
  });
  await user.click(screen.getByRole("button", { name: "Continue" }));
  expect(screen.getByRole("alert").textContent).toContain("End date");
  expect(mocks.save).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Return"), {
    target: { value: trip.end_date },
  });
  fireEvent.change(screen.getByLabelText("Trip name · optional"), {
    target: { value: "Edited fixture trip" },
  });
  await user.click(screen.getByRole("button", { name: "Continue" }));
  expect(
    screen.getByRole("link", { name: "Destinations" }).getAttribute("href"),
  ).toBe(`/trips/${trip.id}?view=destinations`);
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Travel style" }),
    "Luxury",
  );
  expect(
    screen.getByRole("option", { name: "Premium" }),
  ).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
  const data = mocks.save.mock.calls[0][0];
  expect(data.get("id")).toBe(trip.id);
  expect(data.get("name")).toBe("Edited fixture trip");
  expect(data.get("timezone")).toBe(trip.timezone);
  expect(data.get("travelers")).toBe(String(trip.travelers));
  expect(data.get("style")).toBe("Luxury");
  expect(data.get("budget")).toBe(String(trip.budget));
  expect(mocks.remove).not.toHaveBeenCalled();
});
it("separates deletion from saving and leaves the trip unchanged on cancellation", async () => {
  const user = userEvent.setup();
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  render(<TripEdit trip={trip} />);
  const danger = screen.getByRole("region", { name: "Delete trip" });
  expect(within(danger).getByText(tripDeletionDescription)).toBeTruthy();
  await user.click(within(danger).getByRole("button", { name: "Delete trip" }));
  expect(confirm).toHaveBeenCalledWith(
    "Delete trip?\n\n" + tripDeletionDescription,
  );
  expect(screen.getByRole("status").textContent).toContain("unchanged");
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(mocks.save).not.toHaveBeenCalled();
});
it("submits only the confirmed fixture id, prevents repeated deletion while pending and reports failure inline", async () => {
  const user = userEvent.setup();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  let finish!: (state: { error: string }) => void;
  mocks.remove.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(<TripEdit trip={trip} />);
  await user.click(screen.getByRole("button", { name: "Delete trip" }));
  await waitFor(() => expect(mocks.remove).toHaveBeenCalledOnce());
  expect(mocks.remove.mock.calls[0][0].get("id")).toBe(trip.id);
  expect(
    (screen.getByRole("button", { name: "Deleting…" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  finish({
    error: "Other travelers have private documents. Your trip is still saved.",
  });
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain("still saved"),
  );
  expect(screen.getByRole("button", { name: "Delete trip" })).toBeTruthy();
  expect(
    (screen.getByLabelText("Trip name · optional") as HTMLInputElement).value,
  ).toBe(trip.name);
});
it("shows uncertain network failures without falsely claiming deletion succeeded", async () => {
  const user = userEvent.setup();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  mocks.remove.mockRejectedValueOnce(new Error("Network lost"));
  render(<TripEdit trip={trip} />);
  await user.click(screen.getByRole("button", { name: "Delete trip" }));
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain(
      "couldn’t confirm deletion",
    ),
  );
  expect(screen.getByRole("heading", { name: "Edit trip" })).toBeTruthy();
});
