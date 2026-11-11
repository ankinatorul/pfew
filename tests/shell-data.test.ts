import { afterEach, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  supabase: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  order: vi.fn(),
}));
vi.mock("../lib/supabase", () => ({ supabase: mocks.supabase }));
import { shellTrips } from "../lib/shell-data";
afterEach(() => vi.clearAllMocks());
function client(result: unknown) {
  mocks.order.mockResolvedValue(result);
  mocks.select.mockReturnValue({ eq: () => ({ order: mocks.order }), order: mocks.order });
  mocks.from.mockReturnValue({ select: mocks.select });
  mocks.supabase.mockResolvedValue({ from: mocks.from });
}
it("uses the session-scoped client and projects only navigation fields for owned and RLS-visible shared trips", async () => {
  const base = {
    start_date: "2027-05-01",
    end_date: "2027-05-10",
    timezone: "UTC",
    travelers: 1,
    style: "Comfort",
  };
  client({
    data: [
      {
        ...base,
        id: "mine",
        name: "Mine",
        owner_id: "me",
        private_field: "not serialized",
      },
      { ...base, id: "shared", name: "Shared", owner_id: "someone-else" },
    ],
    error: null,
  });
  const result = await shellTrips("me");
  expect(mocks.select).toHaveBeenCalledWith(
    "id,name,start_date,end_date,timezone,travelers,style,owner_id,creation_state",
  );
  expect(result.trips.map((trip) => [trip.id, trip.shared])).toEqual([
    ["mine", false],
    ["shared", true],
  ]);
  expect(JSON.stringify(result)).not.toContain("private_field");
  expect(JSON.stringify(result)).not.toContain("someone-else");
});
it("distinguishes an empty account from a failed read without exposing database errors", async () => {
  client({ data: [], error: null });
  expect(await shellTrips("me")).toEqual({ trips: [], unavailable: false });
  client({ data: null, error: { message: "private diagnostic details" } });
  expect(await shellTrips("me")).toEqual({ trips: [], unavailable: true });
  mocks.supabase.mockRejectedValue(new Error("Connection failed"));
  expect(await shellTrips("me")).toEqual({ trips: [], unavailable: true });
});
