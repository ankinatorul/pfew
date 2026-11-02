import { test, expect } from "@playwright/test";
test("configured app protects trips and renders both sign-in methods", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Email me a sign-in link" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByLabel("Email address").fill("invalid");
  expect(
    await page
      .getByLabel("Email address")
      .evaluate((e: HTMLInputElement) => e.checkValidity()),
  ).toBe(false);
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
