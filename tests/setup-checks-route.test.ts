import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  supabase: vi.fn(),
  checks: vi.fn(),
  google: vi.fn(),
}));
vi.mock("../lib/auth-session", () => ({ currentGoogleUser: mocks.user }));
vi.mock("../lib/supabase", () => ({ supabase: mocks.supabase }));
vi.mock("../lib/setup-checks", () => ({ runSetupChecks: mocks.checks }));
vi.mock("../lib/auth-providers", () => ({
  authProviderDiagnostics: mocks.google,
}));
import { GET } from "../app/api/setup-checks/route";
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});
it("requires a verified Google session before inspecting any configuration/database", async () => {
  mocks.user.mockResolvedValue(null);
  const response = await GET(
    new Request("https://pfew.vercel.app/api/setup-checks?document=1"),
  );
  expect(response.status).toBe(401);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("vary")).toBe("Cookie");
  expect(mocks.supabase).not.toHaveBeenCalled();
  expect(mocks.checks).not.toHaveBeenCalled();
});
it("passes presence booleans, the current account and explicit document opt-in without private key values", async () => {
  mocks.user.mockResolvedValue({ id: "verified-user" });
  mocks.supabase.mockResolvedValue({ currentUserClient: true });
  mocks.checks.mockResolvedValue({ checks: [] });
  vi.stubEnv("AI_API_KEY", "private-test-ai-key");
  vi.stubEnv("AI_MODE", "live");
  vi.stubEnv("GOOGLE_PLACES_API_KEY", "private-test-places-key");
  const response = await GET(
    new Request(
      "https://pfew.vercel.app/api/setup-checks?document=1&user=other",
    ),
  );
  expect(response.status).toBe(200);
  const options = mocks.checks.mock.calls[0][0];
  expect(options).toMatchObject({
    userId: "verified-user",
    includeDocument: true,
    configuration: { ai: true, places: true },
  });
  expect(JSON.stringify(options)).not.toContain("private-test");
  expect(await response.json()).toEqual({ checks: [] });
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});
it("does not expose raw database exceptions", async () => {
  mocks.user.mockResolvedValue({ id: "verified-user" });
  mocks.supabase.mockRejectedValue(new Error("secret database credential"));
  const response = await GET(
    new Request("https://pfew.vercel.app/api/setup-checks"),
  );
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("secret");
});
