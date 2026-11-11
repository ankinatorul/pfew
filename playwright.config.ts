import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  testMatch: [
    "**/auth-shell.spec.ts",
    "**/navigation-layout.spec.tsx",
    "**/home-layout.spec.tsx",
    "**/trip-overview-layout.spec.tsx",
    "**/trip-management.spec.tsx",
    "**/during-trip-layout.spec.tsx",
    "**/completed-trip-layout.spec.tsx",
    "**/location-search.spec.tsx",
    "**/trip-basics.spec.tsx",
    "**/booking-collection.spec.tsx",
    "**/trip-review.spec.tsx",
    "**/itinerary.spec.tsx",
  ],
  use: {
    baseURL: "http://127.0.0.1:3000",
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
        (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
      args: ["--no-sandbox"],
    },
  },
  webServer: {
    command: "npm run start",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: "mobile", use: { viewport: { width: 375, height: 812 } } },
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
  ],
});
