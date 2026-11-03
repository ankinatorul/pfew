import { test, expect } from "@playwright/test";
test("configured app protects trips and offers Google sign-in only", async ({
  page,
}) => {
  test.setTimeout(60000);
  const rootCallback = await page.request.get(
    "/?code=11111111-1111-4111-8111-111111111111",
    { maxRedirects: 0 },
  );
  expect(rootCallback.status()).toBe(307);
  const location = new URL(
    rootCallback.headers().location,
    "http://127.0.0.1:3000",
  );
  expect(location.pathname + location.search).toBe(
    "/auth/callback?code=11111111-1111-4111-8111-111111111111",
  );
  const authStatus = await page.request.get("/api/auth/status");
  expect(authStatus.headers()["cache-control"]).toContain("no-store");
  const auth = await authStatus.json();
  if (process.env.VERCEL === "1")
    expect(auth.callbackUrl).toBe("https://pfew.vercel.app/auth/callback");
  expect(["enabled", "disabled", "unknown"]).toContain(auth.google);
  const health = await page.request.get("/api/health");
  expect(health.status()).toBe(200);
  expect(health.headers()["cache-control"]).toContain("no-store");
  const release = await health.json();
  expect(release.release).toBe("phase-4");
  expect(release.modules).toContain("booking-import");
  expect(release.modules).toContain("official-research");
  expect(release.schemaVersionRequired).toBe(10);
  expect(release.modules).toContain("quick-add");
  expect(release.modules).toContain("day-planning");
  expect(release.modules).toContain("schedule-check");
  expect(release.modules).toContain("packing-suggestions");
  expect(release.modules).toContain("prep-suggestions");
  expect(release.modules).toContain("budget-distribution");
  expect(release.modules).toContain("adaptive-home");
  expect(release.modules).toContain("responsive-trip-navigation");
  expect(release.modules).toContain("setup-checks");
  expect(release.modules).toContain("trip-map-locations");
  expect(release.modules).toContain("journey-overview-design");
  expect(release.configuration).toEqual({
    supabaseUrlPresent: true,
    publishableKeyPresent: true,
    siteUrlPresent: true,
  });
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeVisible({ timeout: 10000 }); // Provider fetch may take its bounded five-second timeout before streaming completes.
  await expect(page.getByLabel("Email address")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Open account menu/ }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const google = page.getByRole("button", { name: "Continue with Google" });
  if (await google.isDisabled())
    await expect(page.getByRole("status")).toBeVisible();
  for (const route of [
    "/trips/new",
    "/profile",
    "/profile/checks",
    "/trips/11111111-1111-4111-8111-111111111111",
  ]) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/login$/);
  }
  const response = await page.request.get(
    "/api/attachments/11111111-1111-4111-8111-111111111111",
  );
  expect(response.status()).toBe(401);
  const checks = await page.request.get("/api/setup-checks?document=1");
  expect(checks.status()).toBe(401);
  expect(checks.headers()["cache-control"]).toBe("private, no-store");
});

test("city lookup supplies real time zones and private offline APIs require sign-in", async ({
  page,
}) => {
  const response = await page.request.get("/api/locations?q=Tokyo");
  expect(response.ok()).toBe(true);
  const body = await response.json();
  expect(body.results[0].timezone).toBe("Asia/Tokyo");
  expect(
    (
      await page.request.get(
        "/api/trips/11111111-1111-4111-8111-111111111111/offline",
      )
    ).status(),
  ).toBe(401);
});

test("encrypted copies unlock offline without caching authenticated pages", async ({
  page,
  context,
}) => {
  await page.goto("/offline.html");
  await page.evaluate(async () => {
    // @ts-expect-error Public browser-only ES module.
    const store = await import(/* webpackIgnore: true */ "/offline-store.js");
    await store.saveSnapshot(
      "fixture-user",
      "fixture-trip",
      await store.encryptSnapshot(
        {
          version: 1,
          userId: "fixture-user",
          downloadedAt: new Date().toISOString(),
          trip: {
            name: "Fixture private trip",
            start_date: "2027-05-01",
            end_date: "2027-05-02",
            timezone: "Asia/Tokyo",
            currency: "EUR",
            budget: null,
          },
          trip_segments: [],
          bookings: [
            {
              title: "Fixture reservation",
              reference: "PRIVATE-REF",
              start_date: "2027-05-01",
              end_date: "2027-05-01",
              timezone: "Asia/Tokyo",
            },
          ],
          documents: [],
        },
        "private test passphrase",
      ),
    );
    await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  const cached = await page.evaluate(async () => {
    const cache = await caches.open("pfew-reader-v1");
    return (await cache.keys()).map((item) => new URL(item.url).pathname);
  });
  expect(cached.sort()).toEqual(
    [
      "/offline.html",
      "/offline.js",
      "/offline.css",
      "/offline-store.js",
      "/icon.svg",
      "/icon-192.png",
      "/icon-512.png",
      "/manifest.webmanifest",
    ].sort(),
  );
  await context.setOffline(true);
  await page.goto("/trips/offline-fixture");
  await expect(page.getByText("Saved trip 1", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Fixture private trip", { exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Download passphrase").fill("private test passphrase");
  await page.getByRole("button", { name: "Unlock read-only copy" }).click();
  await expect(
    page.getByText("Fixture private trip", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Reference: PRIVATE-REF", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Lock this copy" }).click();
  await expect(
    page.getByText("Fixture private trip", { exact: true }),
  ).toHaveCount(0);
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Remove encrypted download" }).click();
  await expect(page.getByText(/No offline trips yet/)).toBeVisible();
  await context.setOffline(false);
});

test("booking imports and official research reject signed-out requests", async ({
  page,
}) => {
  for (const route of [
    "/api/booking-import",
    "/api/research",
    "/api/quick-place",
    "/api/packing-suggestions",
    "/api/onboarding/create",
    "/api/onboarding/extract",
  ]) {
    const response = await page.request.post(route, { data: {} });
    expect(response.status()).toBe(401);
    expect(response.headers()["cache-control"]).toContain("no-store");
  }
});
