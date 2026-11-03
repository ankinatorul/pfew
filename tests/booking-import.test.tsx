// @vitest-environment jsdom
import { afterEach, it, expect, vi } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BookingImport } from "../components/booking-import";
import { saveReviewedBooking } from "../app/booking-import-actions";
import { importFieldNames } from "../lib/booking-import-types";
vi.mock("../app/booking-import-actions", () => ({
  saveReviewedBooking: vi.fn(async () => {}),
}));
vi.mock("../app/essentials-actions", () => ({
  saveEssential: vi.fn(),
  deleteEssential: vi.fn(),
  toggleEssential: vi.fn(),
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
  vi.unstubAllGlobals();
});
const trip = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Trip",
  start_date: "2027-05-01",
  end_date: "2027-05-10",
  timezone: "Asia/Tokyo",
  travelers: 1,
  style: "Comfort",
  currency: "EUR",
  budget: 1000,
};
const result = {
  importKey: "22222222-2222-4222-8222-222222222222",
  method: "text",
  fields: {
    ...Object.fromEntries(importFieldNames.map((key) => [key, null])),
    title: "My booked flight",
    reference: "ABC",
  },
  evidence: { reference: "Booking reference: ABC" },
  warnings: [],
};
it("previews privately, keeps unknown dates/currency empty and requires review before a shared save", async () => {
  const user = userEvent.setup(),
    fetcher = vi.fn(async () => Response.json(result));
  vi.stubGlobal("fetch", fetcher);
  render(<BookingImport trip={trip} segments={[]} live={false} />);
  expect(screen.queryByRole("option", { name: /AI-assisted/ })).toBeNull();
  await user.type(
    screen.getByLabelText("Booking confirmation text"),
    "Booking reference: ABC",
  );
  await user.click(
    screen.getByRole("button", { name: "Preview booking details" }),
  );
  await screen.findByRole("heading", { name: "Review the booking details" });
  expect(saveReviewedBooking).not.toHaveBeenCalled();
  expect((screen.getByLabelText("Start date") as HTMLInputElement).value).toBe(
    "",
  );
  expect((screen.getByLabelText("End date") as HTMLInputElement).value).toBe(
    "",
  );
  expect(
    (
      screen.getByLabelText(
        "Currency · three uppercase letters",
      ) as HTMLInputElement
    ).value,
  ).toBe("");
  expect(screen.queryByLabelText("Start time zone")).toBeNull();
  fireEvent.change(screen.getByLabelText("Start date"), {
    target: { value: "2027-05-01" },
  });
  fireEvent.change(screen.getByLabelText("End date"), {
    target: { value: "2027-05-01" },
  });
  await user.type(
    screen.getByLabelText("Currency · three uppercase letters"),
    "EUR",
  );
  await user.click(
    screen.getByRole("button", { name: "Approve and save booking" }),
  );
  expect(saveReviewedBooking).not.toHaveBeenCalled();
  await user.click(
    screen.getByRole("checkbox", { name: /I reviewed these fields/ }),
  );
  await user.click(
    screen.getByRole("button", { name: "Approve and save booking" }),
  );
  await waitFor(() => expect(saveReviewedBooking).toHaveBeenCalledOnce());
  const form = vi.mocked(saveReviewedBooking).mock.calls[0][0];
  expect(form.get("review_confirmed")).toBe("yes");
  expect(form.get("verification")).toBe("user confirmed");
  expect(form.get("import_key")).toBe(result.importKey);
  expect(form.get("price")).toBe("");
  expect(form.get("paid_amount")).toBe("");
  expect(form.get("text")).toBeNull();
});
it("allows discarding a preview without any save", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(result)),
  );
  const user = userEvent.setup();
  render(<BookingImport trip={trip} segments={[]} live={false} />);
  await user.type(
    screen.getByLabelText("Booking confirmation text"),
    "Booking reference: ABC",
  );
  await user.click(
    screen.getByRole("button", { name: "Preview booking details" }),
  );
  await screen.findByRole("button", { name: "Discard preview / start again" });
  await user.click(
    screen.getByRole("button", { name: "Discard preview / start again" }),
  );
  expect(saveReviewedBooking).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Booking confirmation text")).toBeTruthy();
});
