// @vitest-environment jsdom
import { beforeAll, afterEach, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import type { MoneyResult } from "../lib/booking-budget";
import { BookingManager } from "../components/booking-manager";
import { overviewTrip, overviewBooking } from "./fixtures/trip-overview";
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
afterEach(cleanup);
const b = {
  ...overviewBooking(),
  title: "Legacy flight",
  category: "flight" as const,
  finance_revision: 2,
  verification: "unverified" as const,
  reservation_status: "cancelled" as const,
  payment_status: "unpaid" as const,
  payment_due_date: "2027-04-01",
  paid_amount: 30,
  price: 100,
  notes: "Keep note",
  provider: "Original airline",
};
function mount(
  save = vi.fn<(form: FormData) => Promise<MoneyResult>>(async () => ({
    message: "Saved",
  })),
  paymentDueReady = true,
) {
  render(
    <BookingManager
      trip={overviewTrip}
      segments={[]}
      bookings={[b]}
      attachments={[]}
      canEdit
      ready
      collectionReady
      owner={false}
      collection={null}
      paymentDueReady={paymentDueReady}
      save={save}
      remove={vi.fn()}
    />,
  );
  return save;
}
it("opens the same compact drawer and preserves hidden fields and independent statuses", async () => {
  const save = mount();
  fireEvent.click(screen.getByRole("button", { name: "Legacy flight" }));
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(screen.queryByRole("combobox", { name: "Category" })).toBeNull();
  fireEvent.change(screen.getByLabelText("Name", { exact: true }), {
    target: { value: "Updated flight" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  const data = save.mock.calls[0][0] as FormData;
  for (const [key, value] of Object.entries({
    id: b.id,
    revision: "2",
    category: "flight",
    notes: "Keep note",
    provider: "Original airline",
    paid_amount: "30",
    reservation_status: "cancelled",
    verification: "unverified",
    payment_due_date: "2027-04-01",
  }))
    expect(data.get(key)).toBe(value);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});
it("failed saves keep the editor recoverable and duplicate submits do not create a second request", async () => {
  let done: (value: { error: string }) => void = () => {};
  const save = vi.fn(
    () =>
      new Promise<{ error: string }>((resolve) => {
        done = resolve;
      }),
  );
  mount(save);
  fireEvent.click(screen.getByRole("button", { name: "Legacy flight" }));
  fireEvent.change(screen.getByLabelText("Name", { exact: true }), {
    target: { value: "Keep this input" },
  });
  const button = screen.getByRole("button", { name: "Save changes" });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(save).toHaveBeenCalledTimes(1);
  done({ error: "Network interrupted. Retry." });
  await screen.findByText("Network interrupted. Retry.", {
    selector: ".booking-drawer-error",
  });
  expect(
    (screen.getByLabelText("Name", { exact: true }) as HTMLInputElement).value,
  ).toBe("Keep this input");
});
it("older deployments disable only deadline editing and preserve it while saving other details", async () => {
  const save = mount(undefined, false);
  fireEvent.click(screen.getByRole("button", { name: "Legacy flight" }));
  expect(
    (screen.getByLabelText(/Payment due/) as HTMLInputElement).disabled,
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect((save.mock.calls[0][0] as FormData).has("payment_due_date")).toBe(
    false,
  );
});
