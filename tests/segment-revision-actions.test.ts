import { it, expect, vi, beforeEach } from "vitest";
import { overviewSegment } from "./fixtures/trip-overview";
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  normalize: vi.fn(),
  refresh: vi.fn(),
  filters: [] as [string, unknown][],
  stale: false,
}));
vi.mock("../lib/access", () => ({ access: mocks.access }));
vi.mock("../lib/automatic-zones", () => ({
  segmentLocationValues: mocks.normalize,
  locationFields: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.refresh }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(url);
  },
}));
import { saveSegment, deleteSegment } from "../app/actions";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.filters = [];
  mocks.stale = false;
  mocks.normalize.mockResolvedValue(overviewSegment());
  mocks.access.mockResolvedValue({
    user: { id: "editor" },
    db: {
      from: (table: string) => {
        const q = {
          select: () => q,
          update: () => q,
          delete: () => q,
          insert: () => q,
          eq: (key: string, value: unknown) => {
            mocks.filters.push([key, value]);
            return q;
          },
          single: async () =>
            table === "trips"
              ? {
                  data: { start_date: "2027-05-01", end_date: "2027-05-10" },
                  error: null,
                }
              : {
                  data: mocks.stale ? null : { id: overviewSegment().id },
                  error: mocks.stale
                    ? { message: "No matching revision" }
                    : null,
                },
        };
        return q;
      },
    },
  });
});
const form = () => {
  const f = new FormData();
  f.set("id", overviewSegment().id);
  f.set("trip_id", overviewSegment().trip_id);
  f.set("itinerary_revision", "3");
  return f;
};
it("destination/detail edits carry a current revision on the same trip without adding an owner-only filter", async () => {
  await expect(saveSegment(form())).rejects.toThrow("/trips/");
  expect(mocks.filters).toContainEqual(["itinerary_revision", 3]);
  expect(mocks.filters).toContainEqual(["trip_id", overviewSegment().trip_id]);
  expect(mocks.filters.some(([key]) => key === "owner_id")).toBe(false);
});
it("missing and stale revisions fail without pretending a save/delete succeeded", async () => {
  const f = form();
  f.delete("itinerary_revision");
  await expect(saveSegment(f)).rejects.toThrow(/Reload/);
  mocks.stale = true;
  await expect(saveSegment(form())).rejects.toThrow(/changed/);
  await expect(deleteSegment(form())).rejects.toThrow(/changed/);
  expect(mocks.refresh).not.toHaveBeenCalled();
});
it("detailed destination deletion uses the submitted revision and existing RLS-scoped trip identity", async () => {
  await expect(deleteSegment(form())).rejects.toThrow("/trips/");
  expect(mocks.filters).toContainEqual(["itinerary_revision", 3]);
  expect(mocks.filters).toContainEqual(["trip_id", overviewSegment().trip_id]);
});
