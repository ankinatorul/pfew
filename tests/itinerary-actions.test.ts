import { beforeEach, afterEach, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  rpc: vi.fn(),
  provider: vi.fn(),
  suggest: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("../lib/access", () => ({ access: mocks.access }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("../lib/ai", () => ({ aiProvider: mocks.provider }));
import {
  changeItinerary,
  exploreItineraryIdeas,
} from "../app/itinerary-actions";
import {
  overviewTrip,
  overviewSegment,
  overviewBooking,
} from "./fixtures/trip-overview";
const input = {
  requestId: "99999999-9999-4999-8999-999999999999",
  day: overviewTrip.start_date,
  destination: "",
  interests: "Art and quiet places",
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("AI_MODE", "live");
  vi.stubEnv("AI_API_KEY", "fixture-only");
  mocks.provider.mockReturnValue({ suggest: mocks.suggest });
  mocks.suggest.mockResolvedValue([
    {
      title: "A flexible afternoon",
      note: "Consider a walk if it fits.",
      category: "relaxation",
    },
  ]);
  mocks.rpc.mockImplementation(async (name: string) => ({
    data:
      name === "reserve_itinerary_ideas"
        ? { id: "reservation", created: true, outcome: "reserved" }
        : { message: "Saved." },
    error: null,
  }));
  mocks.access.mockResolvedValue({
    user: { id: "fixture-owner" },
    db: {
      rpc: mocks.rpc,
      from: (table: string) => {
        const data =
          table === "trips"
            ? { ...overviewTrip, creation_state: "finalized" }
            : table === "trip_segments"
              ? [overviewSegment({ kind: "activity" })]
              : [overviewBooking({ notes: "PRIVATE", reference: "PRIVATE" })];
        const chain = {
          select: () => chain,
          eq: () => chain,
          single: async () => ({ data, error: null }),
          then: (resolve: (v: unknown) => unknown) =>
            Promise.resolve({ data, error: null }).then(resolve),
        };
        return chain;
      },
    },
  });
});
afterEach(() => vi.unstubAllEnvs());
it("rejects malformed commands and invalid dates before a write RPC", async () => {
  const bad = await changeItinerary("invalid", {
    op: "delete",
    id: crypto.randomUUID(),
    revision: 0,
  });
  expect(bad.error).toBeTruthy();
  expect(mocks.access).not.toHaveBeenCalled();
  const activity = {
    id: crypto.randomUUID(),
    revision: 0,
    title: "Keep input",
    day: "2028-01-01",
    start: "",
    end: "",
    location: "",
    notes: "",
    category: "" as const,
    destination: "",
  };
  expect(
    (await changeItinerary(overviewTrip.id, { op: "save", input: activity }))
      .error,
  ).toContain("within");
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("returns recoverable errors without reporting success or refreshing saved views", async () => {
  mocks.rpc.mockResolvedValue({
    data: null,
    error: { code: "PGRST202", message: "function missing" },
  });
  expect(
    (
      await changeItinerary(overviewTrip.id, {
        op: "delete",
        id: crypto.randomUUID(),
        revision: 0,
      })
    ).error,
  ).toContain("014");
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
it("uses no mock fallback, provider call or quota reservation when live AI is unavailable", async () => {
  vi.stubEnv("AI_API_KEY", "");
  const result = await exploreItineraryIdeas(overviewTrip.id, input);
  expect(result.error).toContain("not configured");
  expect(mocks.provider).not.toHaveBeenCalled();
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("sends saved style/day/itinerary and reviewed booking context without booking references; saves suggestions without changing plans", async () => {
  const result = await exploreItineraryIdeas(overviewTrip.id, input);
  expect(result.error).toBeUndefined();
  expect(mocks.provider).toHaveBeenCalledWith("live");
  const context = mocks.suggest.mock.calls[0][0];
  expect(context.style).toBe("Balanced");
  expect(context.selectedDay).toBe(input.day);
  expect(context.request).toBe(input.interests);
  expect(JSON.stringify(context)).not.toContain("PRIVATE");
  expect(mocks.rpc.mock.calls.map((c) => c[0])).toEqual([
    "reserve_itinerary_ideas",
    "persist_itinerary_ideas",
  ]);
  expect(mocks.rpc.mock.calls[1][1].source_context.style).toBe("Balanced");
});
it.each(["reserved", "succeeded", "failed"])(
  "does not request another paid response on a %s retry",
  async (outcome) => {
    mocks.rpc.mockResolvedValue({
      data: { created: false, outcome, id: "same-reservation" },
      error: null,
    });
    const result = await exploreItineraryIdeas(overviewTrip.id, input);
    expect(mocks.provider).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledOnce();
    if (outcome === "succeeded") expect(result.message).toContain("No new AI");
    else expect(result.error).toBeTruthy();
  },
);
it("provider failures release the reservation as failed and preserve existing suggestions and plans", async () => {
  mocks.suggest.mockRejectedValue(new Error("Network error"));
  const result = await exploreItineraryIdeas(overviewTrip.id, input);
  expect(result.error).toContain("unchanged");
  expect(mocks.rpc.mock.calls.map((c) => c[0])).toEqual([
    "reserve_itinerary_ideas",
    "finish_service",
  ]);
  expect(mocks.rpc.mock.calls[1][1].succeeded).toBe(false);
});
