// @vitest-environment jsdom
import { afterEach, beforeAll, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { BookingEditor } from "../components/shared-booking";
import { emptyCollectionEntry } from "../lib/booking-collection";
import { overviewTrip } from "./fixtures/trip-overview";
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
afterEach(cleanup);
function mount(fields: Record<string, string> = {}) {
  const save = vi.fn();
  render(
    <BookingEditor
      entry={{
        ...emptyCollectionEntry(crypto.randomUUID()),
        fields: {
          title: "Our cottage",
          category: "accommodation",
          currency: "",
          ...fields,
        },
      }}
      trip={overviewTrip}
      title="Edit booking"
      busy={false}
      error=""
      paymentDueReady
      onClose={vi.fn()}
      returnFocus={null}
      onChange={vi.fn()}
      onSave={save}
    />,
  );
  return save;
}
it("uses exactly three selectable currencies without changing amounts and saves property payment", () => {
  const save = mount({ price: "123.45" });
  expect(screen.getByLabelText("Where are you staying?")).toBeTruthy();
  expect(
    [
      ...screen
        .getByRole("combobox", { name: "Currency" })
        .querySelectorAll("option"),
    ].map((o) => o.value),
  ).toEqual(["EUR", "USD", "RON"]);
  for (const currency of ["USD", "RON", "EUR"]) {
    fireEvent.change(screen.getByLabelText("Currency"), {
      target: { value: currency },
    });
    expect(
      (screen.getByLabelText("Cost (optional)") as HTMLInputElement).value,
    ).toBe("123.45");
  }
  fireEvent.click(screen.getByRole("radio", { name: /^Pay later$/ }));
  expect(
    (
      screen.getByRole("radio", {
        name: "Pay at the property",
      }) as HTMLInputElement
    ).checked,
  ).toBe(true);
  expect(screen.queryByLabelText("Payment due", { exact: true })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({
      payment_status: "unpaid",
      payment_arrangement: "property",
      payment_due_date: "",
      currency: "EUR",
      price: "123.45",
    }),
  );
});
it("requires a chosen deadline, accepts pre-trip dates and clears conditional fields when paid", () => {
  const save = mount({
    payment_status: "unpaid",
    payment_arrangement: "due_date",
    payment_due_date: "2027-04-01",
    currency: "RON",
  });
  expect((screen.getByLabelText("Currency") as HTMLSelectElement).value).toBe(
    "RON",
  );
  const date = screen.getByLabelText("Payment due", { exact: true });
  expect(date.getAttribute("min")).toBeNull();
  fireEvent.change(date, { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(save).not.toHaveBeenCalled();
  expect(screen.getByText("Choose a valid payment due date.")).toBeTruthy();
  fireEvent.change(date, { target: { value: "2027-04-01" } });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(save).toHaveBeenLastCalledWith(
    expect.objectContaining({
      payment_due_date: "2027-04-01",
      payment_arrangement: "due_date",
    }),
  );
  fireEvent.click(screen.getByRole("radio", { name: /^Paid$/ }));
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(save).toHaveBeenLastCalledWith(
    expect.objectContaining({
      payment_status: "paid",
      payment_due_date: "",
      payment_arrangement: "unspecified",
    }),
  );
  fireEvent.click(screen.getByRole("radio", { name: /^Not set$/ }));
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(save).toHaveBeenLastCalledWith(
    expect.objectContaining({ payment_status: "unknown" }),
  );
});
