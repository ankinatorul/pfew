import { test, expect, type Page } from "@playwright/test";
import { build } from "vite";
import { resolve } from "node:path";
let bundle: string;
let css = "";
test.beforeAll(async () => {
  const result = await build({
    configFile: false,
    logLevel: "error",
    plugins: [
      {
        name: "isolated-map-actions",
        enforce: "pre",
        resolveId(id) {
          if (/(?:^|\/)app\/trip-map-actions(?:\.ts)?$/.test(id))
            return resolve("tests/fixtures/map-actions.ts");
        },
      },
    ],
    resolve: {
      alias: {
        "next/navigation": resolve("tests/fixtures/map-navigation.ts"),
        [resolve("app/trip-map-actions.ts")]: resolve(
          "tests/fixtures/map-actions.ts",
        ),
      },
    },
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    build: {
      write: false,
      minify: false,
      lib: {
        entry: resolve("tests/fixtures/trip-map-browser.tsx"),
        formats: ["iife"],
        name: "MapFixture",
      },
      rollupOptions: { output: { inlineDynamicImports: true } },
    },
  });
  css = (Array.isArray(result) ? result : [result])
    .flatMap((r) => ("output" in r ? r.output : []))
    .filter((x) => x.type === "asset" && x.fileName.endsWith(".css"))
    .map((x) => (x.type === "asset" ? String(x.source) : ""))
    .join("\n");
  bundle = (Array.isArray(result) ? result : [result])
    .flatMap((r) => ("output" in r ? r.output : []))
    .filter((x) => x.type === "chunk")
    .map((x) => x.code)
    .join("\n");
});
async function mount(page: Page, mode = "card", fail = false) {
  await page.route("**/rest/v1/**", (r) => r.abort()); // Never write/read connected trip fixtures.
  if (fail)
    await page.route("https://tiles.openfreemap.org/**", (r) => r.abort());
  await page.goto("/login?mode=" + mode);
  const styles = await page
    .locator('link[rel="stylesheet"]')
    .evaluateAll((links) => links.map((l) => (l as HTMLLinkElement).href));
  await page.setContent(
    '<html><head><meta name="viewport" content="width=device-width,initial-scale=1">' +
      styles.map((h) => `<link rel="stylesheet" href="${h}">`).join("") +
      '</head><body><div id="fixture-root"></div></body></html>',
  );
  await page.addStyleTag({ content: css });
  await page.addScriptTag({
    content: 'globalThis.process={env:{NODE_ENV:"production"},browser:true};',
  });
  await page.addScriptTag({ content: bundle });
}
test("real MapLibre dashboard, numbered selection, expand link and responsive width", async ({
  page,
}, info) => {
  await mount(page);
  await expect(
    page.getByRole("heading", { name: "Your trip map" }),
  ).toBeVisible();
  await expect(page.locator(".maplibregl-canvas")).toBeVisible({
    timeout: 20000,
  });
  await expect(page.getByRole("button", { name: "Retry map" })).toHaveCount(0);
  await expect(page.getByText("Opening your trip map…")).toHaveCount(0, {
    timeout: 20000,
  });
  await page.getByRole("button", { name: "1 Bangkok", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "1 Bangkok", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".pfew-map-label")).toHaveText("Bangkok");
  await expect(page.getByRole("link", { name: /Expand map/ })).toHaveAttribute(
    "href",
    /view=map/,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `tests/screenshots/trip-map/${info.project.name}/dashboard.png`,
    fullPage: true,
    animations: "disabled",
  });
});
test("expanded map has selectable linked items and usable mobile sheet without overflow", async ({
  page,
}, info) => {
  await mount(page, "explorer");
  if (info.project.name === "mobile")
    await page.getByRole("button", { name: /Destinations & places/ }).click();
  await page.getByRole("button", { name: "3 Koh Lanta", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "View booking" }),
  ).toHaveAttribute("href", /view=bookings&edit=/);
  await page.getByRole("checkbox", { name: "Connect pins" }).uncheck();
  await expect(page.locator(".pfew-map-label")).toHaveText("Koh Lanta", {
    timeout: 20000,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `tests/screenshots/trip-map/${info.project.name}/explorer.png`,
    fullPage: true,
    animations: "disabled",
  });
});
test("provider failure keeps the dashboard and ordered destinations usable", async ({
  page,
}) => {
  await mount(page, "card", true);
  await expect(page.getByRole("button", { name: "Retry map" })).toBeVisible({
    timeout: 20000,
  });
  await expect(
    page.getByRole("button", { name: "2 Krabi", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "2 Krabi", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "2 Krabi", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});
