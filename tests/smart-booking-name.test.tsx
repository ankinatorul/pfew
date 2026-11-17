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
  fireEvent.change(
    screen.getByLabelText(/^(?:Name|Place|Where are you staying\?)$/, {
      exact: true,
    }),
    {
      target: { value: "Hotel Lumi" },
    },
  );
  await screen.findByRole("option", { name: /Hotel Lumière/ });
  fireEvent.keyDown(
    screen.getByLabelText(/^(?:Name|Place|Where are you staying\?)$/, {
      exact: true,
    }),
    {
      key: "ArrowDown",
    },
  );
  fireEvent.keyDown(
    screen.getByLabelText(/^(?:Name|Place|Where are you staying\?)$/, {
      exact: true,
    }),
    {
      key: "Enter",
    },
  );
  expect(
    (
      screen.getByLabelText(/^(?:Name|Place|Where are you staying\?)$/, {
        exact: true,
      }) as HTMLInputElement
    ).value,
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
  fireEvent.change(
    screen.getByLabelText(/^(?:Name|Place|Where are you staying\?)$/, {
      exact: true,
    }),
    {
      target: { value: "My friend's spare room" },
    },
  );
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
  fireEvent.focus(
    screen.getByLabelText(/^(?:Name|Place|Where are you staying\?)$/, {
      exact: true,
    }),
  );
  expect(fetcher).not.toHaveBeenCalled();
  fireEvent.change(
    screen.getByLabelText(/^(?:Name|Place|Where are you staying\?)$/, {
      exact: true,
    }),
    {
      target: { value: "Different custom stay" },
    },
  );
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(request).toHaveBeenCalled());
  expect(request.mock.calls[0][0]).toMatchObject({
    fields: {
      title: "Existing hotel",
      location_id: null,
      location_label: "Different custom stay",
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
  const fetcher = vi.fn().mockResolvedValue(
    Response.json({
      results: [],
      presentations: {},
      worldwideAvailable: true,
      status: "ok",
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  const request = mountEntry({ title: "Initial", category: "accommodation" });
  fireEvent.change(
    screen.getByLabelText(/^(?:Name|Place|Where are you staying\?)$/, {
      exact: true,
    }),
    {
      target: { value: "A private family cottage" },
    },
  );
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
  const name = screen.getByLabelText(
    /^(?:Name|Place|Where are you staying\?)$/,
    { exact: true },
  );
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

it("has one Place input, uses provider address metadata and defaults the title without another name/location field", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async () =>
      Response.json({
        results: [hotel],
        presentations: {
          [hotel.id]: {
            context: "Paris, France",
            type: "Hotel",
            address: "12 Rue des Fleurs, Paris, France",
          },
        },
        worldwideAvailable: true,
      }),
    ),
  );
  const request = mountEntry({
    title: "Draft stay",
    category: "accommodation",
    destination: "",
  });
  expect(
    screen.getAllByLabelText("Where are you staying?", { exact: true }),
  ).toHaveLength(1);
  expect(screen.queryByLabelText("Name", { exact: true })).toBeNull();
  expect(screen.queryByLabelText("Location name", { exact: true })).toBeNull();
  const input = screen.getByLabelText("Where are you staying?", {
    exact: true,
  });
  expect(input.getAttribute("placeholder")).toBe(
    "Search hotel or accommodation",
  );
  fireEvent.change(input, { target: { value: "Address hotel" } });
  await screen.findByRole("option", { name: /Hotel Lumière/ });
  fireEvent.click(
    screen.getByRole("button", { name: /Hotel Lumière.*12 Rue/ }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(request).toHaveBeenCalled());
  expect(request.mock.calls[0][0]).toMatchObject({
    fields: {
      title: hotel.city,
      destination: "12 Rue des Fleurs, Paris, France",
      location_id: hotel.id,
      latitude: hotel.latitude,
      longitude: hotel.longitude,
    },
  });
  expect(
    (request.mock.calls[0][0] as { fields: Record<string, unknown> }).fields,
  ).not.toHaveProperty("booking_place");
});
it("prepopulates the real saved place while retaining a custom booking title and custom address", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const request = mountEntry({
    title: "Honeymoon stay",
    category: "accommodation",
    location_id: hotel.id,
    location_label: hotel.label,
    latitude: hotel.latitude,
    longitude: hotel.longitude,
    destination: "Use courtyard entrance, 8 Custom Road",
  });
  expect(
    (
      screen.getByLabelText("Where are you staying?", {
        exact: true,
      }) as HTMLInputElement
    ).value,
  ).toBe(hotel.city);
  fireEvent.focus(
    screen.getByLabelText("Where are you staying?", { exact: true }),
  );
  expect(fetcher).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(request).toHaveBeenCalled());
  expect(request.mock.calls[0][0]).toMatchObject({
    fields: {
      title: "Honeymoon stay",
      destination: "Use courtyard entrance, 8 Custom Road",
      location_id: hotel.id,
      latitude: hotel.latitude,
      longitude: hotel.longitude,
    },
  });
});
it("a manual place can change without losing the separate custom booking title or inventing map coordinates", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  const request = mountEntry({
    title: "Family stay",
    category: "accommodation",
    location_id: hotel.id,
    location_label: hotel.label,
    latitude: hotel.latitude,
    longitude: hotel.longitude,
    destination: "Personal address note",
  });
  fireEvent.change(
    screen.getByLabelText("Where are you staying?", { exact: true }),
    {
      target: { value: "Our private cottage" },
    },
  );
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(request).toHaveBeenCalled());
  expect(request.mock.calls[0][0]).toMatchObject({
    fields: {
      title: "Family stay",
      location_label: "Our private cottage",
      location_id: null,
      latitude: null,
      longitude: null,
      destination: "Personal address note",
    },
  });
});

