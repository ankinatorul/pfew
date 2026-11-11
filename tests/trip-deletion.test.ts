import { afterEach, beforeEach, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  cleanup: vi.fn(),
  revalidate: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error("redirect:" + url);
  }),
}));
vi.mock("../lib/access", () => ({ access: mocks.access }));
vi.mock("../lib/storage-cleanup", () => ({
  removeBookingFiles: mocks.cleanup,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
import { deleteTrip, saveTrip } from "../app/actions";
import { overviewTrip as trip } from "./fixtures/trip-overview";
let owned: {
  data: { id: string; timezone: string } | null;
  error: { code: string } | null;
};
let privateFiles: { data: boolean | null; error: { code: string } | null };
let deleteError: { code: string } | null;
let calls: [string, ...unknown[]][];
beforeEach(() => {
  calls = [];
  owned = { data: { id: trip.id, timezone: "UTC" }, error: null };
  privateFiles = { data: false, error: null };
  deleteError = null;
  mocks.cleanup.mockResolvedValue(null);
  mocks.access.mockResolvedValue({
    user: { id: "fixture-owner" },
    db: {
      rpc: async (name: string, args: unknown) => {
        calls.push(["rpc", name, args]);
        return privateFiles;
      },
      from: (table: string) => {
        calls.push(["from", table]);
        const query = {
          select: (fields: string) => {
            calls.push(["select", fields]);
            return query;
          },
          eq: (key: string, value: unknown) => {
            calls.push(["eq", key, value]);
            return query;
          },
          single: async () => owned,
          update: (data: unknown) => {
            calls.push(["update", data]);
            return query;
          },
          delete: () => {
            calls.push(["delete"]);
            return query;
          },
          then: (resolve: (result: unknown) => unknown) =>
            Promise.resolve({ error: deleteError }).then(resolve),
        };
        return query;
      },
    },
  });
});
afterEach(() => vi.clearAllMocks());
const form = () => {
  const data = new FormData();
  data.set("id", trip.id);
  return data;
};
it("uses the existing ownership, private-file and storage guards before deleting and refreshing My Trips", async () => {
  await expect(deleteTrip(form())).rejects.toThrow("redirect:/trips");
  expect(calls).toContainEqual(["eq", "owner_id", "fixture-owner"]);
  expect(calls).toContainEqual([
    "rpc",
    "has_other_private_files",
    { target: trip.id },
  ]);
  expect(mocks.cleanup).toHaveBeenCalledOnce();
  expect(mocks.cleanup.mock.calls[0][1]).toBe(trip.id);
  expect(calls).toContainEqual(["delete"]);
  expect(mocks.revalidate).toHaveBeenCalledWith("/", "layout");
  expect(mocks.revalidate.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.redirect.mock.invocationCallOrder[0],
  );
});
it("rejects malformed identifiers without touching stored records", async () => {
  const data = form();
  data.set("id", "invalid");
  expect(await deleteTrip(data)).toMatchObject({
    error: expect.stringContaining("Invalid trip"),
  });
  expect(calls).toEqual([]);
  expect(mocks.cleanup).not.toHaveBeenCalled();
});
it.each(["editor", "viewer"])(
  "does not allow a %s to delete the trip",
  async () => {
    owned = { data: null, error: { code: "PGRST116" } };
    expect(await deleteTrip(form())).toMatchObject({
      error: expect.stringContaining("Only the trip owner"),
    });
    expect(mocks.cleanup).not.toHaveBeenCalled();
    expect(calls.some((call) => call[0] === "delete")).toBe(false);
    expect(mocks.revalidate).not.toHaveBeenCalled();
  },
);
it("preserves the trip when ownership or private-file checks fail", async () => {
  owned.error = { code: "NETWORK" };
  expect(await deleteTrip(form())).toMatchObject({
    error: expect.stringContaining("verify trip ownership"),
  });
  owned.error = null;
  privateFiles.error = { code: "NETWORK" };
  expect(await deleteTrip(form())).toMatchObject({
    error: expect.stringContaining("private document ownership"),
  });
  expect(mocks.cleanup).not.toHaveBeenCalled();
  expect(calls.some((call) => call[0] === "delete")).toBe(false);
});
it("preserves all trip data when another traveler has private attachments", async () => {
  privateFiles.data = true;
  expect(await deleteTrip(form())).toMatchObject({
    error: expect.stringContaining("Other travelers"),
  });
  expect(mocks.cleanup).not.toHaveBeenCalled();
  expect(calls.some((call) => call[0] === "delete")).toBe(false);
});
it("preserves the trip record and reports existing partial-file-cleanup limitations", async () => {
  mocks.cleanup.mockResolvedValue(
    "Files were removed, but metadata cleanup failed. Retry deletion.",
  );
  expect(await deleteTrip(form())).toMatchObject({
    error: expect.stringContaining("Your trip is still saved"),
  });
  expect(calls.some((call) => call[0] === "delete")).toBe(false);
  expect(mocks.redirect).not.toHaveBeenCalled();
});
it("does not claim success or clear selection when the final database deletion fails", async () => {
  deleteError = { code: "FAILED" };
  expect(await deleteTrip(form())).toMatchObject({
    error: expect.stringContaining(
      "attached files may already have been removed",
    ),
  });
  expect(mocks.revalidate).not.toHaveBeenCalled();
  expect(mocks.redirect).not.toHaveBeenCalled();
});
it("retains timezone validation, owner scoping and saving logic for the existing edit form", async () => {
  const data = form();
  for (const [key, value] of Object.entries({
    name: "Edited fixture",
    start_date: trip.start_date,
    end_date: trip.end_date,
    timezone: "Asia/Tokyo",
    travelers: "2",
    style: "Comfort",
    budget: "1000",
    currency: "EUR",
  }))
    data.set(key, value);
  await expect(saveTrip(data)).rejects.toThrow("redirect:/trips/" + trip.id);
  expect(calls).toContainEqual([
    "update",
    expect.objectContaining({ name: "Edited fixture", timezone: "UTC" }),
  ]);
  expect(calls).toContainEqual(["eq", "owner_id", "fixture-owner"]);
  expect(mocks.revalidate).toHaveBeenCalledWith("/", "layout");
});
