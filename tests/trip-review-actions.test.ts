import { beforeEach, afterEach, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  rpc: vi.fn(),
  single: vi.fn(),
  eq: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("../lib/access", () => ({ access: mocks.access }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { saveTripReview, finalizeTripDraft } from "../app/trip-review-actions";
import { geographicLocation } from "../lib/geographic-location";
const id = "11111111-1111-4111-8111-111111111111";
let trip: Record<string, unknown>;
const input = { id, revision: 1, style: "Balanced", bookings: [] };
beforeEach(() => {
  trip = {
    id,
    owner_id: "owner",
    creation_state: "draft",
    name: "Paris weekend",
    start_date: "2027-06-01",
    end_date: "2027-06-06",
    style: "Comfort",
    draft_revision: 1,
    draft_data: {
      destinations: [geographicLocation("Paris", "France", 48.85, 2.35, "FR")],
    },
  };
  const query = { select: () => query, eq: mocks.eq, single: mocks.single };
  mocks.eq.mockReturnValue(query);
  mocks.single.mockImplementation(async () => ({ data: trip, error: null }));
  mocks.access.mockResolvedValue({
    user: { id: "owner" },
    db: { from: () => query, rpc: mocks.rpc },
  });
  mocks.rpc.mockImplementation(async (name, args) => ({
    data: {
      ...trip,
      draft_revision: 2,
      style: args.tier,
      theme: args.assigned_theme || "Default",
      creation_state: name === "finalize_trip_draft" ? "finalized" : "draft",
    },
    error: null,
  }));
});
afterEach(() => vi.clearAllMocks());
it("revalidates required basics and canonical locations before any mutation", async () => {
  for (const change of [
    { start_date: null },
    { end_date: "" },
    { end_date: "2026-01-01" },
    { name: "" },
    { draft_data: { destinations: [] } },
  ]) {
    const old = { ...trip };
    Object.assign(trip, change);
    expect(await finalizeTripDraft(input)).toHaveProperty("error");
    trip = old;
  }
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("saves approved styles without modifying money or requesting AI, and finalizes with the reviewed booking stamp", async () => {
  for (const [style, tier] of [
    ["Budget", "Budget"],
    ["Balanced", "Comfort"],
    ["Premium", "Luxury"],
  ]) {
    expect(await saveTripReview({ ...input, style })).toMatchObject({
      style,
      finalized: false,
    });
    expect(mocks.rpc).toHaveBeenLastCalledWith("save_trip_review", {
      target: id,
      expected_revision: 1,
      tier,
    });
  }
  expect(await finalizeTripDraft(input)).toMatchObject({
    id,
    theme: "City Break",
    finalized: true,
  });
  expect(mocks.eq).toHaveBeenCalledWith("owner_id", "owner");
  expect(mocks.rpc).toHaveBeenLastCalledWith("finalize_trip_draft", {
    target: id,
    expected_revision: 1,
    tier: "Comfort",
    expected_bookings: [],
    assigned_theme: "City Break",
  });
  expect(mocks.revalidate).toHaveBeenCalledWith("/", "layout");
});
it("reports unavailable migrations, stale review and failure without claiming success or navigating away", async () => {
  for (const [code, message] of [
    ["PGRST202", "missing rpc"],
    ["40001", "Bookings changed. Reload"],
    ["23514", "invalid reviewed booking"],
  ]) {
    mocks.rpc.mockResolvedValue({ data: null, error: { code, message } });
    const result = await finalizeTripDraft(input);
    expect(result).toHaveProperty("error");
    expect(result).not.toHaveProperty("finalized");
  }
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
it("rejects an unknown owner row and accepts only a confirmed finalized response on retry", async () => {
  mocks.single.mockResolvedValueOnce({ data: null, error: null });
  expect(await finalizeTripDraft(input)).toHaveProperty("error");
  expect(mocks.rpc).not.toHaveBeenCalled();
  trip.creation_state = "finalized";
  trip.draft_data = {
    ...(trip.draft_data as object),
    finalization_receipt: {},
  };
  expect(await finalizeTripDraft(input)).toMatchObject({ id, finalized: true });
  mocks.rpc.mockResolvedValue({
    data: { ...trip, creation_state: "draft" },
    error: null,
  });
  expect(await finalizeTripDraft(input)).toHaveProperty("error");
});
