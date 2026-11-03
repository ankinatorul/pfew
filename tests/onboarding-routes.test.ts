import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  db: vi.fn(),
  extract: vi.fn(),
}));
vi.mock("../lib/auth-session", () => ({ currentGoogleUser: mocks.user }));
vi.mock("../lib/supabase", () => ({ supabase: mocks.db }));
vi.mock("../lib/booking-extraction", () => ({
  liveBookingExtractor: () => ({ extract: mocks.extract }),
  extractLabeledText: vi.fn(),
}));
import { POST as extract } from "../app/api/onboarding/extract/route";
import { POST as create } from "../app/api/onboarding/create/route";
import { emptyCandidate } from "../lib/onboarding";
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});
const request = (data: unknown) =>
  new Request("https://pfew.vercel.app/api/onboarding/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
const input = () => ({
  requestId: crypto.randomUUID(),
  name: "A trip",
  start: "2027-06-12",
  end: "2027-06-26",
  timezone: "Europe/Bucharest",
  travelers: 1,
  style: "Comfort",
  currency: "EUR",
  budget: null,
  destinations: [],
  bookings: [],
  interests: [],
});
it("requires Google auth before any extraction or trip creation", async () => {
  mocks.user.mockResolvedValue(null);
  expect(
    (
      await extract(
        new Request("https://pfew.vercel.app/api/onboarding/extract", {
          method: "POST",
        }),
      )
    ).status,
  ).toBe(401);
  expect((await create(request(input()))).status).toBe(401);
  expect(mocks.db).not.toHaveBeenCalled();
  expect(mocks.extract).not.toHaveBeenCalled();
});
it("requires consent and a live provider without spending request budget", async () => {
  mocks.user.mockResolvedValue({ id: "user" });
  const f = new FormData();
  expect(
    (
      await extract(
        new Request("https://pfew.vercel.app/api/onboarding/extract", {
          method: "POST",
          body: f,
        }),
      )
    ).status,
  ).toBe(400);
  f.set("consent", "yes");
  vi.stubEnv("AI_MODE", "");
  expect(
    (
      await extract(
        new Request("https://pfew.vercel.app/api/onboarding/extract", {
          method: "POST",
          body: f,
        }),
      )
    ).status,
  ).toBe(503);
  expect(mocks.db).not.toHaveBeenCalled();
  expect(mocks.extract).not.toHaveBeenCalled();
});
it("keeps reviewed incomplete sources private and does not turn review into reservation confirmation", async () => {
  mocks.user.mockResolvedValue({ id: "user" });
  const rpc = vi.fn().mockResolvedValue({ data: "created", error: null });
  mocks.db.mockResolvedValue({
    rpc,
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: {
              id: "created",
              name: "A trip",
              start_date: "2027-06-12",
              end_date: "2027-06-26",
            },
            error: null,
          }),
        }),
      }),
    }),
  });
  const pending = { ...emptyCandidate(), reviewed: true };
  const full = {
    ...emptyCandidate(),
    reviewed: true,
    fields: {
      ...emptyCandidate().fields,
      title: "Only a flight",
      category: "flight",
      start_date: "2027-06-12",
      end_date: "2027-06-12",
      currency: "EUR",
    },
  };
  const response = await create(
    request({ ...input(), bookings: [pending, full] }),
  );
  expect(response.status).toBe(200);
  const params = rpc.mock.calls[0][1];
  expect(params.approved_bookings).toHaveLength(1);
  expect(params.approved_bookings[0].verification).toBe("unverified");
  expect(params.preferences.pending_bookings).toHaveLength(1);
  expect(response.headers.get("cache-control")).toContain("no-store");
});
it("rejects unreviewed included imports before database writes", async () => {
  mocks.user.mockResolvedValue({ id: "user" });
  expect(
    (await create(request({ ...input(), bookings: [emptyCandidate()] })))
      .status,
  ).toBe(400);
  expect(mocks.db).not.toHaveBeenCalled();
});
it("keeps an interrupted database save retryable and excludes raw exception details", async () => {
  mocks.user.mockResolvedValue({ id: "user" });
  mocks.db.mockResolvedValue({
    rpc: vi.fn().mockRejectedValue(new Error("private transport diagnostic")),
  });
  const response = await create(request(input()));
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("private transport diagnostic");
});
