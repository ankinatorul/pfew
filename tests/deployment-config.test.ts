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
