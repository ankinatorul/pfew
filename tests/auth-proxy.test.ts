import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "../proxy";
afterEach(() => vi.unstubAllEnvs());
it("keeps a localhost OAuth code on the configured browser origin despite an internal wildcard URL", async () => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
  const code = "11111111-1111-4111-8111-111111111111";
  const response = await proxy(
    new NextRequest("http://0.0.0.0:3000/?code=" + code, {
      headers: { host: "localhost:3000" },
    }),
  );
  expect(response.headers.get("location")).toBe(
    "http://localhost:3000/auth/callback?code=" + code,
  );
});
it("normalizes a browser wildcard host without allowing a double-slash path to change the destination host", async () => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
  const response = await proxy(
    new NextRequest("http://0.0.0.0:3000//evil.example/?test=1", {
      headers: { host: "0.0.0.0:3000" },
    }),
  );
  const target = new URL(response.headers.get("location")!);
  expect(target.origin).toBe("http://localhost:3000");
  expect(target.searchParams.get("test")).toBe("1");
});
