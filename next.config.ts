import type { NextConfig } from "next";
import { publicDeploymentEnvironment } from "./lib/deployment-config";
const config: NextConfig = {
  env: publicDeploymentEnvironment(
    {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    },
    process.env.VERCEL === "1",
  ),
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
};
export default config;