it("editing the optional booking title preserves its selected Place and coordinates", async () => {
  const request = mountEntry({
    title: "Honeymoon stay",
    category: "accommodation",
    location_id: hotel.id,
    location_label: hotel.label,
    latitude: hotel.latitude,
    longitude: hotel.longitude,
  });
  fireEvent.change(screen.getByLabelText("Booking title (optional)"), {
    target: { value: "Anniversary stay" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(request).toHaveBeenCalled());
  expect(request.mock.calls[0][0]).toMatchObject({
    fields: {
      title: "Anniversary stay",
      location_id: hotel.id,
      location_label: hotel.label,
      latitude: hotel.latitude,
      longitude: hotel.longitude,
    },
  });
});
it("a preserved custom title does not allow an empty required Place to save", async () => {
  const request = mountEntry({
    title: "Honeymoon stay",
    category: "accommodation",
    location_id: hotel.id,
    location_label: hotel.label,
    latitude: hotel.latitude,
    longitude: hotel.longitude,
  });
  fireEvent.change(
    screen.getByLabelText("Where are you staying?", { exact: true }),
    {
      target: { value: "" },
    },
  );
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await screen.findByRole("alert");
  expect(
    screen.getByText("Add a place name. A search match isn’t required."),
  ).toBeTruthy();
  expect(request).not.toHaveBeenCalled();
});

it("the generic Name searches hotels, saves their address and has no separate Location details", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      Response.json({
        results: [hotel],
        presentations: {
          [hotel.id]: {
            context: "Paris, France",
            type: "Hotel",
            address: "12 Rue des Fleurs, Paris, France",
          },
        },
        status: "ok",
        worldwideAvailable: true,
      }),
    );
  vi.stubGlobal("fetch", fetcher);
  const request = mountEntry({ category: "other", title: "Casa Vimaya" });
  const name = screen.getByRole("combobox", { name: "Name" });
  expect(screen.queryByText("Location details (optional)")).toBeNull();
  expect(screen.queryByLabelText("Address (optional)")).toBeNull();
  fireEvent.change(name, { target: { value: "Hotel Lumi" } });
  await screen.findByRole("option", { name: /Hotel Lumière/ });
  expect(String(fetcher.mock.calls[0][0])).toContain("booking=Other");
  fireEvent.click(
    screen.getByRole("button", { name: /Hotel Lumière.*12 Rue/ }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(request).toHaveBeenCalled());
  expect(request.mock.calls[0][0]).toMatchObject({
    fields: {
      title: hotel.city,
      location_id: hotel.id,
      latitude: hotel.latitude,
      longitude: hotel.longitude,
      destination: "12 Rue des Fleurs, Paris, France",
    },
  });
});
