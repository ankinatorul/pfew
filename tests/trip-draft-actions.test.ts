import { beforeEach, afterEach, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  rpc: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("../lib/access", () => ({ access: mocks.access }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { saveTripDraft } from "../app/trip-draft-actions";
import { geographicLocation } from "../lib/geographic-location";
const id = "11111111-1111-4111-8111-111111111111";
const location = geographicLocation(
  "Kyoto",
  "Japan",
  35.01,
  135.77,
  "JP",
  "osm:R:357238",
);
const input = {
  name: "My draft",
  destinations: [location],
  start_date: "2027-06-01",
  end_date: "2027-06-03",
};
beforeEach(() =>
  mocks.access.mockResolvedValue({
    db: { rpc: mocks.rpc },
    user: { id: "owner" },
  }),
);
afterEach(() => vi.clearAllMocks());
it("re-resolves saved location identities, preserves metadata and sends required dates through the owner-scoped RPC", async () => {
  const draft = {
    ...input,
    id,
    draft_data: { destinations: [location] },
    draft_step: 2,
    draft_revision: 1,
    updated_at: "2026-11-06T12:00:00Z",
  };
  mocks.rpc.mockResolvedValue({ data: draft, error: null });
  expect(
    await saveTripDraft(id, 0, {
      ...input,
      destinations: [{ ...location, latitude: 0, timezone: "UTC" }],
    }),
  ).toEqual({ draft: expect.objectContaining({ id }) });
  expect(mocks.rpc).toHaveBeenCalledWith("save_trip_draft", {
    target: id,
    expected_revision: 0,
    basics: input,
  });
  expect(mocks.revalidate).toHaveBeenCalledWith("/trips/new");
});
it("rejects malformed basics and unresolved locations without making writes", async () => {
  expect(await saveTripDraft(id, 0, { ...input, name: "" })).toHaveProperty(
    "error",
  );
  expect(
    await saveTripDraft(id, 0, {
      ...input,
      destinations: [{ ...location, id: "invented" }],
    }),
  ).toHaveProperty("error");
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("reports conflicts, missing migrations and failed saves without redirects or a false success", async () => {
  for (const error of [
    { code: "P0001", message: "This draft changed in another tab" },
    { code: "PGRST202", message: "function not found" },
    { code: "500", message: "private diagnostic" },
  ]) {
    mocks.rpc.mockResolvedValue({ data: null, error });
    const result = await saveTripDraft(id, 1, input);
    expect(result).toHaveProperty("error");
    expect(JSON.stringify(result)).not.toContain("private diagnostic");
  }
  expect(mocks.revalidate).not.toHaveBeenCalled();
});

it("rejects either missing date before any database call", async () => {
  for (const dates of [
    { start_date: null },
    { end_date: null },
    { start_date: "" },
    { end_date: "" },
  ])
    expect(await saveTripDraft(id, 0, { ...input, ...dates })).toHaveProperty(
      "error",
    );
  expect(mocks.access).not.toHaveBeenCalled();
  expect(mocks.rpc).not.toHaveBeenCalled();
});
