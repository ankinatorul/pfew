import { afterEach, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  supabase: vi.fn(),
  provider: vi.fn(),
}));
vi.mock("../lib/auth-session", () => ({ currentGoogleUser: mocks.user }));
vi.mock("../lib/supabase", () => ({ supabase: mocks.supabase }));
vi.mock("../lib/packing-ai", () => ({ packingProvider: mocks.provider }));
import { POST } from "../app/api/packing-suggestions/route";
afterEach(() => vi.clearAllMocks());
function request(consent: boolean) {
  return new Request("http://localhost/api/packing-suggestions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      trip_id: "11111111-1111-4111-8111-111111111111",
      list_id: "22222222-2222-4222-8222-222222222222",
      clothing_days: 4,
      consent,
    }),
  });
}
it("requires Google sign-in, consent and a configured provider before any context/provider call", async () => {
  mocks.user.mockResolvedValue(null);
  expect((await POST(request(true))).status).toBe(401);
  mocks.user.mockResolvedValue({ id: "user" });
  expect((await POST(request(false))).status).toBe(400);
  expect(mocks.provider).not.toHaveBeenCalled();
  mocks.provider.mockImplementation(() => {
    throw new Error("not configured");
  });
  const response = await POST(request(true));
  expect(response.status).toBe(503);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(mocks.supabase).not.toHaveBeenCalled();
});
