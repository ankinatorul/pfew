import { test, expect } from "@playwright/test";
test("unconfigured workflow clearly explains setup without fake authentication", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/setup$/);
  await expect(
    page.getByRole("heading", { name: /Your next chapter/ }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/setup-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("link", { name: "Continue to sign in" }).click();
  await expect(
    page.getByRole("heading", { name: "Let’s get connected." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "New trip" }).click();
  await expect(page).toHaveURL(/\/setup$/);
});
