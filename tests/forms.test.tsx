// @vitest-environment jsdom
import { afterEach, beforeEach, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { searchLocations } from "../lib/locations";
import { geographicLocation } from "../lib/geographic-location";
import { TripForm, SegmentForm, Delete } from "../components/forms";
import { TripCollection } from "../components/trip-collection";
import { saveTrip, saveSegment, deleteTrip } from "../app/actions";
vi.mock("../app/actions", () => ({
  saveTrip: vi.fn(async () => {}),
  saveSegment: vi.fn(async () => {}),
  deleteTrip: vi.fn(async () => {}),
  deleteSegment: vi.fn(async () => {}),
}));
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      Response.json({
        results: searchLocations(
          new URL(url, "http://test").searchParams.get("q") || "",
        ),
      }),
    ),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
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
}
it("creates a trip with two destinations and preserves optional defaults", async () => {
  const user = userEvent.setup();
  render(<TripForm />);
  essentials();
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await user.click(screen.getByRole("button", { name: /Add destination/ }));
  await user.type(
    screen.getByRole("combobox", { name: "Destination name" }),
    "Tokyo",
  );
  await user.click(await screen.findByRole("option", { name: "Tokyo, Japan" }));
  await user.click(screen.getByRole("button", { name: /Add destination/ }));
  await user.type(
    screen.getAllByRole("combobox", { name: "Destination name" })[1],
    "Kyoto",
  );
  await user.click(await screen.findByRole("option", { name: "Kyoto, Japan" }));
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await user.click(screen.getByRole("button", { name: "Create my trip" }));
  await waitFor(() => expect(saveTrip).toHaveBeenCalledTimes(1));
  const payload = vi.mocked(saveTrip).mock.calls[0][0];
  expect(payload.getAll("destination_name")[0]).toBe("Tokyo, Japan");
  expect(payload.getAll("destination_name")[1]).toContain("Kyoto");
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
it("derives time zones without showing a time-zone input", async () => {
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
  expect(screen.queryByRole("combobox", { name: "Time zone" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Add to trip" }));
  await waitFor(() => expect(saveSegment).toHaveBeenCalledTimes(1));
  expect(vi.mocked(saveSegment).mock.calls[0][0].get("timezone")).toBe("UTC");
  expect(vi.mocked(saveSegment).mock.calls[0][0].get("title")).toBe(
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

it("offers saved-trip deletion only to owners and submits the selected trip after confirmation", async () => {
  const user = userEvent.setup();
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  const owned = "11111111-1111-4111-8111-111111111111";
  const base = {
    start_date: "2027-05-01",
    end_date: "2027-05-10",
    timezone: "UTC",
    travelers: 1,
    style: "Comfort" as const,
    lifecycle: "upcoming" as const,
  };
  render(
    <TripCollection
      trips={[
        { ...base, id: owned, name: "My trip", shared: false },
        {
          ...base,
          id: "22222222-2222-4222-8222-222222222222",
          name: "Shared trip",
          shared: true,
        },
      ]}
    />,
  );
  expect(
    screen
      .getByLabelText("Options for My trip")
      .parentElement?.hasAttribute("open"),
  ).toBe(false);
  await user.click(screen.getByLabelText("Options for My trip"));
  expect(screen.getAllByRole("button", { name: "Delete trip" })).toHaveLength(
    1,
  );
  const button = screen.getByRole("button", { name: "Delete trip" });
  await user.click(button);
  expect(deleteTrip).not.toHaveBeenCalled();
  confirm.mockReturnValue(true);
  await user.click(button);
  await waitFor(() => expect(deleteTrip).toHaveBeenCalledOnce());
  expect(vi.mocked(deleteTrip).mock.calls[0][0].get("id")).toBe(owned);
});

it("creates an island-only trip using worldwide results and the manual-place fallback", async () => {
  const user = userEvent.setup();
  const phangan = geographicLocation("Koh Phangan", "Thailand", 9.73, 100.01);
  const tao = geographicLocation("Koh Tao", "", 10.1, 99.84);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") return Response.json({ location: tao });
      return Response.json({ results: [phangan], worldwideAvailable: true });
    }),
  );
  render(<TripForm />);
  essentials();
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await user.click(screen.getByRole("button", { name: /Add destination/ }));
  await user.type(
    screen.getByRole("combobox", { name: "Destination name" }),
    "Koh Phangan",
  );
  await user.click(await screen.findByRole("option", { name: phangan.label }));
  await user.click(screen.getByRole("button", { name: /Add destination/ }));
  const manual = screen.getAllByText(
    "Can’t find it? Add a place from its map position",
  );
  await user.click(manual[0]);
  await user.type(screen.getByLabelText("Place name"), "Koh Tao");
  await user.type(
    screen.getByLabelText("Coordinates or map link"),
    "10.1,99.84",
  );
  await user.click(screen.getByRole("button", { name: "Use this location" }));
  await waitFor(() =>
    expect(
      screen.getAllByRole("combobox", { name: "Destination name" })[1],
    ).toHaveProperty("value", "Koh Tao"),
  );
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await user.click(screen.getByRole("button", { name: "Create my trip" }));
  await waitFor(() => expect(saveTrip).toHaveBeenCalledOnce());
  const body = vi.mocked(saveTrip).mock.calls[0][0];
  expect(body.getAll("destination_location_id")).toEqual([phangan.id, tao.id]);
  expect(body.getAll("destination_timezone")).toEqual([
    "Asia/Bangkok",
    "Asia/Bangkok",
  ]);
});
