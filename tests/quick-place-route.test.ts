import { afterEach, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  rpc: vi.fn(),
  details: vi.fn(),
}));
vi.mock("../lib/auth-session", () => ({ currentGoogleUser: mocks.user }));
vi.mock("../lib/supabase", () => ({
  supabase: async () => ({ rpc: mocks.rpc }),
}));
vi.mock("../lib/google-places", () => ({ googlePlaceDetails: mocks.details }));
import { POST } from "../app/api/quick-place/route";
const request = (place_id = "ChIJ12345") =>
  new Request("http://localhost/api/quick-place", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      trip_id: "11111111-1111-4111-8111-111111111111",
      place_id,
    }),
  });
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});
it("requires sign-in, valid IDs, a key and a budget reservation before making a paid lookup", async () => {
  mocks.user.mockResolvedValue(null);
  expect((await POST(request())).status).toBe(401);
  mocks.user.mockResolvedValue({ id: "user" });
  expect((await POST(request("https://evil.example"))).status).toBe(400);
  vi.stubEnv("GOOGLE_PLACES_API_KEY", "");
  expect((await POST(request())).status).toBe(503);
  expect(mocks.details).not.toHaveBeenCalled();
  vi.stubEnv("GOOGLE_PLACES_API_KEY", "test-key");
  mocks.rpc.mockResolvedValue({ data: null, error: { message: "denied" } });
  expect((await POST(request())).status).toBe(429);
  expect(mocks.details).not.toHaveBeenCalled();
});
it("returns only fresh provider data and records failed calls without inventing a result", async () => {
  mocks.user.mockResolvedValue({ id: "user" });
  vi.stubEnv("GOOGLE_PLACES_API_KEY", "test-key");
  mocks.rpc.mockImplementation(async (name: string) =>
    name === "reserve_service"
      ? { data: "reservation", error: null }
      : { error: null },
  );
  mocks.details.mockResolvedValue({ id: "ChIJ12345", name: "Provider result" });
  const result = await POST(request());
  expect(result.status).toBe(200);
  expect(result.headers.get("cache-control")).toContain("no-store");
  expect((await result.json()).result.name).toBe("Provider result");
  expect(mocks.rpc).toHaveBeenCalledWith("finish_service", {
    reservation: "reservation",
    succeeded: true,
  });
  mocks.details.mockRejectedValue(new Error("provider unavailable"));
  expect((await POST(request())).status).toBe(503);
  expect(mocks.rpc).toHaveBeenCalledWith("finish_service", {
    reservation: "reservation",
    succeeded: false,
  });
});
