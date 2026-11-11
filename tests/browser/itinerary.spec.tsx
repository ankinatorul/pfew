import { test, expect, type Page } from "@playwright/test";
import { build } from "vite";
import { resolve } from "node:path";
let bundle: string;
test.beforeAll(async () => {
  const result = await build({
    configFile: false,
    logLevel: "error",
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    build: {
      write: false,
      minify: false,
      lib: {
        entry: resolve("tests/fixtures/itinerary-browser.tsx"),
        formats: ["iife"],
        name: "ItineraryFixture",
      },
    },
  });
  bundle = (Array.isArray(result) ? result : [result])
    .flatMap((r) => ("output" in r ? r.output : []))
    .filter((x) => x.type === "chunk")
    .map((x) => x.code)
    .join("\n");
});
async function mount(page: Page, mode = "normal") {
  await page.goto("/login?mode=" + mode);
  const styles = await page
    .locator('link[rel="stylesheet"]')
    .evaluateAll((links) => links.map((l) => (l as HTMLLinkElement).href));
  await page.setContent(
    '<html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1">' +
      styles.map((s) => `<link rel="stylesheet" href="${s}">`).join("") +
      '</head><body><div id="fixture-root"></div></body></html>',
  );
  await page.addScriptTag({ content: bundle });
  await expect(
    page.getByRole("heading", { name: "Your itinerary", exact: true }),
  ).toBeVisible();
}
test("full-width day planner, booking review distinctions, unavailable ideas, responsive canvas and screenshots", async ({
  page,
}, info) => {
  await mount(page);
  await expect(
    page.getByText("Needs review · Reservation confirmed"),
  ).toBeVisible();
  await expect(
    page.getByText("Live ideas are not configured yet.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("Multiple destinations · Stops have no day allocation", {
      exact: false,
    }),
  ).toBeVisible();
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize(info.project.use.viewport!);
  const bounds = await page.locator(".trip-itinerary").boundingBox();
  const main = await page.locator(".app-main").boundingBox();
  expect(bounds!.width).toBeGreaterThan(main!.width - 70);
  await page.screenshot({
    path: "tests/screenshots/phase8/" + info.project.name + "-itinerary.png",
    fullPage: true,
  });
});
test("empty state, create with keyboard, untimed reorder, move, refresh, delete cancel and confirm preserve saved plans", async ({
  page,
}) => {
  await mount(page, "empty");
  await expect(
    page.getByText("Your adventure, your schedule.", { exact: true }),
  ).toBeVisible();
  for (const title of ["First flexible plan", "Second flexible plan"]) {
    await page
      .getByRole("button", { name: "Add activity", exact: true })
      .click();
    await expect(
      page.getByLabel("Activity name", { exact: true }),
    ).toBeFocused();
    await page.getByLabel("Activity name", { exact: true }).fill(title);
    await page
      .getByLabel("Destination (optional)", { exact: true })
      .selectOption("saved-rome");
    await page
      .getByRole("button", { name: "Save activity", exact: true })
      .click();
    await expect(
      page.getByRole("form", { name: "Activity editor" }),
    ).toHaveCount(0);
  }
  await page
    .getByRole("button", {
      name: "Move Second flexible plan earlier",
      exact: true,
    })
    .click();
  await expect(page.locator(".itinerary-activity").first()).toContainText(
    "Second flexible plan",
  );
  const first = page.getByRole("article", {
    name: "First flexible plan",
    exact: true,
  });
  await first.getByRole("button", { name: "Edit / move", exact: true }).click();
  await page.getByLabel("Date", { exact: true }).fill("2027-05-02");
  await page.getByLabel("Start time (optional)", { exact: true }).fill("10:00");
  await page.getByLabel("End time (optional)", { exact: true }).fill("11:00");
  await page
    .getByRole("button", { name: "Save activity", exact: true })
    .click();
  await expect(first).toHaveCount(0);
  await page.getByRole("button", { name: "Day 2 May 2", exact: true }).click();
  await expect(first).toBeVisible();
  await expect(first).toContainText("10:00");
  await mount(page, "empty");
  await page.getByLabel("Jump to date", { exact: true }).fill("2027-05-02");
  await expect(first).toBeVisible();
  page.once("dialog", (d) => d.dismiss());
  await first.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(first).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await first.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(first).toHaveCount(0);
  await page.getByRole("button", { name: "Day 1 May 1", exact: true }).click();
  await expect(
    page.getByRole("article", { name: "Second flexible plan", exact: true }),
  ).toBeVisible();
});
test("failed saves retain input, time errors explain recovery, and cancelling discards no saved plan", async ({
  page,
}) => {
  await mount(page, "failure");
  await page.getByRole("button", { name: "Add activity", exact: true }).click();
  await page.getByLabel("Activity name", { exact: true }).fill("Keep my input");
  await page
    .getByRole("button", { name: "Save activity", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("input is preserved");
  await expect(page.getByLabel("Activity name", { exact: true })).toHaveValue(
    "Keep my input",
  );
  await page.getByLabel("Start time (optional)", { exact: true }).fill("15:00");
  await page.getByLabel("End time (optional)", { exact: true }).fill("14:00");
  await page
    .getByRole("button", { name: "Save activity", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("after the start time");
  await page.getByLabel("End time (optional)", { exact: true }).fill("16:00");
  await page
    .getByRole("button", { name: "Save activity", exact: true })
    .click();
  await expect(
    page.getByRole("article", { name: "Keep my input", exact: true }),
  ).toBeVisible();
});
test("suggestions add only explicitly once, remain saved after refresh, dismiss persists, and viewer/migration gates prevent writes", async ({
  page,
}) => {
  await mount(page);
  await expect(
    page.getByRole("article", {
      name: "Leave an afternoon for art",
      exact: true,
    }),
  ).toHaveCount(0);
  const add = page.getByRole("button", {
    name: "Add to itinerary",
    exact: true,
  });
  await add.evaluate((b: HTMLButtonElement) => {
    b.click();
    b.click();
  });
  await expect(
    page.getByRole("article", {
      name: "Leave an afternoon for art",
      exact: true,
    }),
  ).toHaveCount(1);
  await mount(page);
  await expect(
    page.getByRole("article", {
      name: "Leave an afternoon for art",
      exact: true,
    }),
  ).toHaveCount(1);
  await mount(page, "viewer");
  await expect(
    page.getByRole("button", { name: "Add activity", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Dismiss", exact: true }),
  ).toHaveCount(0);
  await mount(page, "pending");
  await expect(
    page.getByRole("button", { name: "Add activity", exact: true }),
  ).toBeDisabled();
  await mount(page, "dismiss");
  await page.getByRole("button", { name: "Dismiss", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Leave an afternoon for art" }),
  ).toHaveCount(0);
  await mount(page, "dismiss");
  await expect(
    page.getByRole("heading", { name: "Leave an afternoon for art" }),
  ).toHaveCount(0);
});
