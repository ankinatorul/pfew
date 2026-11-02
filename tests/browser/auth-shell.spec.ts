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
  expect(release.release).toBe("phase-2");
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
    "/trips/11111111-1111-4111-8111-111111111111",
  ]) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/login$/);
  }
  const response = await page.request.get(
    "/api/attachments/11111111-1111-4111-8111-111111111111",
  );
  expect(response.status()).toBe(401);
});
