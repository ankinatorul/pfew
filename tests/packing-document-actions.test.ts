import { it, expect, vi, beforeEach } from "vitest";
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  rpc: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("../lib/access", () => ({ access: mocks.access }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.refresh }));
import { changePacking, changeReminder } from "../app/packing-document-actions";
import { overviewTrip } from "./fixtures/trip-overview";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({ db: { rpc: mocks.rpc } });
  mocks.rpc.mockResolvedValue({ data: { message: "Saved." }, error: null });
});
it("validates items before a write and returns schema/stale errors without false success", async () => {
  const input = {
    id: crypto.randomUUID(),
    revision: 0,
    list_id: crypto.randomUUID(),
    title: "",
    category: "Other",
    quantity: 1,
    notes: "",
  };
  expect(
    (await changePacking(overviewTrip.id, { op: "save", input })).error,
  ).toBeTruthy();
  expect(mocks.rpc).not.toHaveBeenCalled();
  mocks.rpc.mockResolvedValue({
    data: null,
    error: { code: "PGRST202", message: "missing" },
  });
  expect(
    (
      await changePacking(overviewTrip.id, {
        op: "save",
        input: { ...input, title: "Cable" },
      })
    ).error,
  ).toContain("016");
  expect(mocks.refresh).not.toHaveBeenCalled();
});
it("saves only explicit reminder actions, using existing tasks and no notification services", async () => {
  const input = {
    id: crypto.randomUUID(),
    revision: 0,
    title: "Finish packing",
    category: "Other" as const,
    due_date: "",
    done: false,
  };
  await changeReminder(overviewTrip.id, input);
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith(
    "change_preparation_reminder",
    { target: overviewTrip.id, fields: input, remove: false },
  );
  expect(mocks.refresh).toHaveBeenCalledWith("/");
});
