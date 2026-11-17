// @vitest-environment jsdom
import { it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
const m = vi.hoisted(() => ({
  reorder: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
}));
vi.mock("../app/trip-map-actions", () => ({ reorderDestinations: m.reorder }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: m.refresh, push: m.push }),
}));
vi.mock("next/dynamic", () => ({
  default: () =>
    function MockMap({
      destinations,
      onSelect,
      selected,
    }: {
      destinations: { id: string; title: string }[];
      onSelect: (id: string) => void;
      selected: string;
    }) {
      return (
        <div data-testid="map">
          <output>{selected}</output>
          {destinations.map((p) => (
            <button key={p.id} onClick={() => onSelect(p.id)}>
              Pin {p.title}
            </button>
          ))}
        </div>
      );
    },
}));
import { TripMapCard, TripExplorer } from "../components/trip-map";
import { tripMapData } from "../lib/trip-map";
import {
  overviewTrip,
  overviewSegment,
  overviewBooking,
} from "./fixtures/trip-overview";
const data = tripMapData(
  overviewTrip,
  [
    overviewSegment({
      id: "a",
      kind: "destination",
      title: "Paris",
      latitude: 48,
      longitude: 2,
      position: 0,
    }),
    overviewSegment({
      id: "b",
      kind: "destination",
      title: "Bali",
      latitude: -8,
      longitude: 115,
      position: 1,
    }),
  ],
  [{ ...overviewBooking(), title: "Hotel", latitude: null, longitude: null }],
  [],
);
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("dashboard has expand navigation, numbered keyboard controls and selection feedback", () => {
  render(<TripMapCard data={data} />);
  expect(
    screen.getByRole("link", { name: /Expand map/ }).getAttribute("href"),
  ).toBe(`/trips/${overviewTrip.id}?view=map`);
  fireEvent.click(screen.getByRole("button", { name: "1 Paris" }));
  expect(
    screen
      .getByRole("button", { name: "1 Paris" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  expect(screen.getByText("2 destinations · 1 saved places")).toBeTruthy();
});
it("missing coordinates and empty destinations have useful fallback links without fictional pins", () => {
  const empty = tripMapData(overviewTrip, [], [], []);
  const view = render(<TripMapCard data={empty} />);
  expect(
    screen.getByText("Add destinations to see your trip on the map."),
  ).toBeTruthy();
  expect(screen.queryByTestId("map")).toBeNull();
  view.rerender(
    <TripMapCard
      data={{
        ...data,
        destinations: data.destinations.map((p) => ({
          ...p,
          coordinates: null,
        })),
      }}
    />,
  );
  expect(screen.getAllByText("Location not mapped")).toHaveLength(2);
  expect(screen.queryByTestId("map")).toBeNull();
});
it("explorer pins focus their list entry, shares selection, keeps unmapped bookings accessible, and toggles mobile details", () => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
  render(<TripExplorer data={data} canEdit={false} />);
  fireEvent.click(screen.getByRole("button", { name: "Pin Paris" }));
  expect(
    screen
      .getByRole("button", { name: "1 Paris" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  expect(screen.getByText("Hotel")).toBeTruthy();
  expect(
    screen.getByRole("link", { name: "View booking" }).getAttribute("href"),
  ).toContain("view=bookings&edit=");
  const toggle = screen.getByRole("button", { name: /Destinations & places/ });
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  fireEvent.click(toggle);
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  expect(screen.queryByRole("button", { name: /Move Paris/ })).toBeNull();
});
it("authorized ordering sends existing revision snapshots and refreshes; save failure remains visible", async () => {
  const order = { revision: 3, ids: ["a", "b"], segments: [] };
  m.reorder
    .mockResolvedValueOnce({})
    .mockResolvedValue({ error: "Changed. Reload." });
  render(<TripExplorer data={data} canEdit order={order} />);
  fireEvent.change(
    screen.getByRole("combobox", { name: "Move Paris to position" }),
    { target: { value: "1" } },
  );
  await waitFor(() => expect(m.refresh).toHaveBeenCalledOnce());
  expect(m.reorder).toHaveBeenCalledWith({
    trip: overviewTrip.id,
    revision: 3,
    ids: ["b", "a"],
    segments: [],
  });
  fireEvent.change(
    screen.getByRole("combobox", { name: "Move Paris to position" }),
    { target: { value: "1" } },
  );
  expect(await screen.findByRole("alert")).toBeTruthy();
});

it("mapped booking entries open the existing booking editor route", () => {
  render(<TripExplorer data={data} canEdit={false} />);
  fireEvent.click(screen.getByRole("button", { name: "Hotel" }));
  expect(m.push).toHaveBeenCalledWith(
    expect.stringContaining("view=bookings&edit="),
  );
});
