// @vitest-environment jsdom
import type { MapPin } from "../components/google-map";
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  within,
  waitFor,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
vi.mock("../app/intelligence-actions", () => ({
  savePlace: vi.fn(),
  deletePlace: vi.fn(),
  placeToIdea: vi.fn(),
}));
vi.mock("../components/forms", () => ({
  Submit: ({ children }: { children: React.ReactNode }) => (
    <button>{children}</button>
  ),
}));
vi.mock("../components/google-map", () => ({
  GoogleMap: ({
    pins,
    selected,
    onSelect,
  }: {
    pins: MapPin[];
    selected: string;
    onSelect: (id: string) => void;
  }) => (
    <div aria-label="Map fixture" data-selected={selected}>
      {pins.map((p) => (
        <button key={p.id} onClick={() => onSelect(p.id)}>
          {p.label}
        </button>
      ))}
    </div>
  ),
}));
import { Discovery } from "../components/discovery";
import { savePlace } from "../app/intelligence-actions";
import {
  mapTrip,
  mapSegment,
  mapBooking,
  mapPlace,
  freshPlace,
} from "./map-fixtures";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("keeps list and map filters synchronized, links bookings and never fetches on mount or filter changes", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const user = userEvent.setup();
  render(
    <Discovery
      trip={mapTrip}
      segments={[
        mapSegment("Unknown activity"),
        mapSegment("Day one destination", {
          kind: "destination",
          location_id: "tokyo",
          latitude: 35.68,
          longitude: 139.69,
        }),
      ]}
      bookings={[mapBooking("Saved hotel")]}
      places={[mapPlace("Food idea")]}
      canEdit={false}
    />,
  );
  const list = screen.getByLabelText("Trip location list"),
    map = screen.getByLabelText("Map fixture");
  expect(within(list).getByText("Unknown activity")).toBeTruthy();
  expect(within(map).queryByText("Unknown activity")).toBeNull();
  expect(
    within(list)
      .getByRole("link", { name: /Open booking/ })
      .getAttribute("href"),
  ).toContain("edit=Saved%20hotel");
  await user.selectOptions(screen.getByLabelText("Location type"), "stay");
  expect(within(list).getAllByRole("article")).toHaveLength(1);
  expect(within(map).getAllByRole("button")).toHaveLength(1);
  await user.click(within(map).getByRole("button"));
  expect(document.activeElement).toBe(within(list).getByRole("article"));
  expect(within(list).getByRole("article").className).toContain("lime");
  await user.selectOptions(
    screen.getByLabelText("Location type"),
    "destination",
  );
  expect(map.getAttribute("data-selected")).toBe("");
  await user.selectOptions(screen.getByLabelText("Trip day"), "2027-05-03");
  expect(within(list).queryAllByRole("article")).toHaveLength(0);
  expect(within(map).queryAllByRole("button")).toHaveLength(0);
  expect(fetcher).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Remove place" })).toBeNull();
});
it("loads an idea's exact venue only on demand and keeps provider data out of saves", async () => {
  const user = userEvent.setup();
  const fetcher = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ result: freshPlace }),
  });
  vi.stubGlobal("fetch", fetcher);
  render(
    <Discovery
      trip={mapTrip}
      segments={[
        mapSegment("My idea", {
          status: "idea",
          google_place_id: freshPlace.id,
        }),
      ]}
      places={[]}
      livePlaces
    />,
  );
  const map = screen.getByLabelText("Map fixture");
  expect(within(map).queryAllByRole("button")).toHaveLength(0);
  expect(fetcher).not.toHaveBeenCalled();
  await user.click(
    screen.getByRole("button", { name: "Load current place details" }),
  );
  await waitFor(() =>
    expect(within(map).getAllByRole("button")).toHaveLength(1),
  );
  expect(fetcher.mock.calls[0][0]).toBe("/api/quick-place");
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
    trip_id: mapTrip.id,
    place_id: freshPlace.id,
  });
  expect(screen.getByText(/current Google place location/)).toBeTruthy();
  expect(screen.getByText(/Fixture attribution/)).toBeTruthy();
  expect(
    within(screen.getByLabelText("Trip location list"))
      .getByRole("link", { name: /Open Ideas/ })
      .getAttribute("href"),
  ).toContain("view=ideas");
  expect(savePlace).not.toHaveBeenCalled();
  expect(
    [...document.querySelectorAll("input, textarea")].map(
      (node) => (node as HTMLInputElement).value,
    ),
  ).not.toContain(freshPlace.name);
});
it("keeps undated ideas explicit and excludes them when the day-only option is selected", async () => {
  const user = userEvent.setup();
  render(
    <Discovery
      trip={mapTrip}
      segments={[mapSegment("Undated idea", { status: "idea" })]}
      places={[mapPlace("Undated place")]}
      canEdit={false}
    />,
  );
  await user.selectOptions(screen.getByLabelText("Trip day"), "2027-05-03");
  const list = screen.getByLabelText("Trip location list");
  expect(within(list).getAllByRole("article")).toHaveLength(2);
  await user.click(
    screen.getByLabelText("Include undated saved places and ideas"),
  );
  expect(within(list).queryAllByRole("article")).toHaveLength(0);
});
it("leaves locations available without optional keys and blocks provider requests offline", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const user = userEvent.setup();
  const view = render(
    <Discovery
      trip={mapTrip}
      segments={[mapSegment("Venue", { google_place_id: freshPlace.id })]}
      places={[]}
    />,
  );
  expect(
    (screen.getByRole("button", { name: "Search places" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(
    screen.queryByRole("button", { name: "Load current place details" }),
  ).toBeNull();
  expect(
    screen.getByRole("link", { name: /Open Google Maps/ }).getAttribute("href"),
  ).toContain(freshPlace.id);
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  view.rerender(
    <Discovery
      trip={mapTrip}
      segments={[mapSegment("Venue", { google_place_id: freshPlace.id })]}
      places={[]}
      livePlaces
    />,
  );
  fireEvent(window, new Event("offline"));
  await user.click(
    screen.getByRole("button", { name: "Load current place details" }),
  );
  expect(fetcher).not.toHaveBeenCalled();
});
