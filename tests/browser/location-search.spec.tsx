import { test, expect, type Page } from "@playwright/test";
import { build } from "vite";
import { resolve } from "node:path";
import { geographicLocation } from "../../lib/geographic-location";
let bundle: string;
test.use({ hasTouch: true });
const choices = [
  geographicLocation("Victoria", "Australia", -37.47, 144.78, "AU"),
  geographicLocation(
    "Victoria",
    "British Columbia, Canada",
    48.43,
    -123.36,
    "CA",
  ),
];
test.beforeAll(async () => {
  const result = await build({
    configFile: false,
    logLevel: "error",
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    build: {
      write: false,
      minify: false,
      lib: {
        entry: resolve("tests/fixtures/location-search-browser.tsx"),
        formats: ["iife"],
        name: "LocationSearchFixture",
      },
    },
  });
  bundle = (Array.isArray(result) ? result : [result])
    .flatMap((result) => ("output" in result ? result.output : []))
    .filter((item) => item.type === "chunk")
    .map((item) => item.code)
    .join("\n");
});
async function mount(page: Page) {
  await page.goto("/login");
  const styles = await page
    .locator('link[rel="stylesheet"]')
    .evaluateAll((links) =>
      links.map((link) => (link as HTMLLinkElement).href),
    );
  await page.setContent(
    '<html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1">' +
      styles.map((url) => `<link rel="stylesheet" href="${url}">`).join("") +
      '</head><body><div id="fixture-root"></div></body></html>',
  );
  await page.addScriptTag({ content: bundle });
}
test("keyboard selection, context and multiple destinations preserve independent real point IDs", async ({
  page,
}) => {
  let requests = 0;
  await page.route("**/api/locations?**", (route) => {
    requests++;
    expect(new URL(route.request().url()).searchParams.get("scope")).toBe(
      "destination",
    );
    return route.fulfill({
      json: { results: choices, worldwideAvailable: true },
    });
  });
  await mount(page);
  const first = page.getByRole("combobox", { name: "First destination" });
  await first.fill("Victoria");
  await expect(page.getByRole("option")).toHaveCount(2);
  await first.press("ArrowDown");
  await first.press("ArrowDown");
  await expect(first).toHaveAttribute("aria-activedescendant", /-1$/);
  await first.press("Enter");
  await expect(page.locator('input[name="first"]')).toHaveValue(choices[1].id);
  const second = page.getByRole("combobox", { name: "Second destination" });
  await second.fill("Victoria");
  await page.getByRole("option", { name: choices[0].label }).tap();
  await expect(page.locator('input[name="second"]')).toHaveValue(choices[0].id);
  await expect(page.locator('input[name="first"]')).toHaveValue(choices[1].id);
  await first.fill("Victoria");
  await expect(page.getByRole("option")).toHaveCount(2);
  expect(requests).toBe(2); // same picker uses its short-lived successful cache
  await first.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(first).not.toHaveAttribute("aria-activedescendant");
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});
test("Escape during an in-flight request stays closed, and late results cannot replace newer text", async ({
  page,
}) => {
  let respond!: () => Promise<void>;
  await page.route(
    "**/api/locations?**",
    (route) =>
      new Promise<void>((resolve) => {
        respond = async () => {
          await route.fulfill({
            json: { results: choices, worldwideAvailable: true },
          });
          resolve();
        };
      }),
  );
  await mount(page);
  const input = page.getByRole("combobox", { name: "First destination" });
  await input.fill("Victoria");
  await expect.poll(() => typeof respond).toBe("function");
  await input.press("Escape");
  await respond();
  await expect(input).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await input.press("ArrowDown");
  await expect(page.getByRole("option")).toHaveCount(2);
  await input.fill("Vi");
  await expect(page.locator('input[name="first"]')).toHaveValue("");
});
test("failed/empty searches offer a validated manual map point without fabricating a location", async ({
  page,
}) => {
  await page.route("**/api/locations?**", (route) =>
    route.fulfill({ status: 503, json: { error: "unavailable" } }),
  );
  await page.route("**/api/locations", (route) => {
    const data = route.request().postDataJSON();
    return route.fulfill(
      data.position === "9.73, 100.01"
        ? {
            json: { location: geographicLocation(data.name, "", 9.73, 100.01) },
          }
        : { status: 400, json: { error: "Use explicit map pin coordinates." } },
    );
  });
  await mount(page);
  await page
    .getByRole("combobox", { name: "First destination" })
    .fill("Unlisted cove");
  await expect(page.getByText("Location search is unavailable.")).toBeVisible();
  await page
    .getByText("Can’t find it? Add a place from its map position")
    .first()
    .click();
  await page
    .getByLabel("Coordinates or map link")
    .first()
    .fill("Unlisted cove");
  await page.getByRole("button", { name: "Use this location" }).click();
  await expect(page.getByRole("alert")).toContainText("explicit map pin");
  await expect(page.locator('input[name="first"]')).toHaveValue("");
  await page.getByLabel("Coordinates or map link").first().fill("9.73, 100.01");
  await page.getByRole("button", { name: "Use this location" }).click();
  await expect(page.locator('input[name="first"]')).toHaveValue(/^geo:ZZ:/);
  await expect(
    page.getByRole("combobox", { name: "First destination" }),
  ).toBeFocused();
});
