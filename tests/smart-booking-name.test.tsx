// @vitest-environment jsdom
import { afterEach, beforeAll, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import {
  BookingCollection,
  type CollectionRequest,
} from "../components/booking-collection";
import { BookingEditor } from "../components/shared-booking";
import { emptyCollectionEntry } from "../lib/booking-collection";
import { geographicLocation } from "../lib/geographic-location";
import { overviewTrip } from "./fixtures/trip-overview";
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const hotel = geographicLocation(
  "Hotel Lumière",
  "Paris, France",
  48.86,
  2.33,
  "FR",
  "osm:N:123",
);
const response = () =>
  Response.json({
    results: [hotel],
    presentations: { [hotel.id]: { context: "Paris, France", type: "Hotel" } },
    worldwideAvailable: true,
    status: "ok",
  });
function mountEntry(
  fields: Record<string, string | number | null>,
  request = vi.fn<CollectionRequest>().mockImplementation(async (body) => ({
    entry: {
      ...emptyCollectionEntry(crypto.randomUUID()),
      ...(body as object),
      fields: (body as { fields: typeof fields }).fields,
      revision: 1,
    },
  })),
) {
  const entry = {
    ...emptyCollectionEntry(crypto.randomUUID()),
    fields: { ...emptyCollectionEntry(crypto.randomUUID()).fields, ...fields },
  };
  render(
    <BookingCollection
      trip={overviewTrip}
      initialEntries={[entry]}
      initialAttachments={[]}
      request={request}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: String(fields.title || "New booking") }),
  );
  return request;
}
it("selects a hotel in Name, stores compatible metadata and clears the association on a later custom rename", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async () => response()),
  );
  const request = mountEntry({ title: "My stay", category: "accommodation" });
  fireEvent.change(screen.getByLabelText("Name", { exact: true }), {
    target: { value: "Hotel Lumi" },
  });
  await screen.findByRole("option", { name: /Hotel Lumière/ });
  fireEvent.keyDown(screen.getByLabelText("Name", { exact: true }), {
    key: "ArrowDown",
  });
  fireEvent.keyDown(screen.getByLabelText("Name", { exact: true }), {
    key: "Enter",
  });
  expect(
    (screen.getByLabelText("Name", { exact: true }) as HTMLInputElement).value,
  ).toBe(hotel.city);
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(request).toHaveBeenCalled());
  expect(request.mock.calls[0][0]).toMatchObject({
    fields: {
      title: hotel.city,
      location_id: hotel.id,
      latitude: hotel.latitude,
      longitude: hotel.longitude,
      location_label: hotel.label,
    },
  });
});
it("saving custom names succeeds without a match or provider and never invents geography", async () => {
  const fetcher = vi.fn().mockRejectedValue(new Error("Offline"));
  vi.stubGlobal("fetch", fetcher);
  const request = mountEntry({ title: "Stay", category: "accommodation" });
  fireEvent.change(screen.getByLabelText("Name", { exact: true }), {
    target: { value: "My friend's spare room" },
  });
  await screen.findByText(
    "Suggestions unavailable. You can still use this name.",
  );
  expect(screen.queryByRole("alert")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(request).toHaveBeenCalled());
  const fields = (
    request.mock.calls[0][0] as { fields: Record<string, unknown> }
  ).fields;
  expect(fields.title).toBe("My friend's spare room");
  expect(fields.location_id).toBeUndefined();
  expect(fields.latitude).toBeUndefined();
});
it("keeps legacy places on focus but clears them when the linked name is actually edited", async () => {
  const fetcher = vi.fn().mockImplementation(async () => response());
  vi.stubGlobal("fetch", fetcher);
  const request = mountEntry({
    title: "Existing hotel",
    category: "accommodation",
    location_id: hotel.id,
    location_label: hotel.label,
    latitude: hotel.latitude,
    longitude: hotel.longitude,
  });
  fireEvent.focus(screen.getByLabelText("Name", { exact: true }));
  expect(fetcher).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Name", { exact: true }), {
    target: { value: "Different custom stay" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(request).toHaveBeenCalled());
  expect(request.mock.calls[0][0]).toMatchObject({
    fields: {
      title: "Different custom stay",
      location_id: null,
      location_label: null,
      latitude: null,
      longitude: null,
    },
  });
});
it("exposes invalid saved Stay dates immediately, preserves them and blocks all save paths until corrected", async () => {
  const save = vi.fn();
  const entry = {
    ...emptyCollectionEntry(crypto.randomUUID()),
    fields: {
      title: "Stay",
      category: "accommodation",
      start_date: "2026-12-27",
      end_date: "2026-11-29",
    },
  };
  render(
    <BookingEditor
      entry={entry}
      trip={overviewTrip}
      title="Edit booking"
      busy={false}
      error=""
      onClose={() => {}}
      returnFocus={null}
      onChange={() => {}}
      onSave={save}
    />,
  );
  expect(screen.getByRole("alert").textContent).toBe(
    "Check-out must be on or after check-in.",
  );
  const end = screen.getByLabelText("Check-out date", {
    exact: true,
  }) as HTMLInputElement;
  expect(end.value).toBe("2026-11-29");
  expect(end.min).toBe("2026-12-27");
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(save).not.toHaveBeenCalled();
  fireEvent.change(end, { target: { value: "2026-12-29" } });
  expect(screen.queryByRole("alert")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(save).toHaveBeenCalledTimes(1);
});
it("no matches is a valid custom-name path and does not show a provider error", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      Response.json({
        results: [],
        presentations: {},
        worldwideAvailable: true,
        status: "ok",
      }),
    );
  vi.stubGlobal("fetch", fetcher);
  const request = mountEntry({ title: "Initial", category: "accommodation" });
  fireEvent.change(screen.getByLabelText("Name", { exact: true }), {
    target: { value: "A private family cottage" },
  });
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  expect(screen.queryByText(/Suggestions unavailable/)).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "Use “A private family cottage”" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(request).toHaveBeenCalled());
  expect(request.mock.calls[0][0]).toMatchObject({
    fields: { title: "A private family cottage" },
  });
});
it("cancels superseded queries and ignores a late response without changing the typed name", async () => {
  let finish: (response: Response) => void = () => {};
  const fetcher = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    )
    .mockImplementationOnce(async () => response());
  vi.stubGlobal("fetch", fetcher);
  mountEntry({ title: "Initial", category: "accommodation" });
  const name = screen.getByLabelText("Name", { exact: true });
  fireEvent.change(name, { target: { value: "First stale hotel" } });
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  fireEvent.change(name, { target: { value: "Second current hotel" } });
  await screen.findByRole("option", { name: /Hotel Lumière/ });
  expect((fetcher.mock.calls[0][1].signal as AbortSignal).aborted).toBe(true);
  finish(
    Response.json({
      results: [],
      presentations: {},
      worldwideAvailable: true,
      status: "ok",
    }),
  );
  await waitFor(() =>
    expect(screen.getByRole("option", { name: /Hotel Lumière/ })).toBeTruthy(),
  );
  expect((name as HTMLInputElement).value).toBe("Second current hotel");
});
