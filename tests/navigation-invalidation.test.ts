import { afterEach, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  rpc: vi.fn(),
  revalidate: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error("redirect:" + url);
  }),
}));
vi.mock("../lib/access", () => ({ access: mocks.access }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
import { saveTrip } from "../app/actions";
afterEach(() => vi.clearAllMocks());
function tripForm() {
  const form = new FormData();
  Object.entries({
    name: "My next adventure",
    start_date: "2027-05-01",
    end_date: "2027-05-10",
    timezone: "UTC",
    travelers: "1",
    style: "Comfort",
    currency: "EUR",
    budget: "",
  }).forEach(([key, value]) => form.set(key, value));
  return form;
}
it("refreshes the shared trip selector after atomic creation before opening the new trip", async () => {
  mocks.access.mockResolvedValue({
    user: { id: "me" },
    db: { rpc: mocks.rpc },
  });
  mocks.rpc.mockResolvedValue({ data: "created-trip", error: null });
  await expect(saveTrip(tripForm())).rejects.toThrow(
    "redirect:/trips/created-trip",
  );
  expect(mocks.rpc).toHaveBeenCalledWith("create_trip_with_destinations", {
    trip_data: expect.objectContaining({
      name: "My next adventure",
      timezone: "UTC",
      travelers: 1,
      budget: null,
    }),
    destinations: [],
  });
  expect(mocks.revalidate).toHaveBeenCalledWith("/", "layout");
});
it("does not refresh or claim a new trip when creation fails", async () => {
  mocks.access.mockResolvedValue({
    user: { id: "me" },
    db: { rpc: mocks.rpc },
  });
  mocks.rpc.mockResolvedValue({ data: null, error: { code: "FAILED" } });
  await expect(saveTrip(tripForm())).rejects.toThrow("redirect:/error?");
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
