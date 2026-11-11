import { tripOverview } from "../../lib/trip-overview";
import { overviewTrip, overviewData } from "../fixtures/trip-overview";
import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { build } from "vite";
import { resolve } from "node:path";
let bundle: string;
test.beforeAll(async () => {
  const result = await build({
    configFile: false,
    logLevel: "error",
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
      REVIEW_OVERVIEW_MODEL: JSON.stringify(
        tripOverview(
          overviewTrip,
          [],
          overviewData(),
          new Date("2027-04-25T12:00:00Z"),
        ),
      ),
    },
    build: {
      write: false,
      minify: false,
      lib: {
        entry: resolve("tests/fixtures/trip-review-browser.tsx"),
        formats: ["iife"],
        name: "ReviewFixture",
      },
    },
  });
  bundle = (Array.isArray(result) ? result : [result])
    .flatMap((r) => ("output" in r ? r.output : []))
    .filter((x) => x.type === "chunk")
    .map((x) => x.code)
    .join("\n");
});
async function mount(page: Page, query = "") {
  page.on("pageerror", (error) =>
    console.error("Review fixture error:", error.message),
  );
  await page.goto("/login" + query);
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
test("review defaults to Balanced, saves all three choices, resumes, and opens the new active trip after a visible success", async ({
  page,
}, info) => {
  await mount(page);
  await expect(page.getByRole("radio", { name: /^Balanced/ })).toBeChecked();
  for (const style of ["Budget", "Premium", "Balanced"]) {
    await page.getByRole("radio", { name: new RegExp("^" + style) }).check();
    await expect(
      page.getByRole("button", { name: "Create my trip", exact: true }),
    ).toBeEnabled();
  }
  await mount(page);
  await expect(page.getByRole("radio", { name: /^Balanced/ })).toBeChecked();
  await expect(
    page.getByText("City Break theme", { exact: true }),
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
  await page.screenshot({
    path: info.outputPath("trip-review.png"),
    fullPage: true,
  });
  const create = page.getByRole("button", {
    name: "Create my trip",
    exact: true,
  });
  await create.evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  await expect(
    page.getByRole("heading", { name: "Your adventure starts here!" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open my trip", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => sessionStorage.getItem("fixture:finalize-calls")),
  ).toBe("1");
  await page.screenshot({
    path: info.outputPath("trip-created.png"),
    fullPage: true,
  });
  await mount(page);
  await expect(
    page.getByRole("heading", { name: "Your adventure starts here!" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open my trip", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Paris weekend", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Finalized fixture count: 1", { exact: true }),
  ).toBeVisible();
  for (const select of await page
    .getByLabel("Current trip", { exact: true })
    .all())
    await expect(select).toHaveValue("11111111-1111-4111-8111-111111111111");
});
test("edit actions preserve style and basics through the three steps; unfinished bookings remain optional", async ({
  page,
}) => {
  await mount(page);
  await page.getByRole("radio", { name: /^Premium/ }).check();
  await expect(
    page.getByRole("button", { name: "Edit trip basics", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Edit trip basics", exact: true })
    .click();
  await expect(page.getByRole("textbox", { name: /Trip name/ })).toHaveValue(
    "Paris weekend",
  );
  await page
    .getByRole("textbox", { name: /Trip name/ })
    .fill("Paris city weekend");
  await page.getByRole("button", { name: /Continue/ }).click();
  await expect(
    page.getByRole("heading", { name: "Got bookings already?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add manually", exact: true }).click();
  await page
    .getByRole("button", { name: "Review / edit", exact: true })
    .click();
  await page
    .getByLabel("Booking name", { exact: true })
    .fill("Saved unfinished transfer");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("radio", { name: /^Premium/ })).toBeChecked();
  await expect(
    page.getByText("0 reviewed · 1 need review", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Saved unfinished transfer", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Edit bookings", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Saved unfinished transfer",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Skip for now", exact: true }).click();
  await page
    .getByRole("button", { name: "Create my trip", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your adventure starts here!" }),
  ).toBeVisible();
  await mount(page);
  await expect(
    page.getByRole("heading", { name: "Your adventure starts here!" }),
  ).toBeVisible();
});
test("failed and stale finalization remain recoverable without creating another trip", async ({
  page,
}) => {
  await mount(page, "?fail=1");
  await page
    .getByRole("button", { name: "Create my trip", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("remain recoverable");
  await page
    .getByRole("button", { name: "Create my trip", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your adventure starts here!" }),
  ).toBeVisible();
  await mount(page, "?draft=88888888-8888-4888-8888-888888888888&stale=1");
  await page
    .getByRole("button", { name: "Create my trip", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("changed in another tab");
  await expect(
    page.getByRole("button", { name: "Create my trip", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("heading", { name: "Your adventure starts here!" }),
  ).toHaveCount(0);
});

async function capturePhase7E(page: Page, info: TestInfo, name: string) {
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur?.();
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: info.outputPath(`phase7e-${name}.png`),
    fullPage: true,
  });
}
async function chooseDestination(page: Page, index: number, query = "Paris") {
  const field = page.getByRole("combobox", {
    name: `Destination ${index}`,
    exact: true,
  });
  await field.fill(query);
  const list = page.getByRole("listbox", {
    name: `Destination ${index} suggestions`,
    exact: true,
  });
  await expect(list).toBeVisible();
  const labels = await list.getByRole("option").allTextContents();
  const selected = labels.findIndex((label) => label.startsWith(query));
  expect(selected).toBeGreaterThanOrEqual(0);
  for (let i = 0; i <= selected; i++) await field.press("ArrowDown");
  await field.press("Enter");
}
async function fitCreateCanvas(
  page: Page,
  original: { width: number; height: number },
) {
  for (const width of [320, 390, 768, 1440, 2560]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const metrics = await page.locator(".app-main").evaluate((node) => {
      const s = getComputedStyle(node),
        r = node.getBoundingClientRect(),
        canvas = node.querySelector(".create-trip")!.getBoundingClientRect();
      return {
        max: s.maxWidth,
        pad: parseFloat(s.paddingLeft),
        available:
          r.width - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight),
        width: canvas.width,
      };
    });
    expect(metrics.max).toBe("none");
    expect(Math.abs(metrics.width - metrics.available)).toBeLessThan(2);
    if (width >= 1024) {
      expect(metrics.pad).toBeGreaterThanOrEqual(24);
      expect(metrics.pad).toBeLessThanOrEqual(32);
    }
  }
  await page.setViewportSize(original);
}
test("Phase 7E complete mixed-booking journey preserves originals, recovers drafts and captures every screen", async ({
  page,
}, info) => {
  const { geographicLocation } = await import("../../lib/geographic-location");
  const choices = [
    geographicLocation("Paris", "France", 48.85, 2.35, "FR"),
    geographicLocation("Kyoto", "Japan", 35.01, 135.77, "JP"),
  ];
  await page.route("**/api/locations?**", (route) =>
    route.fulfill({ json: { results: choices, worldwideAvailable: true } }),
  );
  await mount(page, "?fresh=1&failExtraction=1");
  const name = page.getByRole("textbox", { name: /Trip name/ });
  await name.fill("My two-destination adventure");
  await chooseDestination(page, 1);
  await page
    .getByRole("button", { name: "Add destination", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Destination 2", exact: true }),
  ).toBeFocused();
  await chooseDestination(page, 2, "Kyoto");
  await page
    .getByRole("button", { name: "Move destination 2 up", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Destination 1", exact: true }),
  ).toBeFocused();
  await page.locator("[name=start_date]").fill("2027-06-01");
  await page.locator("[name=end_date]").fill("2027-06-06");
  await fitCreateCanvas(page, info.project.use.viewport!);
  await capturePhase7E(page, info, "step-1");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Got bookings already?" }),
  ).toBeFocused();
  await page.getByLabel("Upload confirmations", { exact: true }).setInputFiles([
    {
      name: "fixture-flight.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 isolated fixture"),
    },
    {
      name: "fixture-stay.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 isolated fixture"),
    },
  ]);
  await expect(page.getByRole("link", { name: /Open saved file/ })).toHaveCount(
    2,
  );
  const first = page.locator("article.collection-entry").first();
  await first
    .getByText("Read or retry reading this saved file", { exact: true })
    .click();
  await first.getByRole("checkbox").check();
  await first
    .getByRole("button", { name: "Read saved file", exact: true })
    .click();
  await expect(page.getByRole("alert")).toBeFocused();
  await expect(page.getByRole("alert")).toContainText(
    "original file is still saved",
  );
  await expect(page.getByRole("link", { name: /Open saved file/ })).toHaveCount(
    2,
  );
  await first
    .getByRole("button", { name: "Read saved file", exact: true })
    .click();
  await expect(
    first.getByRole("heading", { name: "Fixture airline", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add manually", exact: true }).click();
  const manual = page.locator("article.collection-entry").last();
  await expect(
    manual.getByLabel("Booking name", { exact: true }),
  ).toBeFocused();
  await manual
    .getByLabel("Booking name", { exact: true })
    .fill("My reviewed transfer");
  await manual
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption("ground transport");
  await manual.getByLabel("Start date", { exact: true }).fill("2027-06-01");
  await manual.getByLabel("End date", { exact: true }).fill("2027-06-01");
  await manual
    .getByLabel("Currency · three uppercase letters", { exact: true })
    .fill("EUR");
  await manual
    .getByRole("button", { name: "Mark details reviewed", exact: true })
    .click();
  await expect(manual.getByText("Reviewed", { exact: true })).toBeVisible();
  await expect(manual.getByText(/Reservation: unknown/)).toBeVisible();
  await expect(
    page.getByText("3 added · 1 reviewed · 2 need review", { exact: true }),
  ).toBeVisible();
  await page
    .locator(".collection-entry details")
    .evaluateAll((nodes) =>
      nodes.forEach((n) => ((n as HTMLDetailsElement).open = false)),
    );
  await fitCreateCanvas(page, info.project.use.viewport!);
  await capturePhase7E(page, info, "step-2");
  await mount(page, "?choices=1");
  await expect(
    page.getByRole("heading", { name: "Pick up where you left off?" }),
  ).toBeFocused();
  expect(
    await page
      .getByRole("link", { name: "Start a new trip", exact: true })
      .evaluate((n) => getComputedStyle(n).backgroundColor),
  ).toBe("rgb(224, 245, 123)");
  await capturePhase7E(page, info, "draft-recovery");
  const resume = await page
    .getByRole("link", {
      name: "Resume My two-destination adventure",
      exact: true,
    })
    .getAttribute("href");
  const startNew = await page
    .getByRole("link", { name: "Start a new trip", exact: true })
    .getAttribute("href");
  await mount(page, "?" + startNew!.split("?")[1]);
  await expect(page.getByRole("textbox", { name: /Trip name/ })).toHaveValue(
    "",
  );
  await mount(page, "?" + resume!.split("?")[1]);
  await expect(page.locator("article.collection-entry")).toHaveCount(3);
  await expect(page.getByRole("link", { name: /Open saved file/ })).toHaveCount(
    2,
  );
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Make it your kind of trip." }),
  ).toBeFocused();
  await page.getByRole("radio", { name: /^Premium/ }).check();
  await expect(
    page.getByRole("button", { name: "Create my trip", exact: true }),
  ).toBeEnabled();
  await expect(page.getByText("Default theme", { exact: true })).toBeVisible();
  await expect(
    page.getByText("1 reviewed · 2 need review", { exact: true }),
  ).toBeVisible();
  await fitCreateCanvas(page, info.project.use.viewport!);
  await capturePhase7E(page, info, "step-3");
  await page
    .getByRole("button", { name: "Create my trip", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your adventure starts here!" }),
  ).toBeFocused();
  await capturePhase7E(page, info, "success");
  await page.getByRole("button", { name: "Open my trip", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "My two-destination adventure",
      exact: true,
    }),
  ).toBeVisible();
  for (const select of await page
    .getByLabel("Current trip", { exact: true })
    .all())
    await expect(select).toHaveValue("11111111-1111-4111-8111-111111111111");
});
test("Phase 7E keyboard validation, debounced destination search, tap targets and reduced motion remain accessible", async ({
  page,
}, info) => {
  const { geographicLocation } = await import("../../lib/geographic-location");
  let requests = 0;
  await page.route("**/api/locations?**", (route) => {
    requests++;
    return route.fulfill({
      json: {
        results: [geographicLocation("Paris", "France", 48.85, 2.35, "FR")],
        worldwideAvailable: true,
      },
    });
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mount(page, "?fresh=1");
  await expect(
    page.getByRole("heading", { name: "Start with a little possibility." }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("alert")).toBeFocused();
  const destination = page.getByRole("combobox", {
    name: "Destination 1",
    exact: true,
  });
  await expect(destination).toHaveAttribute("aria-invalid", "true");
  await destination.pressSequentially("Paris", { delay: 30 });
  await expect(
    page
      .getByRole("listbox", { name: "Destination 1 suggestions", exact: true })
      .getByRole("option"),
  ).toHaveCount(1);
  expect(requests).toBe(1);
  const popup = page.getByRole("listbox", {
    name: "Destination 1 suggestions",
    exact: true,
  });
  for (const width of [320, 768, 1440, 2560]) {
    await page.setViewportSize({ width, height: 1000 });
    const rect = (await popup.boundingBox())!;
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(width);
    expect(rect.height).toBeLessThanOrEqual(280);
  }
  await page.setViewportSize(info.project.use.viewport!);
  await destination.press("ArrowDown");
  await destination.press("Enter");
  await expect(destination).toBeFocused();
  await expect(destination).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("alert")).toBeFocused();
  await expect(
    page.getByRole("textbox", { name: /Trip name/ }),
  ).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("[name=start_date]")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await page.getByRole("textbox", { name: /Trip name/ }).fill("Paris weekend");
  await page.locator("[name=start_date]").fill("2027-06-01");
  await page.locator("[name=end_date]").fill("2027-06-01");
  await page
    .getByRole("button", { name: "Add destination", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Destination 2", exact: true }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "Remove destination 2", exact: true })
    .click();
  await expect(destination).toBeFocused();
  await page
    .getByRole("button", { name: "Continue", exact: true })
    .evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("fixture:basics-save-calls"),
    ),
  ).toBe("1");
  await page
    .getByRole("button", { name: "Add manually", exact: true })
    .evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
  await expect(page.locator("article.collection-entry")).toHaveCount(1);
  await expect(page.getByLabel("Booking name", { exact: true })).toBeFocused();
  const remove = page.getByRole("button", { name: "Remove", exact: true });
  page.once("dialog", (dialog) => dialog.dismiss());
  await remove.click();
  await expect(remove).toBeFocused();
  await expect(page.locator("article.collection-entry")).toHaveCount(1);
  page.once("dialog", (dialog) => dialog.accept());
  await remove.click();
  await expect(page.locator("article.collection-entry")).toHaveCount(0);
  await expect(page.locator(".collection-counts")).toBeFocused();
  await page.getByRole("button", { name: "Skip for now", exact: true }).click();
  const balanced = page.getByRole("radio", { name: /^Balanced/ });
  await balanced.focus();
  await balanced.press("ArrowRight");
  const premium = page.getByRole("radio", { name: /^Premium/ });
  await expect(premium).toBeChecked();
  await expect(
    page.getByRole("button", { name: "Create my trip", exact: true }),
  ).toBeEnabled();
  await expect(premium).toBeFocused();
  const style = page.locator(".review-style.selected");
  expect(
    await style.evaluate((n) => getComputedStyle(n).outlineStyle),
  ).not.toBe("none");
  expect(
    await style.evaluate((n) => getComputedStyle(n).transitionDuration),
  ).toBe("0s");
  const actionable = page.getByRole("button", {
    name: "Create my trip",
    exact: true,
  });
  expect((await actionable.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await actionable.click();
  await expect(
    page.getByRole("heading", { name: "Your adventure starts here!" }),
  ).toBeFocused();
  await page
    .getByRole("heading", { name: "Your adventure starts here!" })
    .press("Tab");
  await expect(
    page.getByRole("button", { name: "Open my trip", exact: true }),
  ).toBeFocused();
});
