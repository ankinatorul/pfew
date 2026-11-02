// @vitest-environment jsdom
import { afterEach, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TripForm, SegmentForm, Delete } from "../components/forms";
import { saveTrip, saveSegment, deleteTrip } from "../app/actions";
vi.mock("../app/actions", () => ({
  saveTrip: vi.fn(async () => {}),
  saveSegment: vi.fn(async () => {}),
  deleteTrip: vi.fn(async () => {}),
  deleteSegment: vi.fn(async () => {}),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});
function essentials() {
  fireEvent.change(screen.getByLabelText("Departure"), {
    target: { value: "2027-05-01" },
  });
  fireEvent.change(screen.getByLabelText("Return"), {
    target: { value: "2027-05-10" },
  });
  fireEvent.change(screen.getByLabelText("Trip time zone"), {
    target: { value: "Asia/Tokyo" },
  });
}
it("creates a trip with two destinations and preserves optional defaults", async () => {
  const user = userEvent.setup();
  render(<TripForm />);
  essentials();
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await user.click(screen.getByRole("button", { name: /Add destination/ }));
  fireEvent.change(screen.getByLabelText("Destination name"), {
    target: { value: "Tokyo" },
  });
  await user.click(screen.getByRole("button", { name: /Add destination/ }));
  fireEvent.change(screen.getAllByLabelText("Destination name")[1], {
    target: { value: "Kyoto" },
  });
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await user.click(screen.getByRole("button", { name: "Create my trip" }));
  await waitFor(() => expect(saveTrip).toHaveBeenCalledTimes(1));
  const payload = vi.mocked(saveTrip).mock.calls[0][0];
  expect(payload.getAll("destination_name")).toEqual(["Tokyo", "Kyoto"]);
  expect(payload.getAll("destination_timezone")).toEqual([
    "Asia/Tokyo",
    "Asia/Tokyo",
  ]);
  expect(payload.get("style")).toBe("Comfort");
});
it("keeps invalid dates in the form for correction", async () => {
  const user = userEvent.setup();
  render(<TripForm />);
  essentials();
  fireEvent.change(screen.getByLabelText("Return"), {
    target: { value: "2027-04-01" },
  });
  await user.click(screen.getByRole("button", { name: "Continue" }));
  expect(screen.getByRole("alert").textContent).toContain("End date");
  expect((screen.getByLabelText("Departure") as HTMLInputElement).value).toBe(
    "2027-05-01",
  );
  expect(saveTrip).not.toHaveBeenCalled();
});
it("allows skipping destinations without inventing reservations", async () => {
  const user = userEvent.setup();
  render(<TripForm />);
  essentials();
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await user.click(screen.getByRole("button", { name: "Skip destinations" }));
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await user.click(screen.getByRole("button", { name: "Create my trip" }));
  await waitFor(() => expect(saveTrip).toHaveBeenCalledTimes(1));
  expect(
    vi.mocked(saveTrip).mock.calls[0][0].getAll("destination_name"),
  ).toEqual([]);
});
it("preserves a segment while rejecting an invalid time zone", async () => {
  const user = userEvent.setup();
  render(
    <SegmentForm
      trip={{
        id: "11111111-1111-4111-8111-111111111111",
        name: "Trip",
        start_date: "2027-05-01",
        end_date: "2027-05-10",
        timezone: "UTC",
        travelers: 1,
        style: "Comfort",
        currency: "EUR",
        budget: null,
      }}
    />,
  );
  await user.type(screen.getByLabelText("Name"), "Lunch with friends");
  fireEvent.change(screen.getByLabelText("Time zone"), {
    target: { value: "Wrong/Zone" },
  });
  await user.click(screen.getByRole("button", { name: "Add to trip" }));
  expect(screen.getByRole("alert")).toBeTruthy();
  expect(saveSegment).not.toHaveBeenCalled();
  expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe(
    "Lunch with friends",
  );
});
it("requires confirmation before deletion", async () => {
  const user = userEvent.setup();
  vi.spyOn(window, "confirm").mockReturnValue(false);
  render(<Delete id="11111111-1111-4111-8111-111111111111" />);
  await user.click(screen.getByRole("button", { name: "Delete trip" }));
  expect(deleteTrip).not.toHaveBeenCalled();
});
