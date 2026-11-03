import { expect, it, vi, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const mocks = vi.hoisted(() => ({ access: vi.fn(), discovery: vi.fn() }));
vi.mock("../lib/access", () => ({ access: mocks.access }));
vi.mock("../components/discovery", () => ({
  Discovery: (props: unknown) => {
    mocks.discovery(props);
    return <p>Map view</p>;
  },
}));
vi.mock("../components/forms", () => ({
  Submit: () => null,
  Delete: () => null,
  SegmentForm: () => null,
}));
vi.mock("../app/intelligence-actions", () => ({
  runTripCheck: vi.fn(),
  decideFinding: vi.fn(),
  restoreFinding: vi.fn(),
  generateSuggestions: vi.fn(),
  acceptSuggestion: vi.fn(),
  dismissSuggestion: vi.fn(),
  planIdea: vi.fn(),
}));
import { Intelligence } from "../components/intelligence";
import { mapTrip, mapBooking, mapPlace } from "./map-fixtures";
import { mapBookingColumns } from "../lib/trip-map";
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});
it("reads only trip-scoped map booking fields and saved places with the current account client", async () => {
  const requests: {
    table: string;
    columns: string;
    key: string;
    value: unknown;
  }[] = [];
  mocks.access.mockResolvedValue({
    db: {
      from: (table: string) => ({
        select: (columns: string) => ({
          eq: async (key: string, value: unknown) => {
            requests.push({ table, columns, key, value });
            return {
              error: null,
              data:
                table === "bookings"
                  ? [mapBooking("Hotel")]
                  : [mapPlace("Food")],
            };
          },
        }),
      }),
    },
  });
  vi.stubEnv("GOOGLE_PLACES_API_KEY", "");
  expect(
    renderToStaticMarkup(
      await Intelligence({
        trip: mapTrip,
        segments: [],
        view: "map",
        canEdit: false,
      }),
    ),
  ).toContain("Map view");
  expect(requests).toEqual([
    { table: "saved_places", columns: "*", key: "trip_id", value: mapTrip.id },
    {
      table: "bookings",
      columns: mapBookingColumns,
      key: "trip_id",
      value: mapTrip.id,
    },
  ]);
  expect(mocks.discovery.mock.calls[0][0]).toMatchObject({
    bookings: [mapBooking("Hotel")],
    livePlaces: false,
    canEdit: false,
  });
});
it("does not replace a failed booking read with a misleading empty map", async () => {
  mocks.access.mockResolvedValue({
    db: {
      from: (table: string) => ({
        select: () => ({
          eq: async () => ({
            error: table === "bookings" ? { code: "42501" } : null,
            data: [],
          }),
        }),
      }),
    },
  });
  await expect(
    Intelligence({ trip: mapTrip, segments: [], view: "map" }),
  ).rejects.toThrow("Could not load trip intelligence");
  expect(mocks.discovery).not.toHaveBeenCalled();
});
