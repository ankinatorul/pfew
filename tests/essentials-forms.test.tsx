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
import {
  BookingForm,
  ExpenseForm,
  TaskForm,
  PackingItemForm,
} from "../components/essentials/forms";
import { saveEssential, toggleEssential } from "../app/essentials-actions";
vi.mock("../app/essentials-actions", () => ({
  saveEssential: vi.fn(async () => {}),
  deleteEssential: vi.fn(async () => {}),
  toggleEssential: vi.fn(async () => {}),
}));
vi.mock("../app/actions", () => ({
  saveTrip: vi.fn(),
  saveSegment: vi.fn(),
  deleteTrip: vi.fn(),
  deleteSegment: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});
const trip = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Escape",
  start_date: "2027-05-01",
  end_date: "2027-05-10",
  timezone: "UTC",
  travelers: 2,
  style: "Comfort",
  currency: "EUR",
  budget: 1000,
};
it("routes retired booking forms to the shared editor without a competing inline form", () => {
  render(<BookingForm trip={trip} segments={[]} />);
  expect(
    screen
      .getByRole("link", { name: "Open booking editor" })
      .getAttribute("href"),
  ).toBe(`/trips/${trip.id}?view=bookings`);
  expect(document.querySelector("form")).toBeNull();
});
it("records a cash expense in its entered currency", async () => {
  const user = userEvent.setup();
  render(<ExpenseForm trip={trip} />);
  fireEvent.change(screen.getByLabelText("Amount"), {
    target: { value: "12.50" },
  });
  await user.type(screen.getByLabelText("Category"), "Lunch");
  await user.click(screen.getByRole("button", { name: "Add item" }));
  await waitFor(() => expect(saveEssential).toHaveBeenCalledTimes(1));
  expect(vi.mocked(saveEssential).mock.calls[0][0].get("payment_method")).toBe(
    "cash",
  );
  expect(vi.mocked(saveEssential).mock.calls[0][0].get("currency")).toBe("EUR");
});
it("edits a packing item without marking it packed automatically", async () => {
  const user = userEvent.setup();
  render(
    <PackingItemForm trip={trip} list="22222222-2222-4222-8222-222222222222" />,
  );
  await user.type(screen.getByLabelText("Item"), "Socks");
  await user.click(screen.getByRole("button", { name: "Add item" }));
  await waitFor(() => expect(saveEssential).toHaveBeenCalledTimes(1));
  expect(toggleEssential).not.toHaveBeenCalled();
});
it("disables saving when offline", () => {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  render(<TaskForm trip={trip} />);
  expect(screen.getByRole("status").textContent).toContain("Connect");
  expect(
    screen.getByRole("button", { name: "Add item" }).closest("fieldset")
      ?.disabled,
  ).toBe(true);
});
