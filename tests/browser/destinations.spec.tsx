import { geographicLocation } from "../../lib/geographic-location";
import { test, expect, type Page } from "@playwright/test";
import { build } from "vite";
import { resolve } from "node:path";
let bundle: string;
test.beforeAll(async () => {
  const result = await build({
    configFile: false,
    logLevel: "error",
    plugins: [
      {
        name: "destination-fixture-actions",
        enforce: "pre",
        resolveId(id) {
          if (
            /(?:^|\/)app\/(destination-actions|trip-map-actions)(?:\.ts)?$/.test(
              id,
            )
          )
            return resolve("tests/fixtures/destination-actions.ts");
        },
      },
    ],
    resolve: {
      alias: { "next/navigation": resolve("tests/fixtures/map-navigation.ts") },
    },
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
      DESTINATION_FIXTURE: JSON.stringify([
        geographicLocation("Paris", "France", 48, 2, "FR"),
        geographicLocation("Lyon", "France", 45, 4, "FR"),
        geographicLocation("Nice", "France", 43, 7, "FR"),
      ]),
    },
    build: {
      write: false,
      minify: false,
      lib: {
        entry: resolve("tests/fixtures/destinations-browser.tsx"),
        formats: ["iife"],
        name: "DestinationFixture",
      },
    },
  });
  bundle = (Array.isArray(result) ? result : [result])
    .flatMap((r) => ("output" in r ? r.output : []))
    .filter((x) => x.type === "chunk")
    .map((x) => x.code)
    .join("\n");
});
async function mount(page: Page, mode = "editor") {
  await page.route("**/rest/v1/**", (r) => r.abort());
  await page.goto("http://127.0.0.1:3000/login?mode=" + mode);
  const styles = await page
    .locator('link[rel="stylesheet"]')
    .evaluateAll((links) => links.map((l) => (l as HTMLLinkElement).href));
  await page.setContent(
    '<html><head><meta name="viewport" content="width=device-width,initial-scale=1">' +
      styles.map((s) => `<link rel="stylesheet" href="${s}">`).join("") +
      '</head><body><div id="fixture-root"></div></body></html>',
  );
  await page.addScriptTag({
    content: 'globalThis.process={env:{NODE_ENV:"production"},browser:true};',
  });
  await page.addScriptTag({ content: bundle });
  await expect(
    page.getByRole("heading", { name: "Your destinations" }),
  ).toBeVisible();
}
test("cards, correct editor, no duplicate empty state, position fallback and refresh recovery", async ({
  page,
}, info) => {
  await mount(page);
  await expect(page.getByText("Nothing here just yet.")).toHaveCount(0);
  await page.getByRole("button", { name: "Edit Lyon, France" }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Our Lyon stop");
  await dialog.getByRole("button", { name: "Save destination" }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByLabel("Actions for Our Lyon stop").click();
  await page.getByLabel("Move Our Lyon stop to position").selectOption("0");
  await expect(page.locator(".destination-open").first()).toContainText(
    "Our Lyon stop",
  );
  await mount(page);
  await expect(page.locator(".destination-open").first()).toContainText(
    "Our Lyon stop",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `tests/screenshots/destinations/${info.project.name}/cards.png`,
    fullPage: true,
    animations: "disabled",
  });
});
test("keyboard handle and pointer drag reorder without opening the editor", async ({
  page,
}) => {
  await mount(page);
  const handle = page.getByRole("button", { name: "Reorder Paris, France" });
  await handle.focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.locator(".destination-open").first()).toContainText("Lyon");
  const source = await page
      .getByRole("button", { name: "Reorder Paris, France" })
      .boundingBox(),
    target = await page
      .locator(".destination-sort-list>li")
      .last()
      .boundingBox();
  await page.mouse.move(source!.x + 15, source!.y + 15);
  await page.mouse.down();
  await page.mouse.move(source!.x + 15, target!.y + target!.height / 2, {
    steps: 8,
  });
  await page.mouse.up();
  await expect(page.locator(".destination-open").last()).toContainText("Paris");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("mobile long press drags without scrolling or opening an editor", async ({
  browser,
}, info) => {
  test.skip(info.project.name !== "mobile", "Touch-specific check");
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    hasTouch: true,
  });
  const page = await context.newPage();
  try {
    await mount(page);
    const handle = await page
        .getByRole("button", { name: "Reorder Paris, France" })
        .boundingBox(),
      target = await page
        .locator(".destination-sort-list>li")
        .nth(1)
        .boundingBox(),
      cdp = await context.newCDPSession(page);
    const x = handle!.x + 15,
      y = handle!.y + 15;
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y }],
    });
    await page.waitForTimeout(350);
    await expect(page.locator(".is-dragging")).toHaveCount(1);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y: target!.y + target!.height / 2 }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect(page.locator(".destination-open").first()).toContainText(
      "Lyon",
    );
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(await page.evaluate(() => scrollY)).toBe(0);
  } finally {
    await context.close();
  }
});
test("viewer has a read-only destination drawer and no ordering controls", async ({
  page,
}, info) => {
  await mount(page, "viewer");
  await expect(
    page.getByRole("button", { name: "Add destination" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Reorder/ })).toHaveCount(0);
  await page.getByRole("button", { name: "View Paris, France" }).click();
  await expect(
    page.getByRole("button", { name: "Save destination" }),
  ).toHaveCount(0);
  await page.screenshot({
    path: `tests/screenshots/destinations/${info.project.name}/details.png`,
    fullPage: true,
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
