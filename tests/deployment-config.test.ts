import { it, expect } from "vitest";
import { publicDeploymentEnvironment } from "../lib/deployment-config";
it("configures Pfew when the Vercel dashboard values are missing or blank", () => {
  for (const env of [
    {},
    {
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
      NEXT_PUBLIC_SITE_URL: "",
    },
  ]) {
    const result = publicDeploymentEnvironment(env);
    expect(result.NEXT_PUBLIC_SUPABASE_URL).toBe(
      "https://saxraiqvelmeoeazaccd.supabase.co",
    );
    expect(result.NEXT_PUBLIC_SITE_URL).toBe("https://pfew.vercel.app");
    expect(
      result.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.startsWith("sb_publishable_"),
    ).toBe(true);
  }
});
it("preserves explicit environment overrides, including local callback origins", () => {
  const custom = {
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-public-override",
    NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
  };
  expect(publicDeploymentEnvironment(custom)).toEqual(custom);
});

it("prevents localhost or invalid callback origins on Vercel", () => {
  for (const value of [
    "http://localhost:3000",
    "https://localhost:3000",
    "https://127.0.0.1",
    "https://[::1]",
    "not a URL",
    "http://pfew.vercel.app",
  ])
    expect(
      publicDeploymentEnvironment({ NEXT_PUBLIC_SITE_URL: value }, true)
        .NEXT_PUBLIC_SITE_URL,
    ).toBe("https://pfew.vercel.app");
});
it("preserves valid production domains and normalizes their origin", () => {
  expect(
    publicDeploymentEnvironment(
      { NEXT_PUBLIC_SITE_URL: "https://travel.example.com/path" },
      true,
    ).NEXT_PUBLIC_SITE_URL,
  ).toBe("https://travel.example.com");
});
