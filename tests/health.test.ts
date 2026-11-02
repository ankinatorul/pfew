import { afterEach, it, expect, vi } from "vitest";
import { GET } from "../app/api/health/route";
afterEach(() => vi.unstubAllEnvs());
it("reports missing configuration without claiming database readiness", async () => {
  for (const name of [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_SITE_URL",
  ])
    vi.stubEnv(name, "");
  const response = await GET();
  const data = await response.json();
  expect(data.configuration).toEqual({
    supabaseUrlPresent: false,
    publishableKeyPresent: false,
    siteUrlPresent: false,
  });
  expect(data.scope).toContain("not checked");
  expect(response.headers.get("Cache-Control")).toBe("no-store");
});
it("never returns credential values or user data", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-key-not-for-output");
  vi.stubEnv("VERCEL_TOKEN", "test-token-not-for-output");
  vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "test-deployment-sha");
  const response = await GET();
  const body = await response.text();
  expect(body).not.toContain("test-key-not-for-output");
  expect(body).not.toContain("test-token-not-for-output");
  expect(JSON.parse(body).commit).toBe("test-deployment-sha");
});
