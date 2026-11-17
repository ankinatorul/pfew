import { it, expect, vi, beforeEach } from "vitest";
const m = vi.hoisted(() => ({
  access: vi.fn(),
  role: vi.fn(),
  load: vi.fn(),
  explorer: vi.fn(() => null),
}));
vi.mock("../lib/access", () => ({ access: m.access }));
vi.mock("../lib/trip-role", () => ({ tripRole: m.role }));
vi.mock("../lib/trip-map-data", () => ({ loadTripMapData: m.load }));
vi.mock("../components/trip-map", () => ({
  TripExplorer: m.explorer,
  TripMapCard: () => null,
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not found");
  },
  redirect: (url: string) => {
    throw new Error("redirect:" + url);
  },
}));
import Hub from "../app/trips/[id]/page";
import { overviewTrip as trip } from "./fixtures/trip-overview";
let current: typeof trip | null = trip;
beforeEach(() => {
  vi.clearAllMocks();
  current = trip;
  m.role.mockResolvedValue("editor");
  m.load.mockResolvedValue({
    tripId: trip.id,
    destinations: [],
    places: [],
    unavailable: [],
  });
  m.access.mockImplementation(async () => ({
    user: { id: "editor" },
    db: {
      rpc: async () => ({ data: null, error: { code: "PGRST202" } }),
      from: (table: string) => {
        const q = {
          select: () => q,
          eq: () => q,
          order: () => q,
          maybeSingle: async () => ({
            data: table === "trips" ? current : { layout: [] },
            error: null,
          }),
          then: (resolve: (v: unknown) => unknown) =>
            Promise.resolve({ data: [], error: null }).then(resolve),
        };
        return q;
      },
    },
  }));
});
const route = () =>
  Hub({
    params: Promise.resolve({ id: trip.id }),
    searchParams: Promise.resolve({ view: "map" }),
  });
it.each(["owner", "editor", "viewer"])(
  "existing authorized %s uses the map, with editing only for owner/editor and unavailable ordering disabled",
  async (role) => {
    m.role.mockResolvedValue(role);
    const page = await route();
    expect(page.type).toBe(m.explorer);
    expect(page.props.canEdit).toBe(role !== "viewer");
    expect(page.props.order).toBeUndefined();
    expect(m.load).toHaveBeenCalledOnce();
  },
);
it("missing/unauthorized trip never loads map data", async () => {
  current = null;
  await expect(route()).rejects.toThrow("not found");
  expect(m.load).not.toHaveBeenCalled();
});
it("private drafts never enter the trip explorer", async () => {
  current = { ...trip, creation_state: "draft", owner_id: "different" };
  await expect(route()).rejects.toThrow("not found");
  expect(m.load).not.toHaveBeenCalled();
});
