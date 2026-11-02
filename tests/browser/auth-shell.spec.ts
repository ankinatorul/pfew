import { test, expect } from "@playwright/test";
test("configured app protects trips and offers Google sign-in only", async ({
  page,
}) => {
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
  ).toBeVisible();
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
