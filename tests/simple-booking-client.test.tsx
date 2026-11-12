// @vitest-environment jsdom
import { beforeAll, afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  BookingCollection,
  type CollectionRequest,
} from "../components/booking-collection";
import { SimpleBookingFields } from "../components/simple-booking-fields";
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
it("edits a legacy reviewed flight without clearing hidden fields, subtype, payment or reservation history", async () => {
  const entry = {
    ...emptyCollectionEntry(crypto.randomUUID()),
    revision: 2,
    review_status: "reviewed" as const,
    reservation_status: "cancelled" as const,
    fields: {
      title: "Legacy flight",
      category: "flight",
      provider: "Original airline",
      reference: "REF",
      segment_id: crypto.randomUUID(),
      notes: "Private preserved note",
      travelers: "Preserved traveler",
      price: 100,
      paid_amount: 30,
      currency: "EUR",
      payment_status: "partial",
      start_date: "2027-05-01",
      end_date: "2027-05-01",
      local_time: "10:00",
      end_local_time: "12:00",
      timezone: "Europe/Paris",
      end_timezone: "Europe/Paris",
      origin: "Paris",
      destination: "Rome",
      custom_legacy: "kept",
    },
  };
  const request = vi
    .fn<CollectionRequest>()
    .mockImplementation(async (body) => ({
      entry: {
        ...entry,
        revision: 3,
        fields: (body as Record<string, unknown>).fields as typeof entry.fields,
      },
    }));
  render(
    <BookingCollection
      trip={overviewTrip}
      initialEntries={[entry]}
      initialAttachments={[]}
      request={request}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Legacy flight" }));
  fireEvent.change(screen.getByLabelText("Name", { exact: true }), {
    target: { value: "Corrected flight" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(request).toHaveBeenCalled());
  expect(request.mock.calls[0][0]).toMatchObject({
    action: "save",
    revision: 2,
    reservation_status: "cancelled",
    fields: { ...entry.fields, title: "Corrected flight" },
  });
  expect(screen.queryByText(/Reservation:|theme/i)).toBeNull();
});
it("gates a dedicated payment deadline when its migration is absent, without disabling Pay later", () => {
  const entry = emptyCollectionEntry(crypto.randomUUID());
  entry.fields.payment_status = "unpaid";
  render(<SimpleBookingFields entry={entry} trip={overviewTrip} />);
  expect(
    (screen.getByRole("radio", { name: "Pay later" }) as HTMLInputElement)
      .checked,
  ).toBe(true);
  expect(
    (document.querySelector('[name="payment_due_date"]') as HTMLInputElement)
      .disabled,
  ).toBe(true);
  expect(
    screen.getByText("Payment deadlines aren’t available yet."),
  ).toBeTruthy();
});
it("saves name-only bookings as recoverable unfinished entries without inventing a date or cost", async () => {
  const entry = emptyCollectionEntry(crypto.randomUUID());
  entry.fields.title = "Later details";
  const request = vi
    .fn<CollectionRequest>()
    .mockImplementation(async (body) => ({
      entry: {
        ...entry,
        revision: 1,
        fields: (body as Record<string, unknown>).fields as typeof entry.fields,
      },
    }));
  render(
    <BookingCollection
      trip={overviewTrip}
      initialEntries={[entry]}
      initialAttachments={[]}
      request={request}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Later details" }));
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(request).toHaveBeenCalled());
  expect(request.mock.calls[0][0]).toMatchObject({
    review_status: "needs_review",
    reservation_status: "unknown",
    fields: { title: "Later details", start_date: "", end_date: "", price: "" },
  });
});

it("opens a new drawer without saving an empty booking, protects edits and restores focus", async () => {
  const request = vi.fn<CollectionRequest>();
  render(
    <BookingCollection
      trip={overviewTrip}
      initialEntries={[]}
      initialAttachments={[]}
      request={request}
    />,
  );
  const add = screen.getByRole("button", { name: "Add manually" });
  add.focus();
  fireEvent.click(add);
  expect(screen.getByRole("dialog", { name: "Add a booking" })).toBeTruthy();
  expect(document.activeElement).toBe(screen.getByLabelText("Name"));
  expect(request).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Name"), {
    target: { value: "Keep these inputs" },
  });
  const confirm = vi
    .spyOn(window, "confirm")
    .mockReturnValueOnce(false)
    .mockReturnValueOnce(true);
  fireEvent.click(screen.getByRole("button", { name: "Close booking editor" }));
  expect(screen.getByRole("dialog")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Close booking editor" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(add);
  fireEvent.click(screen.getByRole("button", { name: "Keep these inputs" }));
  expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe(
    "Keep these inputs",
  );
  expect(confirm).toHaveBeenCalledTimes(2);
  confirm.mockRestore();
});
it("keeps failed saves in the drawer, prevents duplicate submissions and closes only on confirmed success", async () => {
  const request = vi
    .fn<CollectionRequest>()
    .mockResolvedValueOnce({})
    .mockImplementation(async (body) => {
      const b = body as Record<string, unknown>;
      return {
        entry: {
          ...emptyCollectionEntry(String(b.id)),
          fields: b.fields as Record<string, string>,
          revision: 1,
        },
      };
    });
  render(
    <BookingCollection
      trip={overviewTrip}
      initialEntries={[]}
      initialAttachments={[]}
      request={request}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Add manually" }));
  fireEvent.change(screen.getByLabelText("Name"), {
    target: { value: "Retry booking" },
  });
  const save = screen.getByRole("button", { name: "Save booking" });
  fireEvent.click(save);
  fireEvent.click(save);
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain("Try again"),
  );
  expect(request).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe(
    "Retry booking",
  );
  const first = (request.mock.calls[0][0] as Record<string, unknown>).id;
  fireEvent.click(save);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect((request.mock.calls[1][0] as Record<string, unknown>).id).toBe(first);
  expect(screen.getAllByRole("button", { name: "Retry booking" })).toHaveLength(
    1,
  );
});
it("cancels an untouched new drawer without a saved empty card", () => {
  const request = vi.fn<CollectionRequest>();
  render(
    <BookingCollection
      trip={overviewTrip}
      initialEntries={[]}
      initialAttachments={[]}
      request={request}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Add manually" }));
  fireEvent.click(screen.getByRole("button", { name: "Close booking editor" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.querySelectorAll("article.collection-entry")).toHaveLength(0);
  expect(request).not.toHaveBeenCalled();
});
